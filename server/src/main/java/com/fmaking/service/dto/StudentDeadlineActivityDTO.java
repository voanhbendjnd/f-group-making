package com.fmaking.service.dto;

import com.fmaking.domain.DeadlineStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StudentDeadlineActivityDTO {

    private Integer deadlineId;
    private String deadlineName;
    private String deadlineDescription;
    private Instant startTime;
    private Instant endTime;
    private DeadlineStatus status;
    private Integer schoolClassId;
    private String schoolClassName;

    // Thông tin nhóm của sinh viên trong đợt này
    private boolean hasGroup;
    private Long groupId;
    private String groupName;
    private String groupStatus; // OPEN, SUBMITTED, APPROVED, REJECTED
    private Integer memberCount;
    private Integer maxMembers;
    private boolean isLeader;
}
