package tech.djnd.sample.app.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cache.CacheManager;
import org.springframework.security.crypto.password.PasswordEncoder;
import tech.djnd.sample.app.domain.User;
import tech.djnd.sample.app.domain.Authority;
import tech.djnd.sample.app.repository.AuthorityRepository;
import tech.djnd.sample.app.repository.UserRepository;
import tech.djnd.sample.app.service.dto.UserDTO;
import tech.djnd.sample.app.service.errors.BadRequestResourceException;

import java.util.List;
import java.util.Map;
import java.time.Instant;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private CacheManager cacheManager;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private AuthorityRepository authorityRepository;

    private UserService userService;

    @BeforeEach
    void setUp() {
        userService = new UserService(userRepository, cacheManager, passwordEncoder, authorityRepository);
    }

    @Test
    void batchActivationPersistsKeysAndReturnsTheSameKeysForPendingUsers() {
        User firstUser = pendingUser(1L, "first@example.com");
        User secondUser = pendingUser(2L, "second@example.com");
        when(userRepository.findByIdIn(List.of(1L, 2L))).thenReturn(List.of(firstUser, secondUser));

        List<UserDTO> result = userService.initActivateKeyMulAccount(List.of(1L, 2L));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<User>> usersCaptor = ArgumentCaptor.forClass(List.class);
        verify(userRepository).saveAll(usersCaptor.capture());
        assertThat(usersCaptor.getValue()).containsExactlyInAnyOrder(firstUser, secondUser);
        assertThat(firstUser.getActivationKey()).isNotBlank();
        assertThat(secondUser.getActivationKey()).isNotBlank();

        Map<String, UserDTO> resultByEmail = result.stream()
                .collect(Collectors.toMap(UserDTO::getEmail, Function.identity()));
        assertThat(resultByEmail.get(firstUser.getEmail()).getActivationKey())
                .isEqualTo(firstUser.getActivationKey());
        assertThat(resultByEmail.get(secondUser.getEmail()).getActivationKey())
                .isEqualTo(secondUser.getActivationKey());
    }

    @Test
    void batchActivationSkipsAlreadyActivatedUsers() {
        User pendingUser = pendingUser(1L, "pending@example.com");
        User activatedUser = pendingUser(2L, "activated@example.com");
        activatedUser.setActivated(true);
        activatedUser.setActivationKey("existing-key");
        when(userRepository.findByIdIn(List.of(1L, 2L))).thenReturn(List.of(pendingUser, activatedUser));

        List<UserDTO> result = userService.initActivateKeyMulAccount(List.of(1L, 2L));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<User>> usersCaptor = ArgumentCaptor.forClass(List.class);
        verify(userRepository).saveAll(usersCaptor.capture());
        assertThat(usersCaptor.getValue()).containsExactly(pendingUser);
        assertThat(result).extracting(UserDTO::getEmail).containsExactly("pending@example.com");
        assertThat(activatedUser.getActivationKey()).isEqualTo("existing-key");
    }

    @Test
    void batchActivationRejectsMissingIdsWithoutPersistingKeys() {
        User existingUser = pendingUser(1L, "existing@example.com");
        when(userRepository.findByIdIn(List.of(1L, 99L))).thenReturn(List.of(existingUser));

        assertThatThrownBy(() -> userService.initActivateKeyMulAccount(List.of(1L, 99L)))
                .isInstanceOf(BadRequestResourceException.class)
                .hasMessageContaining("One or more user IDs were not found");

        assertThat(existingUser.getActivationKey()).isNull();
        verify(userRepository, never()).saveAll(any());
    }

    @Test
    void batchActivationRejectsEmptyInputWithoutCallingTheRepository() {
        assertThatThrownBy(() -> userService.initActivateKeyMulAccount(List.of()))
                .isInstanceOf(BadRequestResourceException.class)
                .hasMessageContaining("must not be empty");

        verify(userRepository, never()).findByIdIn(any());
        verify(userRepository, never()).saveAll(any());
    }

    @Test
    void batchActivationRemovesDuplicateIdsBeforeLoadingUsers() {
        User user = pendingUser(1L, "user@example.com");
        when(userRepository.findByIdIn(List.of(1L))).thenReturn(List.of(user));

        List<UserDTO> result = userService.initActivateKeyMulAccount(List.of(1L, 1L));

        verify(userRepository).findByIdIn(List.of(1L));
        assertThat(result).hasSize(1);
    }

    @Test
    void batchActivationDoesNotPersistWhenAllUsersAreAlreadyActivated() {
        User activatedUser = pendingUser(1L, "activated@example.com");
        activatedUser.setActivated(true);
        when(userRepository.findByIdIn(List.of(1L))).thenReturn(List.of(activatedUser));

        List<UserDTO> result = userService.initActivateKeyMulAccount(List.of(1L));

        assertThat(result).isEmpty();
        assertThat(activatedUser.getActivationKey()).isNull();
        verify(userRepository, never()).saveAll(any());
    }

    @Test
    void accountActivationSetsPasswordActivatesUserClearsKeyAndAssignsStudentRole() {
        User user = pendingUser(1L, "student@example.com");
        user.setActivationKey("valid-key");
        user.setActivationKeyExpiresAt(Instant.now().plusSeconds(60));
        Authority studentAuthority = new Authority();
        studentAuthority.setName("ROLE_STUDENT");

        when(userRepository.findOneByActivationKey("valid-key")).thenReturn(java.util.Optional.of(user));
        when(authorityRepository.findById("ROLE_STUDENT")).thenReturn(java.util.Optional.of(studentAuthority));
        when(passwordEncoder.encode("new-password")).thenReturn("encoded-password");

        userService.activateAccount("valid-key", "new-password");

        assertThat(user.getActivated()).isTrue();
        assertThat(user.getPassword()).isEqualTo("encoded-password");
        assertThat(user.getActivationKey()).isNull();
        assertThat(user.getActivationKeyExpiresAt()).isNull();
        assertThat(user.getAuthorities()).containsExactly(studentAuthority);
        verify(userRepository).save(user);
    }

    @Test
    void accountActivationRejectsUnknownKeysWithoutChangingPassword() {
        when(userRepository.findOneByActivationKey("unknown-key")).thenReturn(java.util.Optional.empty());

        assertThatThrownBy(() -> userService.activateAccount("unknown-key", "new-password"))
                .isInstanceOf(BadRequestResourceException.class)
                .hasMessageContaining("invalid or expired");

        verify(passwordEncoder, never()).encode(any());
        verify(userRepository, never()).save(any());
    }

    @Test
    void accountActivationRejectsExpiredKeys() {
        User user = pendingUser(1L, "student@example.com");
        user.setActivationKey("expired-key");
        user.setActivationKeyExpiresAt(Instant.now().minusSeconds(1));
        when(userRepository.findOneByActivationKey("expired-key")).thenReturn(java.util.Optional.of(user));

        assertThatThrownBy(() -> userService.activateAccount("expired-key", "new-password"))
                .isInstanceOf(BadRequestResourceException.class)
                .hasMessageContaining("invalid or expired");

        assertThat(user.getActivated()).isFalse();
        assertThat(user.getActivationKey()).isEqualTo("expired-key");
        verify(passwordEncoder, never()).encode(any());
        verify(userRepository, never()).save(any());
    }

    @Test
    void accountActivationAcceptsUnexpiredLegacyKeyWithoutExplicitExpiry() {
        User user = pendingUser(1L, "legacy@example.com");
        user.setActivationKey("legacy-key");
        user.setActivationKeyExpiresAt(null);
        user.setLastModifiedDate(Instant.now().minusSeconds(60));
        Authority studentAuthority = new Authority();
        studentAuthority.setName("ROLE_STUDENT");

        when(userRepository.findOneByActivationKey("legacy-key")).thenReturn(java.util.Optional.of(user));
        when(authorityRepository.findById("ROLE_STUDENT")).thenReturn(java.util.Optional.of(studentAuthority));
        when(passwordEncoder.encode("new-password")).thenReturn("encoded-password");

        userService.activateAccount("legacy-key", "new-password");

        assertThat(user.getActivated()).isTrue();
        assertThat(user.getActivationKey()).isNull();
    }

    private User pendingUser(Long id, String email) {
        User user = new User();
        user.setId(id);
        user.setEmail(email);
        user.setActivated(false);
        return user;
    }
}
