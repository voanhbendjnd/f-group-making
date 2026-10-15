package com.fmaking.service.dto;

import com.fmaking.domain.GroupStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GroupDTO {
    private Long id;
    private Integer deadlineId;
    private Integer schoolClassId;
    private String name;
    private Long leaderId;
    private String leaderName;
    private GroupStatus status;
    private int memberCount;
    private int maxMembers;
    private String rejectReason;
    private Long submittedRulesVersion;
    private Boolean isLecturerCreated;
    private Long version;
    private Instant createdDate;

    @Builder.Default
    private List<GroupMemberDTO> members = new ArrayList<>();

    @Builder.Default
    private List<GroupRuleEvaluationDTO> ruleEvaluations = new ArrayList<>();

    private boolean allRulesPassed;
    private boolean hasHardRuleViolations;
}
