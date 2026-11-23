package com.fmaking.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.fmaking.domain.User;
import com.fmaking.repository.UserRepository;
import com.fmaking.security.SecurityUtils;
import com.fmaking.security.SessionManager;
import com.fmaking.service.dto.ResLoginDTO;
import com.fmaking.service.errors.DataResourceNotFoundException;

import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class AuthService {
    private final UserRepository userRepository;
    private final SessionManager sessionManager;
    private final SecurityUtils securityUtils;
    private final CacheManager cacheManager;
    private final SimpMessagingTemplate messagingTemplate;

    public AuthService(UserRepository userRepository, SessionManager sessionManager, SecurityUtils securityUtils, CacheManager cacheManager) {
        this(userRepository, sessionManager, securityUtils, cacheManager, null);
    }

    @Autowired
    public AuthService(UserRepository userRepository, SessionManager sessionManager, SecurityUtils securityUtils,
                       CacheManager cacheManager,
                       @Autowired(required = false) SimpMessagingTemplate messagingTemplate) {
        this.userRepository = userRepository;
        this.sessionManager = sessionManager;
        this.securityUtils = securityUtils;
        this.cacheManager = cacheManager;
        this.messagingTemplate = messagingTemplate;
    }

    @Transactional
    public ResLoginDTO generateResLoginDTO(User user){
        // Serialize token issuance with role changes and reload authorities instead of trusting a cached login snapshot.
        user = userRepository.findByIdForUpdate(user.getId()).orElseThrow(() ->
            new DataResourceNotFoundException("User not found", "userManagement", "idnotfound"));

        String oldSessionId = user.getSessionId();

        ResLoginDTO res = new ResLoginDTO();
        var userLogin = new ResLoginDTO.UserLogin();
        userLogin.setEmail(user.getEmail());
        userLogin.setId(user.getId());
        userLogin.setName(user.getName());
        Set<String> authorityName = userRepository.findAuthorityNamesById(user.getId());
        userLogin.setAuthorities(authorityName);
        String sessionId = sessionManager.initSessionId(user.getId());
        user.setSessionId(sessionId);
        String newAccessToken = securityUtils.createAccessToken(userLogin, sessionId, authorityName);
        res.setUser(userLogin);
        res.setAccessToken(newAccessToken);

        String newRefreshToken = securityUtils.createRefreshToken(userLogin);
        user.setRefreshToken(newRefreshToken);
        userRepository.saveAndFlush(user);

        if (cacheManager != null && user.getEmail() != null) {
            var cacheByEmail = cacheManager.getCache(UserRepository.USERS_BY_EMAIL_CACHE);
            if (cacheByEmail != null) {
                cacheByEmail.evict(user.getEmail().trim().toLowerCase(Locale.ENGLISH));
            }
        }

        // Realtime notification: Notify existing session to terminate immediately upon concurrent login
        if (oldSessionId != null && messagingTemplate != null && user.getEmail() != null) {
            try {
                Map<String, Object> sessionEvent = Map.of(
                    "eventType", "SESSION_TERMINATED_CONCURRENT_LOGIN",
                    "code", "SESSION_TERMINATED_CONCURRENT_LOGIN",
                    "errorKey", "sessionConcurrentLogin",
                    "message", "Tài khoản đã được đăng nhập trên thiết bị khác",
                    "invalidatedSessionId", oldSessionId,
                    "activeSessionId", sessionId
                );
                messagingTemplate.convertAndSendToUser(user.getEmail().trim().toLowerCase(Locale.ENGLISH), "/queue/session", sessionEvent);
            } catch (Exception ignored) {
            }
        }

        res.setRefreshToken(newRefreshToken);
        return res;
    }
}
