package com.fmaking.service.dto;

import jakarta.validation.constraints.*;
import java.util.Locale;

public record CreateStudentDTO(
        @NotBlank @Size(max = 50) String fullName,
        @NotBlank @Size(max = 255) String rollNumber,
        @NotBlank @Size(max = 255) String memberCode,
        @NotBlank @Email @Size(max = 254) String email,
        @NotNull @Positive Integer majorId,
        @NotNull @Positive Integer termId,
        @NotNull @Positive Integer schoolClassId
) {
    public CreateStudentDTO {
        fullName = fullName == null ? null : fullName.trim();
        rollNumber = rollNumber == null ? null : rollNumber.trim();
        memberCode = memberCode == null ? null : memberCode.trim();
        email = email == null ? null : email.trim().toLowerCase(Locale.ENGLISH);
    }
}
