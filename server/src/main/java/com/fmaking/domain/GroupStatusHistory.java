package com.fmaking.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

import java.io.Serial;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "group_status_history", indexes = {
    @Index(name = "idx_gsh_group_id", columnList = "group_id")
})
@Getter
@Setter
public class GroupStatusHistory implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotNull
    @Column(name = "group_id", nullable = false)
    private Long groupId;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", length = 20, nullable = false)
    private GroupStatus fromStatus;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", length = 20, nullable = false)
    private GroupStatus toStatus;

    @NotNull
    @Column(name = "changed_by", length = 50, nullable = false)
    private String changedBy;

    @Column(name = "reason", columnDefinition = "TEXT")
    private String reason;

    @NotNull
    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
