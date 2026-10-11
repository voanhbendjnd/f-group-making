package tech.djnd.sample.app.service.dto;

import lombok.*;

import java.time.Instant;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LecturerDTO {
    private Long userId;
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
