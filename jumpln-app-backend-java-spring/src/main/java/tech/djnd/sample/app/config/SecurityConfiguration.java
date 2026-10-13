package tech.djnd.sample.app.config;


import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.nimbusds.jose.util.Base64;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfigurationSource;
import tech.djnd.sample.app.security.GuestAwareJwtDecoder;
import tech.djnd.sample.app.security.SecurityUtils;

import javax.crypto.SecretKey;
import java.util.List;

/*
 * Workflow at oauth2 resource server
 * Step 1: Get token from request
 * - Filter chain security scanner HTTP Request find string with detail 'Authorization: Bearer <token>'
 * - If request authenticated -> smart authentication entry point
 * Step 2: Decode
 * - Decode token base on GuestAwareJwtDecoder
 * Step 3: Convert Claims to permission by JwtAuthenticationConverter
 * - After step 2, if Jwt valid, spring security activated JwtAuthenticationConverter:
 *   + Read Claims include permission info in token (often is claim authorities or scope)
 *   + Decide permission and convert it to GrantedAuthority [ROLE_ADMIN, ROLE_USER]
 *   + Convert to object JwtAuthenticationToken (include Principal (username or email), Credentials (password or secret key), Authorities)
 * Step 4: Save
 * - Spring security get object JwtAuthenticationToken base on step 3 save at SecurityContextHolder.getContext().setAuthentication(...)
 * - Request identify success, through Security Filter Chain -> RestController
 * Step 5: Handle error authentication
 * - If case token wrong or expired -> Filter get that exception and redirect to -> smart authentication entry poin
 *
 * Note: Request include token -> GuestAwareJwtDecoder, if not contain token and permiss all -> pass
 * */
@Configuration
@EnableWebSecurity // block all request send to app, must be through this security
@EnableMethodSecurity(securedEnabled = true) // @PreAuthorize("ROLE_ADMIN") on controller
public class SecurityConfiguration {

    @Value("${djnd.jwt.base64-secret}")
    private String jwtKey;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }


    @Bean
    public SecurityFilterChain filterChain(
            HttpSecurity http,
            @Qualifier("corsConfigurationSource") CorsConfigurationSource corsConfig,
            JwtDecoder baseJwtDecoder,
            JwtAuthenticationConverter jwtAuthenticationConverter,
            SmartAuthenticationEntryPoint smartAuthenticationEntryPoint,
            HttpServletRequest request
    ) throws Exception {
        String[] whiteList = {
                "/error",
                "/storage/**",
                "/api/v1/search/**",
                "/ws/**",
                "/api/v1/files/**",
                "/api/v1/payments/vnpay-ipn",
                "/api/v1/payments/vnpay-return"
        };
        // handle for case api public but request including token wrong or expire
        List<String> publicEndpoints = List.of(
                "/api/register",
                "/api/login",
                "/api/account/activate",
                "/api/account/activate/verify",
                "/refresh",
                "/account/activate/**",
                "/api/account/reset-password/init",
                "/api/account/reset-password/finish",
                "/api/account/reset-password/verify",
                "/account/reset-password/**",
                "/files/**");
        http.cors(cors -> cors.configurationSource(corsConfig))
                .csrf(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(
                        auth -> auth
                                .requestMatchers(HttpMethod.POST, "/api/register").permitAll()
                                .requestMatchers(HttpMethod.POST, "/api/login").permitAll()
                                .requestMatchers(HttpMethod.POST, "/api/account/activate").permitAll()
                                .requestMatchers(HttpMethod.GET, "/api/account/activate/verify").permitAll()
                                .requestMatchers(HttpMethod.GET, "/api/account/reset-password/verify").permitAll()
                                .requestMatchers(HttpMethod.POST, "/api/account/reset-password/init").permitAll()
                                .requestMatchers(HttpMethod.POST, "/api/account/reset-password/finish").permitAll()

                                .requestMatchers(whiteList).permitAll()
                                .anyRequest().authenticated()
                )
                .oauth2ResourceServer(oauth2 -> oauth2
                        // request include token will decode and check token expired
                        // JWT AUTH will converter get permission
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(
                                        jwtAuthenticationConverter
                                )
                                .decoder(new GuestAwareJwtDecoder(baseJwtDecoder, request, publicEndpoints)))
                        .authenticationEntryPoint(smartAuthenticationEntryPoint)
                ).formLogin(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED));
        return http.build();
    }
    @Bean
    public JwtEncoder jwtEncoder() {
        return new NimbusJwtEncoder(new ImmutableSecret<>(jwtSecretKey()));
    }
    @Bean
    public SecretKey jwtSecretKey(){
        byte[] keyBytes = Base64.from(jwtKey).decode();
        return Keys.hmacShaKeyFor(keyBytes);
    }

    @Bean
    public JwtDecoder jwtDecoder() {
        NimbusJwtDecoder jwtDecoder = NimbusJwtDecoder.withSecretKey(jwtSecretKey())
                .macAlgorithm(SecurityUtils.JWT_ALGORITHM).build();
        return token -> {
            try {
                // if token "undefined" -> throw
                return jwtDecoder.decode(token);
            } catch (Exception ex) {
                System.out.println(">>> JWT Error: " + ex.getMessage());
                throw ex;
            }
        };
    }

    @Bean
    public JwtAuthenticationConverter jwtAuthenticationConverter(CustomJwtAuthenticationConverter customJwtAuthenticationConverter) {
        customJwtAuthenticationConverter.setAuthorityPrefix("");
        customJwtAuthenticationConverter.setAuthoritiesClaimName("authorities");
        JwtAuthenticationConverter jwtAuthenticationConverter = new JwtAuthenticationConverter();
        jwtAuthenticationConverter.setJwtGrantedAuthoritiesConverter(customJwtAuthenticationConverter);
        return jwtAuthenticationConverter;
    }

}
