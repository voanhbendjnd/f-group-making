package com.fmaking.service.dto;

import com.fmaking.domain.ZaloShare.Scope;
import jakarta.validation.constraints.*;
import java.time.Instant;

public record ZaloShareDTO(Long id, Integer classId, String className, Long lecturerId, String lecturerName,
    Integer termId, String termName, Scope scope, String title,
    String inviteUrl, String description, boolean hasQr, Long version, Instant updatedAt) {

    public record Write(@NotNull Scope scope,
        @NotBlank @Size(max = 100) String title,
        @NotBlank @Size(max = 512) String inviteUrl,
        @Size(max = 500) String description, @PositiveOrZero Long version, boolean removeQr) {}

}
