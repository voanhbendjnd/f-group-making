package com.fmaking.security;

import com.fmaking.config.CustomJwtAuthenticationConverter;
import com.fmaking.domain.*;
import com.fmaking.repository.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.messaging.simp.stomp.*;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class RealtimeChannelInterceptorTest {
    final JwtDecoder decoder = mock(JwtDecoder.class);
    final CustomJwtAuthenticationConverter converter = mock(CustomJwtAuthenticationConverter.class);
    final UserRepository users = mock(UserRepository.class);
    final StudentRepository students = mock(StudentRepository.class);
    final SchoolClassRepository classes = mock(SchoolClassRepository.class);
    final DeadlineRepository deadlines = mock(DeadlineRepository.class);
    final RealtimeChannelInterceptor interceptor = new RealtimeChannelInterceptor(decoder, converter, users, students, classes, deadlines);
    Jwt jwt;
    @BeforeEach void setup() {
        jwt = Jwt.withTokenValue("signed").header("alg", "HS512").subject("student@example.test")
            .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).build();
        User user = new User(); user.setId(10L); user.setActivated(true); user.setEmail(jwt.getSubject());
        when(users.findOneByEmail(jwt.getSubject())).thenReturn(Optional.of(user));
        when(decoder.decode("signed")).thenReturn(jwt);
        when(converter.convert(jwt)).thenReturn(List.copyOf(AuthorityUtils.createAuthorityList("ROLE_STUDENT")));
        Student student = new Student(); student.setUserId(10L); student.setSchoolClassId(1);
        when(students.findById(10L)).thenReturn(Optional.of(student));
        SchoolClass own = new SchoolClass(); own.setId(1);
        SchoolClass other = new SchoolClass(); other.setId(2);
        when(classes.findById(1)).thenReturn(Optional.of(own));
        when(classes.findById(2)).thenReturn(Optional.of(other));
    }
    private void send(StompHeaderAccessor headers) {
        interceptor.preSend(MessageBuilder.createMessage(new byte[0], headers.getMessageHeaders()), null);
    }
    private StompHeaderAccessor subscription(String destination, String role) {
        var headers = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        headers.setUser(new JwtAuthenticationToken(jwt, AuthorityUtils.createAuthorityList(role)));
        headers.setDestination(destination); return headers;
    }
    @Test void connectRequiresAndValidatesTheToken() {
        var missing = StompHeaderAccessor.create(StompCommand.CONNECT);
        assertThatThrownBy(() -> send(missing)).isInstanceOf(AccessDeniedException.class);
        var headers = StompHeaderAccessor.create(StompCommand.CONNECT);
        headers.setLeaveMutable(true); headers.addNativeHeader("Authorization", "Bearer signed");
        send(headers);
        assertThat(headers.getUser().getName()).isEqualTo(jwt.getSubject());
        verify(converter).convert(jwt);
    }
    @Test void studentCannotSubscribeToAnotherClassOrAdminAndCannotForgeEvents() {
        assertThatCode(() -> send(subscription("/topic/classes/1/deadlines", "ROLE_STUDENT"))).doesNotThrowAnyException();
        assertThatThrownBy(() -> send(subscription("/topic/classes/2/deadlines", "ROLE_STUDENT"))).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> send(subscription("/topic/admin/deadlines", "ROLE_STUDENT"))).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> send(subscription("/topic/classes/*/deadlines", "ROLE_STUDENT"))).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> send(StompHeaderAccessor.create(StompCommand.SEND))).isInstanceOf(AccessDeniedException.class);
    }
    @Test void groupTopicsMustBelongToTheClassAndManagementChannelsAreScoped() {
        assertThatThrownBy(() -> send(subscription("/topic/classes/1/deadlines/99/groups", "ROLE_STUDENT"))).isInstanceOf(AccessDeniedException.class);
        when(deadlines.countByDeadlineIdAndClassId(99, 1)).thenReturn(1L);
        assertThatCode(() -> send(subscription("/topic/classes/1/deadlines/99/groups", "ROLE_STUDENT"))).doesNotThrowAnyException();
        assertThatCode(() -> send(subscription("/topic/admin/deadlines", "ROLE_ADMIN"))).doesNotThrowAnyException();
        assertThatCode(() -> send(subscription("/user/queue/deadlines", "ROLE_LECTURE"))).doesNotThrowAnyException();
        assertThatThrownBy(() -> send(subscription("/user/queue/deadlines", "ROLE_STUDENT"))).isInstanceOf(AccessDeniedException.class);
    }
}
