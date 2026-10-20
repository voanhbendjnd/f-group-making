package com.fmaking.service;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.fmaking.domain.Authority;
import com.fmaking.domain.User;
import com.fmaking.repository.UserRepository;
import com.fmaking.security.SecurityUtils;
import com.fmaking.security.SessionManager;
import com.fmaking.service.dto.ResLoginDTO;
import com.fmaking.service.errors.DataResourceNotFoundException;

import java.util.Set;
import java.util.stream.Collectors;

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
        ResLoginDTO res = new ResLoginDTO();
        var userLogin = new ResLoginDTO.UserLogin();
        userLogin.setEmail(user.getEmail());
        userLogin.setId(user.getId());
        userLogin.setName(user.getName());
        Set<String> authorityName = user.getAuthorities().stream().map(Authority::getName).collect(Collectors.toSet());
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
