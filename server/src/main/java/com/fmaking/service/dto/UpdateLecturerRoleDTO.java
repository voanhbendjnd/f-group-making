package com.fmaking.service.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record UpdateLecturerRoleDTO(
    @NotBlank @Pattern(regexp = "ROLE_LECTURE|ROLE_LECTURE_MASTER") String role,
    @NotBlank @Pattern(regexp = "ROLE_LECTURE|ROLE_LECTURE_MASTER") String expectedRole
) {}
