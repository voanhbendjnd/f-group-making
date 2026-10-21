package com.fmaking.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.Instant;

@Entity
@Table(name = "allocation_runs", uniqueConstraints = {
    @UniqueConstraint(name = "uk_ar_preview", columnNames = "preview_id"),
    @UniqueConstraint(name = "uk_ar_request", columnNames = "apply_request_id")
}, indexes = @Index(name = "idx_ar_scope_time", columnList = "school_class_id,deadline_id,applied_at"))
@Getter @Setter
public class AllocationRun {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "preview_id", nullable = false, length = 36) private String previewId;
    @Column(name = "apply_request_id") private Long applyRequestId;
    @Column(name = "actor_id", nullable = false) private Long actorId;
    @Column(name = "school_class_id", nullable = false) private Integer schoolClassId;
    @Column(name = "deadline_id", nullable = false) private Integer deadlineId;
    @Column(name = "target_count", nullable = false) private int targetCount;
    @Column(nullable = false) private long seed;
    @Column(name = "applied_at", nullable = false) private Instant appliedAt;
    @Column(name = "snapshot_fingerprint", nullable = false, length = 64) private String snapshotFingerprint;
    @Column(name = "plan_fingerprint", nullable = false, length = 64) private String planFingerprint;
    @Column(name = "result_json", nullable = false, columnDefinition = "LONGTEXT") private String resultJson;
}
