package com.fmaking.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.validator.constraints.Length;

import java.io.Serial;
import java.io.Serializable;

@Entity
@Table(name = "`groups`", indexes = {
    @Index(name = "idx_groups_class_deadline", columnList = "school_class_id, deadline_id, status")
}, uniqueConstraints = {
    @UniqueConstraint(name = "uk_groups_class_deadline_sequence", columnNames = {"school_class_id", "deadline_id", "sequence_no"})
})
@Getter
@Setter
public class Group extends AbstractAuditingEntity<Long> implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotNull
    @Column(name = "deadline_id", nullable = false)
    private Integer deadlineId;

    @NotNull
    @Column(name = "school_class_id", nullable = false)
    private Integer schoolClassId;

    // Null for disbanded groups; identity and historical references continue to use id.
    @Column(name = "sequence_no")
    private Integer sequenceNo;

    @NotNull
    @Length(max = 100, min = 2)
    @Column(name = "name", length = 100, nullable = false)
    private String name;

    @NotNull
    @Column(name = "leader_id", nullable = false)
    private Long leaderId;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 20, nullable = false)
    private GroupStatus status = GroupStatus.OPEN;

    @Column(name = "reject_reason", columnDefinition = "TEXT")
    private String rejectReason;

    @Column(name = "submitted_rules_version")
    private Long submittedRulesVersion;

    @Column(name = "rules_evaluation_snapshot", columnDefinition = "TEXT")
    private String rulesEvaluationSnapshot;

    @Column(name = "is_lecturer_created", nullable = false)
    private Boolean isLecturerCreated = false;

    @Version
    @Column(name = "version", nullable = false)
    private Long version = 0L;

    @Override
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }
}
