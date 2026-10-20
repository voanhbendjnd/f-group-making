package com.fmaking.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.Instant;

@Entity
@Table(name = "allocation_previews", indexes = {
    @Index(name = "idx_ap_scope_owner", columnList = "school_class_id,deadline_id,owner_id"),
    @Index(name = "idx_ap_expiry", columnList = "expires_at")
})
@Getter @Setter
public class AllocationPreview {
    @Id @Column(length = 36) private String id;
    @Column(name = "owner_id", nullable = false) private Long ownerId;
    @Column(name = "school_class_id", nullable = false) private Integer schoolClassId;
    @Column(name = "deadline_id", nullable = false) private Integer deadlineId;
    @Column(name = "target_count", nullable = false) private int targetCount;
    @Column(nullable = false) private long seed;
    @Column(name = "snapshot_fingerprint", nullable = false, length = 64) private String snapshotFingerprint;
    @Column(name = "plan_fingerprint", nullable = false, length = 64) private String planFingerprint;
    @Column(name = "payload", columnDefinition = "LONGTEXT") private String payload;
    @Column(name = "format_version", nullable = false) private int formatVersion = 1;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(name = "applied_at") private Instant appliedAt;
    @Version private long version;
}
