package com.fmaking.service.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Locale;

public record CreateLecturerDTO(
        @NotBlank @Size(min = 2, max = 50) String code,
        @NotBlank @Email @Size(max = 254) String email
) {
    public CreateLecturerDTO {
        code = code == null ? null : code.trim();
        email = email == null ? null : email.trim().toLowerCase(Locale.ENGLISH);
    }
}
