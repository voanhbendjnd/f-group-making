package com.fmaking.web.rest;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.fmaking.service.StudentProfileService;
import com.fmaking.service.dto.StudentProfileDTO;
import com.fmaking.util.anotation.ApiMessage;

@RestController
@RequestMapping("/api/me/student-profile")
public class StudentProfileResource {
    private final StudentProfileService studentProfileService;

    public StudentProfileResource(StudentProfileService studentProfileService) {
        this.studentProfileService = studentProfileService;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('ROLE_STUDENT')")
    @ApiMessage("Get student profile successfully")
    public ResponseEntity<StudentProfileDTO> getCurrentProfile() {
        return ResponseEntity.ok(studentProfileService.getCurrentProfile());
    }

    @org.springframework.web.bind.annotation.PutMapping("/bio")
    @PreAuthorize("hasAuthority('ROLE_STUDENT')")
    @ApiMessage("Update student bio successfully")
    public ResponseEntity<java.util.Map<String, String>> updateBio(
            @jakarta.validation.Valid @org.springframework.web.bind.annotation.RequestBody com.fmaking.service.dto.UpdateStudentBioRequest request) {
        String updated = studentProfileService.updateBio(request.bio());
        return ResponseEntity.ok(java.util.Map.of("bio", updated != null ? updated : ""));
    }

    @org.springframework.web.bind.annotation.DeleteMapping("/bio")
    @PreAuthorize("hasAuthority('ROLE_STUDENT')")
    @ApiMessage("Delete student bio successfully")
    public ResponseEntity<Void> deleteBio() {
        studentProfileService.deleteBio();
        return ResponseEntity.noContent().build();
    }
}
