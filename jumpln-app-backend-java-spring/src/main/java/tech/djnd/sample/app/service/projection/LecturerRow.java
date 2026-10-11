package tech.djnd.sample.app.service.projection;

import java.time.Instant;

public record LecturerRow(
        Long userId,
        String code,
        String name,
        String email,
        Boolean activated,
        String activationKey,
        Instant activationKeyExpiresAt,
        Instant createdDate,
        Instant lastModifiedDate
) {}
