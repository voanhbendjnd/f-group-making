package tech.djnd.sample.app.service.projection;

import com.fasterxml.jackson.annotation.JsonIgnore;

import java.time.Instant;

public interface StudentProjection {

    // --- field của Student ---
    Long getUserId();
    String getRollNumber();
    String getFullName();
    String getMemberCode();
    Integer getMajorId();
    String getMajorCode();
    String getMajorName();

    @JsonIgnore
    UserInfo getUser();

    interface UserInfo {
        Boolean getActivated();
        String getActivationKey();
        Instant getActivationKeyExpiresAt();
        Instant getCreatedDate();
        Instant getLastModifiedDate();
    }

    default Boolean getActivated() {
        return getUser() != null && Boolean.TRUE.equals(getUser().getActivated());
    }

    default Boolean getHasActivationKey() {
        return getUser() != null && getUser().getActivationKey() != null;
    }

    default Instant getActivationKeyExpiresAt() {
        return getUser() != null ? getUser().getActivationKeyExpiresAt() : null;
    }

    default Boolean getIsKeyExpired() {
        if (getUser() == null) return false;
        Instant exp = getUser().getActivationKeyExpiresAt();
        return exp != null && exp.isBefore(Instant.now());
    }

    default Instant getCreatedDate() {
        return getUser() != null ? getUser().getCreatedDate() : null;
    }

    default Instant getLastModifiedDate() {
        return getUser() != null ? getUser().getLastModifiedDate() : null;
    }
}
