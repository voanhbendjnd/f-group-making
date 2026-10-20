package com.fmaking.security;


import org.springframework.data.domain.AuditorAware;
import org.springframework.stereotype.Component;
import com.fmaking.config.Constants;

import java.util.Optional;
@Component
public class SpringSecurityAuditorAware implements AuditorAware<String> {
    @Override
    public Optional<String> getCurrentAuditor() {
        return Optional.of(SecurityUtils.getCurrentUserLogin().orElse(Constants.SYSTEM_ACCOUNT));
    }
}