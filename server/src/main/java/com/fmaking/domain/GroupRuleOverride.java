package com.fmaking.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

import java.io.Serial;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "group_rule_overrides", indexes = {
    @Index(name = "idx_gro_group_id", columnList = "group_id")
})
@Getter
@Setter
public class GroupRuleOverride implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotNull
    @Column(name = "group_id", nullable = false)
    private Long groupId;

    @NotNull
    @Column(name = "lecturer_username", length = 50, nullable = false)
    private String lecturerUsername;

    @NotNull
    @Column(name = "violated_rules", columnDefinition = "TEXT", nullable = false)
    private String violatedRules;

    @NotNull
    @Column(name = "override_reason", columnDefinition = "TEXT", nullable = false)
    private String overrideReason;

    @NotNull
    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
