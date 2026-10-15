package com.fmaking.service.dto;

import com.fmaking.domain.GroupingRuleCode;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GroupRuleEvaluationDTO {
    private GroupingRuleCode code;
    private String ruleName;
    private boolean hardRule;
    private int targetValue;
    private int actualValue;
    private boolean passed;
    private String message;
}
