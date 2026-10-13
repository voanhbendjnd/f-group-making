package tech.djnd.sample.app.service;

import org.springframework.cache.CacheManager;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tech.djnd.sample.app.domain.Authority;
import tech.djnd.sample.app.domain.User;
import tech.djnd.sample.app.repository.AuthorityRepository;
import tech.djnd.sample.app.repository.UserRepository;
import tech.djnd.sample.app.security.AuthoritiesConstants;
import tech.djnd.sample.app.service.dto.ResetKeyVerifyDTO;
import tech.djnd.sample.app.service.dto.UserDTO;
import tech.djnd.sample.app.service.errors.AccessDeniedException;
import tech.djnd.sample.app.service.errors.BadRequestResourceException;
import tech.djnd.sample.app.service.errors.DataResourceNotFoundException;
import tech.djnd.sample.app.web.rest.errors.LoginAlreadyUsedException;
import tech.jhipster.security.RandomUtil;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Transactional
public class UserService {
    private static final long ACTIVATION_KEY_VALIDITY_DAYS = 3;

    private final UserRepository userRepository;
    private final CacheManager cacheManager;
    private final PasswordEncoder passwordEncoder;
    private final AuthorityRepository authorityRepository;
    public UserService(UserRepository userRepository,
                       CacheManager cacheManager,
                       PasswordEncoder passwordEncoder,
                       AuthorityRepository authorityRepository) {
        this.userRepository = userRepository;
        this.cacheManager = cacheManager;
        this.passwordEncoder = passwordEncoder;
        this.authorityRepository = authorityRepository;
    }
    public User registerUser(UserDTO dto, String password) {
        String normalizedEmail = dto.getEmail().trim().toLowerCase(Locale.ENGLISH);
        userRepository.findOneByEmail(normalizedEmail).ifPresent(existingUser -> {
            boolean removed = this.removeNoneActivatedUser(existingUser);
            if(!removed){
                throw new LoginAlreadyUsedException();
            }
        });
        User newUser = new User();
        newUser.setEmail(normalizedEmail);
        String encryptedPassword = passwordEncoder.encode(password);
        newUser.setPassword(encryptedPassword);
        newUser.setActivated(false);
        Set<Authority> authorities = new HashSet<>();
        authorityRepository.findById(AuthoritiesConstants.STUDENT).ifPresent(authorities::add);
        newUser.setAuthorities(authorities);
        return newUser;
    }
    private boolean removeNoneActivatedUser(User existingUser){
        if(existingUser.getActivated()){
            return false;
        }
        userRepository.delete(existingUser);
        userRepository.flush();
        this.clearUserCaches(existingUser);
        return true;
    }
    /*
    * có mục đích là xóa bản User cũ trong cache, vì trước khi activate, User đó có thể đã được cache với trạng thái cũ.
    * */
    private void clearUserCaches(User user){
        var cacheByEmail = cacheManager.getCache(UserRepository.USERS_BY_EMAIL_CACHE);
        if(cacheByEmail != null){
            cacheByEmail.evict(user.getEmail().trim().toLowerCase(Locale.ENGLISH));
        }
    }

    /*
     * check after 3 day
     * and check 0 second - 0 minutes - 1 AM - Every day - Every week
     * */
    @Scheduled(cron = "0 0 1 * * ?")
    public void removeNotActivatedUsers(){
        List<User> currentUsers = userRepository.findAllByActivatedIsFalseAndActivationKeyNotNullAndLastModifiedDateBefore(Instant.now().minus(3, ChronoUnit.DAYS));
        List<Long> currentUserIds = currentUsers.stream().map(User::getId).toList();
        userRepository.deleteByIdIn(currentUserIds);
        currentUsers.forEach(this::clearUserCaches);
    }

    public UserDTO initActivatedKeyAccount(String email){
        String normalizedEmail = email.trim().toLowerCase(Locale.ENGLISH);
        User user = userRepository.findOneByEmail(normalizedEmail).orElseThrow(() -> new DataResourceNotFoundException(String.format("Email '%s' not found", normalizedEmail), "userManagement", "emailnotfound"));
        if(user.getActivated()){
            throw new AccessDeniedException("account");
        }
        assignNewActivationKey(user);
        userRepository.save(user);
        UserDTO dto = new UserDTO();
        dto.setEmail(normalizedEmail);
        dto.setActivationKey(user.getActivationKey());
        return dto;
    }
    public List<UserDTO> initActivateKeyMulAccount(List<Long> userIds){
        if (userIds == null || userIds.isEmpty() || userIds.stream().anyMatch(Objects::isNull)) {
            throw new BadRequestResourceException(
                    "User IDs must not be empty or contain null values",
                    "userManagement",
                    "invalidids"
            );
        }

        List<Long> distinctUserIds = userIds.stream().distinct().toList();
        List<User> currentUsers = userRepository.findByIdIn(distinctUserIds);
        Set<Long> userIdSet = currentUsers.stream().map(User::getId).collect(Collectors.toSet());
        for(Long userId : distinctUserIds){
            if(!userIdSet.contains(userId)){
                throw new BadRequestResourceException(
                        "One or more user IDs were not found",
                        "userManagement",
                        "idnotfound"
                );
            }
        }

        List<User> usersPendingActivation = currentUsers.stream()
                .filter(user -> Boolean.FALSE.equals(user.getActivated()))
                .toList();

        if (usersPendingActivation.isEmpty()) {
            return List.of();
        }

        List<UserDTO> res = new ArrayList<>(usersPendingActivation.size());
        for(User user : usersPendingActivation){
            assignNewActivationKey(user);

            UserDTO dto = new UserDTO();
            dto.setEmail(user.getEmail());
            dto.setActivationKey(user.getActivationKey());
            res.add(dto);
        }

        userRepository.saveAll(usersPendingActivation);
        return res;
    }

    public void activateAccount(String activationKey, String password) {
        activateAccountAndSetPassword(activationKey, password);
    }

    public void activateAccountAndSetPassword(String activationKey, String password) {
        Instant now = Instant.now();
        User user = userRepository.findOneByActivationKey(activationKey)
                .filter(candidate -> Boolean.FALSE.equals(candidate.getActivated()))
                .filter(candidate -> isActivationKeyValid(candidate, now))
                .orElseThrow(() -> new BadRequestResourceException(
                        "Activation key is invalid or expired",
                        "userManagement",
                        "invalidactivationkey"
                ));

        user.setPassword(passwordEncoder.encode(password));
        user.setActivated(true);
        user.setActivationKey(null);
        user.setActivationKeyExpiresAt(null);

        if (user.getAuthorities() == null || user.getAuthorities().isEmpty()) {
            Authority studentAuthority = authorityRepository.findById(AuthoritiesConstants.STUDENT)
                    .orElseThrow(() -> new IllegalStateException("Student authority is not configured"));
            user.getAuthorities().add(studentAuthority);
        }
        userRepository.save(user);
        clearUserCaches(user);
    }

    public tech.djnd.sample.app.service.dto.ActivationKeyVerifyDTO verifyActivationKey(String activationKey) {
        if (activationKey == null || activationKey.isBlank()) {
            throw new BadRequestResourceException(
                    "Activation key must not be blank",
                    "userManagement",
                    "invalidactivationkey"
            );
        }
        Instant now = Instant.now();
        User user = userRepository.findByActivationKey(activationKey)
                .filter(candidate -> Boolean.FALSE.equals(candidate.getActivated()))
                .filter(candidate -> isActivationKeyValid(candidate, now))
                .orElseThrow(() -> new BadRequestResourceException(
                        "Activation key is invalid or expired",
                        "userManagement",
                        "invalidactivationkey"
                ));

        return tech.djnd.sample.app.service.dto.ActivationKeyVerifyDTO.builder()
                .valid(true)
                .email(user.getEmail())
                .name(user.getName())
                .build();
    }

    public ResetKeyVerifyDTO verifyResetKey(String resetKey) {
        if (resetKey == null || resetKey.isBlank()) {
            throw new BadRequestResourceException(
                    "Reset key must not be blank",
                    "userManagement",
                    "resetkeyinvalidorexpired"
            );
        }
        Instant now = Instant.now();
        User user = userRepository.findOneByResetKey(resetKey.trim())
                .filter(User::getActivated)
                .filter(candidate -> candidate.getResetDate() != null && candidate.getResetDate().isAfter(now.minus(1, ChronoUnit.DAYS)))
                .orElseThrow(() -> new BadRequestResourceException(
                        "Reset key is invalid or expired",
                        "userManagement",
                        "resetkeyinvalidorexpired"
                ));

        return ResetKeyVerifyDTO.builder()
                .valid(true)
                .email(user.getEmail())
                .name(user.getName())
                .build();
    }

    public UserDTO initActivatedKeyAccountById(Long userId) {
        if (userId == null) {
            throw new BadRequestResourceException("User ID must not be null", "userManagement", "idnull");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BadRequestResourceException("User not found", "userManagement", "usernotfound"));

        if (Boolean.TRUE.equals(user.getActivated())) {
            throw new BadRequestResourceException("User is already activated", "userManagement", "alreadyactivated");
        }

        assignNewActivationKey(user);
        userRepository.save(user);

        UserDTO dto = new UserDTO();
        dto.setEmail(user.getEmail());
        dto.setActivationKey(user.getActivationKey());
        return dto;
    }

    private void assignNewActivationKey(User user) {
        user.setActivationKey(RandomUtil.generateActivationKey());
        user.setActivationKeyExpiresAt(Instant.now().plus(ACTIVATION_KEY_VALIDITY_DAYS, ChronoUnit.DAYS));
    }

    private boolean isActivationKeyValid(User user, Instant now) {
        Instant expiresAt = user.getActivationKeyExpiresAt();
        if (expiresAt == null && user.getLastModifiedDate() != null) {
            expiresAt = user.getLastModifiedDate().plus(ACTIVATION_KEY_VALIDITY_DAYS, ChronoUnit.DAYS);
        }
        return expiresAt != null && expiresAt.isAfter(now);
    }


    /*
    * Required request with email for set password account
    * */
    public Optional<User> requestPasswordReset(String email){
        String normalizedEmail = email.trim().toLowerCase(Locale.ENGLISH);
//        User existingUser = userRepository.findOneByEmail(normalizedEmail)
//                .orElseThrow(() -> new DataResourceNotFoundException(String.format("User with email '%s' not found", normalizedEmail), "userManagement", "usernotfound"));
//        if(!existingUser.getActivated()){
//            throw new AccessDeniedException(String.format("User with email '%s' is not activated", normalizedEmail));
//        }
//        existingUser.setResetKey(RandomUtil.generateResetKey());
//        existingUser.setResetDate(Instant.now());
//        userRepository.save(existingUser);
//        this.clearUserCaches(existingUser);
//        UserDTO dto = new UserDTO();
//        dto.setEmail(existingUser.getEmail());
//        dto.setResetKey(existingUser.getResetKey());
//        return dto;
        return userRepository.findOneByEmail(normalizedEmail)
                .filter(User::getActivated)
                .filter(user -> {
                    // Cooldown: prevent email flooding if requested within the last 60 seconds
                    // rate limit
                    if (user.getResetDate() != null && user.getResetDate().isAfter(Instant.now().minus(60, ChronoUnit.SECONDS))) {
                        return false;
                    }
                    return true;
                })
                .map(user -> {
                    user.setResetKey(RandomUtil.generateResetKey());
                    user.setResetDate(Instant.now());
                    this.clearUserCaches(user);
                    return user;
                });
    }

    /**
     * Complete password reset with validity check and session/token revocation.
     */
    public Optional<User> completePasswordReset(String newPassword, String resetKey) {
        if (resetKey == null || resetKey.isBlank()) {
            return Optional.empty();
        }
        return userRepository.findOneByResetKey(resetKey.trim())
                .filter(user -> user.getResetDate() != null && user.getResetDate().isAfter(Instant.now().minus(1, ChronoUnit.DAYS)))
                .map(user -> {
                    user.setPassword(passwordEncoder.encode(newPassword));
                    user.setResetKey(null);
                    user.setResetDate(null);
                    user.setSessionId(null);
                    user.setRefreshToken(null);
                    userRepository.save(user);
                    this.clearUserCaches(user);
                    return user;
                });
    }
}
