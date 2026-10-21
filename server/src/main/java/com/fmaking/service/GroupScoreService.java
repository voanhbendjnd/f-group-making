package com.fmaking.service;

import com.fmaking.domain.GroupingRuleCode;
import com.fmaking.service.dto.GroupMemberDTO;
import com.fmaking.service.dto.GroupRuleEvaluationDTO;
import com.fmaking.service.dto.GroupScoreDTO;
import com.fmaking.service.dto.GroupingRuleDTO;
import com.fmaking.service.dto.GroupScoreDTO.Criterion;
import com.fmaking.service.dto.GroupScoreDTO.CriterionScore;
import com.fmaking.service.dto.GroupScoreDTO.RuleScore;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Objects;

@Service
public class GroupScoreService {
    private final GroupRuleValidationService ruleValidationService;

    public GroupScoreService(GroupRuleValidationService ruleValidationService) {
        this.ruleValidationService = ruleValidationService;
    }

    /** Accepts stored or hypothetical members and never writes data. */
    public GroupScoreDTO evaluate(Integer classId, List<GroupMemberDTO> members) {
        Objects.requireNonNull(classId, "classId");
        Objects.requireNonNull(members, "members");
        var evaluations = ruleValidationService.evaluateGroup(classId, members);
        return score(members, evaluations);
    }

    /** Uses the same captured rules as allocation validation, with no repository access. */
    public GroupScoreDTO evaluateRules(List<GroupingRuleDTO> rules, List<GroupMemberDTO> members) {
        Objects.requireNonNull(members, "members");
        return score(members, ruleValidationService.evaluateRules(rules, members));
    }

    private GroupScoreDTO score(List<GroupMemberDTO> members, List<GroupRuleEvaluationDTO> evaluations) {
        var grouped = new EnumMap<Criterion, List<GroupRuleEvaluationDTO>>(Criterion.class);
        for (var evaluation : evaluations) {
            Criterion criterion = criterion(evaluation.getCode());
            if (criterion != null) grouped.computeIfAbsent(criterion, key -> new ArrayList<>()).add(evaluation);
        }
        boolean passed = ruleValidationService.areAllRulesPassed(evaluations);
        if (grouped.isEmpty()) return new GroupScoreDTO(null, false, passed, List.of());

        int totalWeight = grouped.keySet().stream().mapToInt(GroupScoreService::weight).sum();
        List<CriterionScore> breakdown = new ArrayList<>();
        double total = 0;
        for (var entry : grouped.entrySet()) {
            var rules = entry.getValue();
            double fulfillment = rules.stream().mapToDouble(GroupScoreService::fulfillment).min().orElseThrow();
            // An empty group is never presented as complete, even with maximum-only rules.
            if (members.isEmpty()) fulfillment = 0;
            double effectiveWeight = 100.0 * weight(entry.getKey()) / totalWeight;
            double contribution = effectiveWeight * fulfillment;
            total += contribution;
            breakdown.add(new CriterionScore(entry.getKey(), weight(entry.getKey()), round(effectiveWeight),
                round(100 * fulfillment), round(contribution), rules.stream().map(rule -> new RuleScore(
                    rule.getCode(), rule.getActualValue(), rule.getTargetValue(), rule.isPassed(),
                    round(100 * fulfillment(rule)))).toList()));
        }
        return new GroupScoreDTO(round(total), true, passed, List.copyOf(breakdown));
    }

    private static Criterion criterion(GroupingRuleCode code) {
        return switch (code) {
            case MIN_MEMBERS_PER_GROUP, MAX_MEMBERS_PER_GROUP -> Criterion.MEMBERS;
            case MIN_MAJORS_PER_GROUP, MAX_MAJORS_PER_GROUP -> Criterion.MAJORS;
            case MIN_SE_MEMBERS_PER_GROUP -> Criterion.SE;
            default -> null; // Group-count rules belong to the whole allocation plan.
        };
    }

    private static int weight(Criterion criterion) {
        return switch (criterion) {
            case MEMBERS -> 40;
            case MAJORS -> 35;
            case SE -> 25;
        };
    }

    private static double fulfillment(GroupRuleEvaluationDTO rule) {
        int actual = rule.getActualValue();
        int target = rule.getTargetValue();
        return switch (rule.getCode()) {
            case MAX_MEMBERS_PER_GROUP, MAX_MAJORS_PER_GROUP -> actual <= target ? 1 : (double) target / actual;
            default -> target == 0 ? 1 : Math.min(1, (double) actual / target);
        };
    }

    private static double round(double value) {
        return BigDecimal.valueOf(value).setScale(1, RoundingMode.HALF_UP).doubleValue();
    }
}
