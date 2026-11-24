package com.fmaking.service.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Locale;

public record CreateLecturerDTO(
        @NotBlank
        @Size(min = 2, max = 50)
        @Pattern(regexp = "^[A-Za-z0-9_.-]+$", message = "lecturerCreate.invalid.codePattern")
        String code,

        @NotBlank
        @Size(max = 254)
        @Pattern(regexp = "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$", message = "lecturerCreate.invalid.email")
        String email
) {
    public CreateLecturerDTO {
        code = code == null ? null : code.trim();
        email = email == null ? null : email.trim().toLowerCase(Locale.ENGLISH);
    }
}
