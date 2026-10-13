package com.fmaking.security;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;
import com.fmaking.service.dto.ResLoginDTO;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Stream;
@Service
public class SecurityUtils {

    public static final MacAlgorithm JWT_ALGORITHM;
    @Value("${djnd.jwt.base64-secret}")
    private String jwtKey;
    @Value("${djnd.jwt.access-token-validity-in-seconds}")
    private Long accessTokenExpiration;
    @Value("${djnd.jwt.refresh-token-validity-in-seconds}")
    private  Long refreshTokenExpiration;
    public static Optional<String> getCurrentUserLogin(){
        SecurityContext securityContext = SecurityContextHolder.getContext();
        return Optional.ofNullable(extractPrincipal(securityContext.getAuthentication()));
    }
    static {
        JWT_ALGORITHM = MacAlgorithm.HS256;
    }
    private final JwtEncoder jwtEncoder;
    public SecurityUtils(JwtEncoder jwtEncoder) {
        this.jwtEncoder = jwtEncoder;
    }
    private static String extractPrincipal(Authentication authentication){
        if(authentication == null){
            return null;
        }
        else if(authentication.getPrincipal() instanceof UserDetails springSecurityUser){
            return springSecurityUser.getUsername();
        }
        else if(authentication.getPrincipal() instanceof Jwt jwt){
            return jwt.getSubject();
        }
        else if(authentication.getPrincipal() instanceof String) {
            return (String)authentication.getPrincipal();
        }
        return null;
    }

    public static Optional<String> getCurrentUserJWT(){
        SecurityContext securityContext = SecurityContextHolder.getContext();
        return Optional
                .ofNullable(securityContext.getAuthentication())
                .filter(authentication -> authentication.getCredentials() instanceof String)
                .map(authentication -> (String)authentication.getCredentials());

    }

    public static boolean isAuthenticated(){
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.isAuthenticated();
    }

    public static boolean isCurrentUserInRole(String authority){
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && getAuthorities(authentication).anyMatch(authority::equals);
    }

    public static Stream<String> getAuthorities(Authentication authentication){
        return authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority);
    }


    public String createAccessToken(ResLoginDTO.UserLogin userLogin , String sessionId, Set<String> authorities){
        var userToken = this.initUserToken(userLogin);
        Instant now = Instant.now();
        Instant validity = now.plus(this.accessTokenExpiration, ChronoUnit.SECONDS);
        JwtClaimsSet claims = JwtClaimsSet.builder().issuedAt(now).expiresAt(validity).subject(userLogin.getEmail())
                .claim("user", userToken)
                .claim("authorities", authorities)
                .claim("sessionId", sessionId)
                .build();
        JwsHeader jwtHeader = JwsHeader.with(JWT_ALGORITHM).build();
        return jwtEncoder.encode(JwtEncoderParameters.from(jwtHeader, claims)).getTokenValue();
    }

    public String createRefreshToken( ResLoginDTO.UserLogin userLogin){
        var userToken = this.initUserToken(userLogin);
        Instant now = Instant.now();
        Instant validity = now.plus(this.refreshTokenExpiration, ChronoUnit.SECONDS);
        JwtClaimsSet claims = JwtClaimsSet.builder().issuedAt(now).expiresAt(validity)
                .subject(userLogin.getEmail())
                .claim("user", userToken)
                .build();
        JwsHeader jwtHeader = JwsHeader.with(JWT_ALGORITHM).build();
        return jwtEncoder.encode(JwtEncoderParameters.from(jwtHeader, claims)).getTokenValue();
    }

    private ResLoginDTO.UserInsideToken initUserToken(ResLoginDTO.UserLogin userLogin){
        var userToken = new ResLoginDTO.UserInsideToken();
        userToken.setId(userLogin.getId());
        userToken.setEmail(userLogin.getEmail());
        return userToken;
    }

}