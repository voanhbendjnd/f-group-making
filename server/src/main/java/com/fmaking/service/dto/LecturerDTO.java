package com.fmaking.service.dto;

import lombok.*;

import java.time.Instant;
import java.util.Set;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LecturerDTO {
    private Long userId;
    @Builder.Default
    private Set<String> authorities = Set.of();
    private String code;
    private String name;
    private String email;
    private Boolean activated;
    private Boolean hasActivationKey;
    private Instant activationKeyExpiresAt;
    private Boolean isKeyExpired;
    private Instant createdDate;
    private Instant lastModifiedDate;
}
