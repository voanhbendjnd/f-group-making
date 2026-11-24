package com.fmaking.security;

import com.fmaking.config.CustomJwtAuthenticationConverter;
import com.fmaking.config.SmartAuthenticationEntryPoint;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SessionInvalidationSecurityTest {

    private SessionManager sessionManager;
    private CustomJwtAuthenticationConverter converter;
    private SmartAuthenticationEntryPoint entryPoint;

    @BeforeEach
    void setUp() {
        sessionManager = mock(SessionManager.class);
        converter = new CustomJwtAuthenticationConverter(sessionManager);
        entryPoint = new SmartAuthenticationEntryPoint();
    }

    @Test
    void converterThrowsSessionInvalidatedExceptionWhenSessionIdIsStale() {
        String email = "student@example.test";
        String oldSessionId = "old-session-id-device-a";
        Jwt jwt = Jwt.withTokenValue("token")
                .header("alg", "none")
                .subject(email)
                .claim("sessionId", oldSessionId)
                .claim("authorities", java.util.List.of("ROLE_STUDENT"))
                .build();

        when(sessionManager.isValidSessionIdByEmail(email, oldSessionId)).thenReturn(false);

        assertThatThrownBy(() -> converter.convert(jwt))
                .isInstanceOf(SessionInvalidatedException.class)
                .hasMessage("SESSION_TERMINATED_CONCURRENT_LOGIN");
    }

    @Test
    void converterDoesNotThrowWhenSessionIdIsStaleOnPublicEndpoint() {
        String email = "student@example.test";
        String oldSessionId = "old-session-id-device-a";
        Jwt jwt = Jwt.withTokenValue("token")
                .header("alg", "none")
                .subject(email)
                .claim("sessionId", oldSessionId)
                .claim("authorities", java.util.List.of("ROLE_STUDENT"))
                .build();

        when(sessionManager.isValidSessionIdByEmail(email, oldSessionId)).thenReturn(false);

        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/login");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        try {
            var authorities = converter.convert(jwt);
            assertThat(authorities).isEmpty();
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }
    }

    @Test
    void entryPointReturnsSessionTerminatedDetailsOnSessionInvalidatedException() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        SessionInvalidatedException exception = new SessionInvalidatedException("SESSION_TERMINATED_CONCURRENT_LOGIN");
        entryPoint.commence(request, response, exception);

        assertThat(response.getStatus()).isEqualTo(401);
        String body = response.getContentAsString();
        assertThat(body).contains("\"code\": \"SESSION_TERMINATED_CONCURRENT_LOGIN\"");
        assertThat(body).contains("\"message\": \"Tài khoản đã được đăng nhập trên thiết bị khác\"");
        assertThat(body).contains("\"errorKey\": \"sessionConcurrentLogin\"");
        assertThat(body).doesNotContain("Email hoặc Password không đúng");
    }

    @Test
    void entryPointReturnsStandardUnauthorizedForOtherBadCredentials() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        BadCredentialsException exception = new BadCredentialsException("Generic bad credentials");
        entryPoint.commence(request, response, exception);

        assertThat(response.getStatus()).isEqualTo(401);
        String body = response.getContentAsString();
        assertThat(body).contains("\"code\": \"UNAUTHORIZED\"");
        assertThat(body).contains("\"message\": \"(Session expired) Please login to access this resource\"");
    }
}
