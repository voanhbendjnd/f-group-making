package com.fmaking.service.dto;

import com.fmaking.domain.GroupInvitationStatus;
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
public class GroupInvitationDTO {
    private Long id;
    private Long groupId;
    private String groupName;
    private Long studentId;
    private String studentName;
    private String studentEmail;
    private String studentRollNumber;
    private String studentMajorCode;
    private Long inviterId;
    private String inviterName;
    private Integer deadlineId;
    private Integer schoolClassId;
    private GroupInvitationStatus status;
    private String message;
    private Instant createdAt;
    private Instant respondedAt;
    private int currentMembers;
    private int maxMembers;
    @Builder.Default
    private List<String> matchReasons = new ArrayList<>();
}
