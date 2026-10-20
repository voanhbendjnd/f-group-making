package com.fmaking.service.dto;

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
public class WorkspaceDTO {
    private Integer deadlineId;
    private String deadlineName;
    private String deadlineDescription;
    private String deadlineStatus;
    private Instant deadlineStartTime;
    private Instant deadlineEndTime;
    private boolean deadlineExpired;
    private String readOnlyReason;
    private boolean canManageGroups;

    private Integer schoolClassId;
    private String schoolClassName;
    private Long lecturerId;
    private long rulesVersion;

    private GroupDTO myGroup;
    private boolean isLeader;

    @Builder.Default
    private List<GroupDTO> groups = new ArrayList<>();

    @Builder.Default
    private List<GroupMemberDTO> unassignedStudents = new ArrayList<>();

    @Builder.Default
    private List<GroupingRuleDTO> rules = new ArrayList<>();

    private boolean canCreateGroup;
    private boolean canJoinGroup;
    private boolean isLecturer;

    @com.fasterxml.jackson.annotation.JsonProperty("isLeader")
    public boolean isLeader() { return isLeader; }

    @com.fasterxml.jackson.annotation.JsonProperty("isLecturer")
    public boolean isLecturer() { return isLecturer; }
}
