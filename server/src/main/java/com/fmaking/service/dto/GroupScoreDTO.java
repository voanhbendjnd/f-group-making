package com.fmaking.service.dto;

import com.fmaking.domain.GroupingRuleCode;

import java.util.List;

/** Completion score only; authorization, membership integrity and class rules remain separate checks. */
public record GroupScoreDTO(Double scorePercent, boolean applicable, boolean compositionRulesPassed,
                            List<CriterionScore> breakdown) {
    public enum Criterion { MEMBERS, MAJORS, SE }

    public record CriterionScore(Criterion code, int baseWeight, double effectiveWeightPercent,
                                 double fulfillmentPercent, double contributionPercent,
                                 List<RuleScore> rules) {}

    public record RuleScore(GroupingRuleCode code, int actualValue, int targetValue,
                            boolean passed, double fulfillmentPercent) {}
}
