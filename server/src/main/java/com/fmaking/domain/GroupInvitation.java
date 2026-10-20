package com.fmaking.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

import java.io.Serial;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "group_invitations",
    indexes = {
        @Index(name = "idx_gi_student_deadline", columnList = "student_id, deadline_id"),
        @Index(name = "idx_gi_group_status", columnList = "group_id, status")
    }
)
@Getter
@Setter
public class GroupInvitation implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotNull
    @Column(name = "group_id", nullable = false)
    private Long groupId;

    @NotNull
    @Column(name = "student_id", nullable = false)
    private Long studentId;

    @NotNull
    @Column(name = "inviter_id", nullable = false)
    private Long inviterId;

    @NotNull
    @Column(name = "deadline_id", nullable = false)
    private Integer deadlineId;

    @NotNull
    @Column(name = "school_class_id", nullable = false)
    private Integer schoolClassId;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 20, nullable = false)
    private GroupInvitationStatus status = GroupInvitationStatus.PENDING;

    @Column(name = "message", length = 500)
    private String message;

    @NotNull
    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "responded_at")
    private Instant respondedAt;
}
