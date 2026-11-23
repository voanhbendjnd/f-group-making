package com.fmaking.config;

import jakarta.servlet.http.HttpServletRequest;
import lombok.Getter;
import lombok.Setter;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import com.fmaking.security.SessionInvalidatedException;
import com.fmaking.security.SessionManager;

import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;

/*
 * When security use JwtAuthenticationProvider for authenticated (xac thuc)JWT
 * It calls this CustomerJwtAuthenticationConverter and get info from Claims at JWT
 * return JwtAUthenticationToken and save at SecurityContextHolder
 * -> Target for method save role to Security Context
 * */
@Component
public class CustomJwtAuthenticationConverter implements Converter<Jwt, Collection<GrantedAuthority>> {
    private final SessionManager sessionManager;
    private final AntPathMatcher antPathMatcher = new AntPathMatcher();

    @Getter
    @Setter
    private String authoritiesClaimName = "authorities";
    @Getter
    @Setter
    private String authorityPrefix = "";

    public CustomJwtAuthenticationConverter(SessionManager sessionManager) {
        this.sessionManager = sessionManager;
    }

    private boolean isPublicRequest() {
        try {
            ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attributes != null) {
                HttpServletRequest request = attributes.getRequest();
                String uri = request.getRequestURI();
                String servletPath = request.getServletPath();
                for (String pattern : SecurityConfiguration.PUBLIC_ENDPOINTS) {
                    if (antPathMatcher.match(pattern, uri) || (servletPath != null && antPathMatcher.match(pattern, servletPath))) {
                        return true;
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    @Override
    public Collection<GrantedAuthority> convert(Jwt source) {
        String email = source.getSubject(); // username
        String sessionId = source.getClaimAsString("sessionId");
        if(email != null && sessionId != null) {
            boolean isValidSession = sessionManager.isValidSessionIdByEmail(email, sessionId);
            if(!isValidSession) {
                if (isPublicRequest()) {
                    return List.of();
                }
                throw new SessionInvalidatedException("SESSION_TERMINATED_CONCURRENT_LOGIN");
            }
        }
        Collection<String> authorities = source.getClaimAsStringList(authoritiesClaimName);
        if(authorities == null || authorities.isEmpty()) {
            return List.of();
        }
        return authorities.stream().map(authority -> new SimpleGrantedAuthority(authorityPrefix + authority)).collect(Collectors.toList());
    }
}
