package com.fmaking.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.Instant;

@Entity
@Table(name = "allocation_apply_requests", uniqueConstraints = @UniqueConstraint(name = "uk_aar_key",
    columnNames = {"owner_id", "school_class_id", "deadline_id", "key_hash"}),
    indexes = @Index(name = "idx_aar_expiry", columnList = "expires_at"))
@Getter @Setter
public class AllocationApplyRequest {
    public enum Status { READY, PROCESSING, FAILED, SUCCEEDED }
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "owner_id", nullable = false) private Long ownerId;
    @Column(name = "school_class_id", nullable = false) private Integer schoolClassId;
    @Column(name = "deadline_id", nullable = false) private Integer deadlineId;
    @Column(name = "preview_id", nullable = false, length = 36) private String previewId;
    @Column(name = "key_hash", nullable = false, length = 64) private String keyHash;
    @Column(name = "request_hash", nullable = false, length = 64) private String requestHash;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private Status status = Status.READY;
    @Column(name = "result_json", columnDefinition = "LONGTEXT") private String resultJson;
    @Column(name = "failure_code", length = 80) private String failureCode;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Version private long version;
}
