package tech.djnd.sample.app.service.projection;

import java.time.Instant;

public record StudentRow(
        Long userId,
        String rollNumber,
        String fullName,
        String email,
        String memberCode,
        Integer majorId,
        String majorCode,
        String majorName,
        Boolean activated,
        String activationKey,
        Instant activationKeyExpiresAt,
        Instant createdDate,
        Instant lastModifiedDate
) {}
