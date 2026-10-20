package com.fmaking.service.dto;

import jakarta.validation.constraints.Size;

public record UpdateStudentBioRequest(
    @Size(max = 500, message = "Bio must not exceed 500 characters")
    String bio
) {}
