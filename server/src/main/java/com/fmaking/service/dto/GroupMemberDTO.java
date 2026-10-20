package com.fmaking.service.dto;

import com.fmaking.domain.GroupMemberRole;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GroupMemberDTO {
    private Long id;
    private Long groupId;
    private Long studentId;
    private String rollNumber;
    private String fullName;
    private String email;
    private String memberCode;
    private Integer majorId;
    private String majorCode;
    private String majorName;
    private GroupMemberRole role;
    private Instant joinedAt;
    private String selfDescription;
    private Integer matchScore;
    private java.util.List<String> matchReasons;
}
