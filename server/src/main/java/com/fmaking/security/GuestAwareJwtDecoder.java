package com.fmaking.security;
import jakarta.servlet.http.HttpServletRequest;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.util.AntPathMatcher;

import java.time.Instant;
import java.util.List;

@FieldDefaults(level = AccessLevel.PRIVATE)
@RequiredArgsConstructor
public class GuestAwareJwtDecoder implements JwtDecoder {
    final JwtDecoder jwtDecoder;
    final HttpServletRequest request;
    final List<String> publicAntPatterns;
    private final AntPathMatcher antPathMatcher = new AntPathMatcher();
    @Override
    public Jwt decode(String token) throws JwtException{
        try{
            return jwtDecoder.decode(token);
        }
        catch(JwtException e){
            String currentPath = request.getRequestURI();
            boolean isPublicEndPoint = publicAntPatterns.stream().anyMatch(pattern -> antPathMatcher.match(pattern, currentPath));
            if(isPublicEndPoint){
                return Jwt.withTokenValue("anonymous_token")
                        .header("alg", "none")
                        .subject("anonymousUser")
                        .claim("scope", "")
                        .expiresAt(Instant.MAX)
                        .issuedAt(Instant.now())
                        .build();
            }
            throw e;
        }
    }

}