package tech.djnd.sample.app.web.rest;

import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import net.logstash.logback.util.StringUtils;
import org.apache.hc.core5.http.HttpHeaders;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.authentication.builders.AuthenticationManagerBuilder;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import tech.djnd.sample.app.domain.User;
import tech.djnd.sample.app.security.AuthoritiesConstants;
import tech.djnd.sample.app.security.CustomUserDetails;
import tech.djnd.sample.app.service.AuthService;
import tech.djnd.sample.app.service.MailService;
import tech.djnd.sample.app.service.NotificationAsyncService;
import tech.djnd.sample.app.service.UserService;
import tech.djnd.sample.app.service.TermService;
import tech.djnd.sample.app.service.dto.ActivationKeyVerifyDTO;
import tech.djnd.sample.app.service.dto.BatchActivationResultDTO;
import tech.djnd.sample.app.service.dto.ResLoginDTO;
import tech.djnd.sample.app.service.dto.ResetKeyVerifyDTO;
import tech.djnd.sample.app.service.dto.UserDTO;
import tech.djnd.sample.app.service.errors.BadRequestResourceException;
import tech.djnd.sample.app.util.anotation.ApiMessage;
import tech.djnd.sample.app.web.rest.vm.*;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@RestController
@Slf4j
@RequestMapping("/api")
public class AccountResource {
    private final UserService userService;
    private final TermService termService;
    private final AuthenticationManagerBuilder authenticationManagerBuilder;
    private final AuthService authService;
    private final MailService mailService;
    private final PasswordEncoder passwordEncoder;
    @Value("${djnd.jwt.refresh-token-validity-in-seconds}")
    private Long refreshTokenExpiration;
    private final NotificationAsyncService notificationAsyncService;

    public AccountResource(
            UserService userService,
            AuthenticationManagerBuilder authenticationManagerBuilder,
            AuthService authService,
            MailService mailService,
            NotificationAsyncService notificationAsyncService,
            PasswordEncoder passwordEncoder,
            TermService termService
    ) {
        this.userService = userService;
        this.termService = termService;
        this.authenticationManagerBuilder = authenticationManagerBuilder;
        this.notificationAsyncService = notificationAsyncService;
        this.mailService = mailService;
        this.authService = authService;
        this.passwordEncoder = passwordEncoder;
    }

    /*
     * vm: username, password
     */
    @PostMapping("/login")
    public ResponseEntity<ResLoginDTO> loginWithEmail(@Valid @RequestBody LoginVM vm) {
        String normalizedEmail = vm.getUsername().trim().toLowerCase(Locale.ENGLISH);
        // check password
        UsernamePasswordAuthenticationToken userToken = new UsernamePasswordAuthenticationToken(normalizedEmail, vm.getPassword());

        try {
            Authentication authentication = authenticationManagerBuilder.getObject().authenticate(userToken);
            SecurityContextHolder.getContext().setAuthentication(authentication);
            CustomUserDetails userDetails = (CustomUserDetails) authentication.getPrincipal();
            User user = userDetails.user();
            ResLoginDTO res = authService.generateResLoginDTO(user);
            ResponseCookie cookie = ResponseCookie.from("refresh_token", res.getRefreshToken())
                    .httpOnly(true)
                    .secure(true)
                    .path("/")
                    .maxAge(refreshTokenExpiration)
                    .sameSite("Strict")
                    .build();
            res.setRefreshToken(null);
            return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookie.toString()).body(res);
        } catch (BadCredentialsException ex) {
            throw new tech.djnd.sample.app.web.rest.errors.BadCredentialsException();
        }
    }

    @PostMapping("/activate")
    @ResponseStatus(HttpStatus.OK)
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    @ApiMessage("Activation email request accepted successfully")
    public void sendRequestActivateAccount(@RequestBody(required = false) Map<String, Object> mp,
            @RequestParam(name = "termId", required = false) Integer termId) {
        String email = mp == null ? null : (mp.get("email") != null ? mp.get("email").toString() : null);
        Object rawUserId = mp == null ? null : (mp.containsKey("userId") ? mp.get("userId") : mp.get("id"));

        UserDTO dto;
        if (rawUserId != null) {
            Long userId = rawUserId instanceof Number ? ((Number) rawUserId).longValue() : Long.parseLong(rawUserId.toString());
            termService.validateUserIdsInTerm(List.of(userId), termId);
            dto = userService.initActivatedKeyAccountById(userId);
        } else if (email != null && !email.isBlank()) {
            termService.validateEmailInTerm(email, termId);
            dto = userService.initActivatedKeyAccount(email);
        } else {
            throw new BadRequestResourceException("Email not found", "userManagement", "emailnotfound");
        }
        mailService.sendActivationEmail(dto);
    }

    @PostMapping("/activate/mul")
    @ResponseStatus(HttpStatus.OK)
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    @ApiMessage("Batch activation request accepted successfully")
    public ResponseEntity<BatchActivationResultDTO> sendMulRequestActivateAccount(@Valid @RequestBody MulUserId mulUserId,
            @RequestParam(name = "termId", required = false) Integer termId) {
        List<Long> userIds = mulUserId.getUserIds();
        List<Long> distinctUserIds = userIds.stream().distinct().toList();
        termService.validateUserIdsInTerm(distinctUserIds, termId);
        List<UserDTO> usersToActivate = userService.initActivateKeyMulAccount(distinctUserIds);
        notificationAsyncService.sendMailActivatedAccount(usersToActivate);

        BatchActivationResultDTO result = BatchActivationResultDTO.builder()
                .totalRequested(distinctUserIds.size())
                .totalProcessed(usersToActivate.size())
                .totalSkippedAlreadyActive(distinctUserIds.size() - usersToActivate.size())
                .sentEmails(usersToActivate.stream().map(UserDTO::getEmail).toList())
                .build();
        return ResponseEntity.ok(result);
    }

    @GetMapping("/account/activate/verify")
    @ApiMessage("Activation key verified successfully")
    public ResponseEntity<ActivationKeyVerifyDTO> verifyActivationKey(@RequestParam("key") String key) {
        ActivationKeyVerifyDTO result = userService.verifyActivationKey(key);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/account/activate")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void activateAccount(@Valid @RequestBody ActivateAccountVM vm) {
        userService.activateAccountAndSetPassword(vm.getKey(), vm.getPassword());
    }

    @GetMapping("/account/reset-password/verify")
    @ApiMessage("Reset key verified successfully")
    public ResponseEntity<ResetKeyVerifyDTO> verifyResetKey(@RequestParam("key") String key) {
        ResetKeyVerifyDTO result = userService.verifyResetKey(key);
        return ResponseEntity.ok(result);
    }

    @PostMapping(path = "/account/reset-password/init")
    @ResponseStatus(HttpStatus.OK)
    @ApiMessage("Password reset request accepted")
    public void requestPasswordReset(@Valid @RequestBody ResetPasswordInitVM vm) {
        Optional<User> userExisting = userService.requestPasswordReset(vm.getEmail());
        if (userExisting.isPresent()) {
            UserDTO dto = new UserDTO();
            dto.setResetKey(userExisting.get().getResetKey());
            dto.setEmail(userExisting.get().getEmail());
            mailService.sendPasswordResetMail(dto);
        } else {
            log.info("Password reset requested for non existing mail");
        }
    }

    @PostMapping(path = "/account/reset-password/finish")
    @ResponseStatus(HttpStatus.OK)
    @ApiMessage("Password has been reset successfully")
    public void finishPasswordReset(@Valid @RequestBody KeyAndPasswordVM vm) {
        if (isPasswordLengthInvalid(vm.getNewPassword())) {
            throw new BadRequestResourceException("Password length is invalid", "userManagement", "passwordlengthinvalid");
        }
        Optional<User> user = userService.completePasswordReset(vm.getNewPassword(), vm.getResetKey());
        if (user.isEmpty()) {
            // handle attack time
            passwordEncoder.encode(vm.getNewPassword());
            throw new BadRequestResourceException("Reset key is invalid or expired", "userManagement", "resetkeyinvalidorexpired");
        }
    }
    private static boolean isPasswordLengthInvalid(String password) {
        return (
                StringUtils.isEmpty(password) ||
                        password.length() < ManagedUserVM.PASSWORD_MIN_LENGTH ||
                        password.length() > ManagedUserVM.PASSWORD_MAX_LENGTH
        );
    }
}
