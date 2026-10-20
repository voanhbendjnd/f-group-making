package com.fmaking.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

import java.io.Serial;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "group_member_history", indexes = {
    @Index(name = "idx_gmh_group_id", columnList = "group_id"),
    @Index(name = "idx_gmh_student_id", columnList = "student_id"),
    @Index(name = "idx_gmh_deadline_id", columnList = "deadline_id")
})
@Getter
@Setter
public class GroupMemberHistory implements Serializable {

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
    @Column(name = "deadline_id", nullable = false)
    private Integer deadlineId;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "action", length = 30, nullable = false)
    private GroupMemberAction action;

    @NotNull
    @Column(name = "performed_by", length = 50, nullable = false)
    private String performedBy;

    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    @NotNull
    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
