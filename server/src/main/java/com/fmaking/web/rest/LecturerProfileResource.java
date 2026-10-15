package com.fmaking.web.rest;

import com.fmaking.service.LecturerProfileService;
import com.fmaking.service.dto.LecturerProfileDTO;
import com.fmaking.util.anotation.ApiMessage;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me/lecturer-profile")
public class LecturerProfileResource {
    private final LecturerProfileService lecturerProfileService;

    public LecturerProfileResource(LecturerProfileService lecturerProfileService) {
        this.lecturerProfileService = lecturerProfileService;
    }

    @GetMapping
    @PreAuthorize("hasAnyAuthority('ROLE_LECTURE', 'ROLE_LECTURE_MASTER')")
    @ApiMessage("Get lecturer profile successfully")
    public ResponseEntity<LecturerProfileDTO> getCurrentProfile() {
        return ResponseEntity.ok(lecturerProfileService.getCurrentProfile());
    }
}
