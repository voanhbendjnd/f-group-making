package tech.djnd.sample.app.service.dto;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.FieldDefaults;

import java.time.Instant;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class StudentDTO {
    Long userId;
    String rollNumber;
    String fullName;
    String email;
    String memberCode;
    Integer majorId;
    String majorCode;
    String majorName;
    Boolean activated;
    Boolean hasActivationKey;
    Instant activationKeyExpiresAt;
    Boolean isKeyExpired;
    Instant createdDate;
    Instant lastModifiedDate;
    String lecturerCode;
}
