package com.fmaking.service;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.fmaking.domain.User;
import com.fmaking.repository.UserRepository;
import com.fmaking.security.SecurityUtils;
import com.fmaking.security.SessionManager;
import com.fmaking.service.dto.ResLoginDTO;
import com.fmaking.service.errors.DataResourceNotFoundException;

import java.util.Set;

@Service
public class AuthService {
   private final UserRepository userRepository;
    private final SessionManager sessionManager;
    private final SecurityUtils securityUtils;
    public AuthService(UserRepository userRepository, SessionManager sessionManager, SecurityUtils securityUtils) {
        this.userRepository = userRepository;
        this.sessionManager = sessionManager;
        this.securityUtils = securityUtils;
    }
    @Transactional
    public ResLoginDTO generateResLoginDTO(User user){
        // Serialize token issuance with role changes and reload authorities instead of trusting a cached login snapshot.
        user = userRepository.findByIdForUpdate(user.getId()).orElseThrow(() ->
            new DataResourceNotFoundException("User not found", "userManagement", "idnotfound"));
        ResLoginDTO res = new ResLoginDTO();
        var userLogin = new ResLoginDTO.UserLogin();
        userLogin.setEmail(user.getEmail());
        userLogin.setId(user.getId());
        userLogin.setName(user.getName());
        Set<String> authorityName = userRepository.findAuthorityNamesById(user.getId());
        userLogin.setAuthorities(authorityName);
        String sessionId = sessionManager.initSessionId(user.getId());
        String newAccessToken = securityUtils.createAccessToken(userLogin, sessionId, authorityName);
        res.setUser(userLogin);
        res.setAccessToken(newAccessToken);

        String newRefreshToken = securityUtils.createRefreshToken(userLogin);
        int totalRowChanged = userRepository.updatedRefreshTokenById(userLogin.getId(), newRefreshToken);
        if(totalRowChanged <= 0){
            throw new DataResourceNotFoundException(
                    String.format("User with ID [%d] not found", userLogin.getId()),
                    "userManagement",
                    "idnotfound"
            );
        }
        res.setRefreshToken(newRefreshToken);
        return res;

    }
}
