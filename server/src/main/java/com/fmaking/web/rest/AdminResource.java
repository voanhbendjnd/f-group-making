package com.fmaking.web.rest;

import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import com.fmaking.security.AuthoritiesConstants;
import com.fmaking.service.MailService;
import com.fmaking.service.UserService;
import com.fmaking.service.dto.CreateAdminDTO;
import com.fmaking.service.dto.UserDTO;
import com.fmaking.util.anotation.ApiMessage;

/**
 * REST controller for managing Admin operations.
 */
@Slf4j
@RestController
@RequestMapping("/api/admin")
public class AdminResource {

    private final UserService userService;
    private final MailService mailService;

    public AdminResource(UserService userService, MailService mailService) {
        this.userService = userService;
        this.mailService = mailService;
    }

    /**
     * POST /api/admin/users : Create a new Admin user account.
     * Only authenticated ADMIN users can perform this action.
     * Sends an activation email so the newly created admin can set their own password.
     */
    @PostMapping("/users")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    @ApiMessage("Create admin account successfully")
    public ResponseEntity<UserDTO> createAdmin(@Valid @RequestBody CreateAdminDTO request) {
        log.debug("REST request to create new Admin user: email={}, name={}, sendEmail={}",
                request.getEmail(), request.getName(), request.getSendActivationEmail());
        UserDTO created = userService.createAdmin(request);
        if (created.getActivationKey() != null && (request.getSendActivationEmail() == null || Boolean.TRUE.equals(request.getSendActivationEmail()))) {
            mailService.sendActivationEmail(created);
        }
        created.setActivationKey(null);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
}
