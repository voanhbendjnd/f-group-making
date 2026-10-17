package com.fmaking.service.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StudentSearchForInviteDTO {
    private Long studentId;
    private String fullName;
    private String email;
    private String rollNumber;
    private String memberCode;
    private Integer majorId;
    private String majorCode;
    private String majorName;
    private String selfDescription;
    private boolean hasGroup;
    private Long currentGroupId;
    private String currentGroupName;
    private boolean canInvite;
    private String ruleViolationReason;
    private boolean hasPendingInvitation;
    private Long pendingInvitationId;
}
