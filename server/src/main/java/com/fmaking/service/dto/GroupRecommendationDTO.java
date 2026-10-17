package com.fmaking.service.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GroupRecommendationDTO {
    private Long groupId;
    private String groupName;
    private int currentMembers;
    private int maxMembers;
    private int matchScore;
    @Builder.Default
    private List<String> matchReasons = new ArrayList<>();
    private boolean isEligible;
}
