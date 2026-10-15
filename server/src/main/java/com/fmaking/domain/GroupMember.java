package com.fmaking.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

import java.io.Serial;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "group_members",
    uniqueConstraints = {
        @UniqueConstraint(name = "uk_active_student_activity", columnNames = {"student_id", "deadline_id"})
    },
    indexes = {
        @Index(name = "idx_gm_group_student", columnList = "group_id, student_id")
    }
)
@Getter
@Setter
public class GroupMember implements Serializable {

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
    @Column(name = "school_class_id", nullable = false)
    private Integer schoolClassId;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "role", length = 20, nullable = false)
    private GroupMemberRole role = GroupMemberRole.MEMBER;

    @NotNull
    @Column(name = "joined_at", nullable = false)
    private Instant joinedAt;
}
