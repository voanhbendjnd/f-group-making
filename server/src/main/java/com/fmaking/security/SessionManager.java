package com.fmaking.security;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import com.fmaking.domain.User;
import com.fmaking.repository.UserRepository;
import com.fmaking.service.errors.DataResourceNotFoundException;
import com.fmaking.service.errors.NotAuthorizedException;

import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Service
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@RequiredArgsConstructor
public class SessionManager {
    private static final String NULL_SESSION_SENTINEL = "";

    UserRepository userRepository;
    ConcurrentMap<String, String> sessionCache = new ConcurrentHashMap<>();

    public String initSessionId(Long userId) {
        String newSessionId = UUID.randomUUID().toString();
        int updated = userRepository.updateSessionIdById(userId, newSessionId);
        if (updated > 0) {
            userRepository.findById(userId)
                    .map(User::getEmail)
                    .ifPresent(email -> updateSessionCache(email, newSessionId));
            return newSessionId;
        }
        throw new DataResourceNotFoundException(String.format("User with ID %d not found!", userId), "userManagement", "idnotfound");
    }

    public void updateSessionCache(String email, String sessionId) {
        String normalizedEmail = normalize(email);
        if (normalizedEmail == null) return;
        sessionCache.put(normalizedEmail, sessionId == null ? NULL_SESSION_SENTINEL : sessionId);
        evictOnRollback(normalizedEmail);
    }

    public void evictSessionCache(String email) {
        String normalizedEmail = normalize(email);
        if (normalizedEmail != null) {
            sessionCache.remove(normalizedEmail);
        }
    }

    public void revokeSession(User user) {
        if (user == null) return;
        String revoked = "REVOKED-" + UUID.randomUUID();
        user.setSessionId(revoked);
        updateSessionCache(user.getEmail(), revoked);
    }

    public boolean isValidSessionIdByEmail(String email, String sessionId) {
        if (sessionId == null || email == null) return false;
        String normalizedEmail = normalize(email);
        String cached = sessionCache.get(normalizedEmail);
        if (cached != null) {
            return cached.equals(NULL_SESSION_SENTINEL) || cached.equals(sessionId);
        }
        // Session IDs change on login and role updates; the cached authority snapshot can be stale.
        User userAuthorities = userRepository.findOneByEmail(normalizedEmail)
                .orElseThrow(NotAuthorizedException::new);
        String dbSessionId = userAuthorities.getSessionId();
        updateSessionCache(normalizedEmail, dbSessionId);
        if (dbSessionId == null) {
            return true;
        }
        return dbSessionId.equals(sessionId);
    }

    private static String normalize(String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ENGLISH);
    }

    private void evictOnRollback(String normalizedEmail) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    if (status != STATUS_COMMITTED) {
                        sessionCache.remove(normalizedEmail);
                    }
                }
            });
        }
    }
}
