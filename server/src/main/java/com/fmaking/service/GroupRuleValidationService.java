package com.fmaking.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fmaking.domain.GroupingRuleCode;
import com.fmaking.domain.Rule;
import com.fmaking.repository.RuleRepository;
import com.fmaking.service.dto.GroupMemberDTO;
import com.fmaking.service.dto.GroupRuleEvaluationDTO;
import com.fmaking.service.dto.GroupingRuleDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.fmaking.domain.GroupingRuleCode.*;

@Service
public class GroupRuleValidationService {

    private final Logger log = LoggerFactory.getLogger(GroupRuleValidationService.class);
    private final RuleRepository ruleRepository;
    private final ObjectMapper objectMapper;

    public GroupRuleValidationService(RuleRepository ruleRepository, ObjectMapper objectMapper) {
        this.ruleRepository = ruleRepository;
        this.objectMapper = objectMapper;
    }

    public static boolean isHardRule(GroupingRuleCode code) {
        return code == MIN_MEMBERS_PER_GROUP ||
               code == MAX_MEMBERS_PER_GROUP ||
               code == MIN_SE_MEMBERS_PER_GROUP;
    }

    public int getMaxMembers(Integer schoolClassId) {
        return getClassRules(schoolClassId).stream()
            .filter(rule -> rule.code() == MAX_MEMBERS_PER_GROUP)
            .mapToInt(rule -> rule.status() ? rule.value() : Integer.MAX_VALUE)
            .findFirst().orElse(MAX_MEMBERS_PER_GROUP.getSuggestedValue());
    }

    // Minimums are completion criteria, not admission criteria for draft groups.
    public boolean areFormationRulesPassed(Integer schoolClassId, List<GroupMemberDTO> members) {
        return evaluateGroup(schoolClassId, members).stream()
            .filter(rule -> rule.getCode() == MAX_MEMBERS_PER_GROUP || rule.getCode() == MAX_MAJORS_PER_GROUP)
            .allMatch(GroupRuleEvaluationDTO::isPassed);
    }

    public List<GroupingRuleDTO> getClassRules(Integer schoolClassId) {
        List<Rule> storedRules = ruleRepository.findBySchoolClassId(schoolClassId);
        Map<String, Rule> byCode = storedRules.stream().collect(Collectors.toMap(Rule::getCode, Function.identity()));
        return Arrays.stream(GroupingRuleCode.values()).map(code -> new GroupingRuleDTO(code,
                byCode.containsKey(code.name()) ? byCode.get(code.name()).getValue() : code.getSuggestedValue(),
                byCode.containsKey(code.name()) ? byCode.get(code.name()).getStatus() : code.isEnabledByDefault())).toList();
    }

    public List<GroupRuleEvaluationDTO> evaluateGroup(Integer schoolClassId, List<GroupMemberDTO> members) {
        List<Rule> storedRules = ruleRepository.findBySchoolClassId(schoolClassId);
        Map<String, Rule> byCode = storedRules.stream().collect(Collectors.toMap(Rule::getCode, Function.identity()));

        List<GroupRuleEvaluationDTO> evaluations = new ArrayList<>();

        int memberCount = members != null ? members.size() : 0;
        Set<Integer> distinctMajorIds = members != null ? members.stream()
            .map(GroupMemberDTO::getMajorId)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet()) : Collections.emptySet();

        long seCount = members != null ? members.stream()
            .filter(m -> m.getMajorCode() != null && "SE".equalsIgnoreCase(m.getMajorCode().trim()))
            .count() : 0;

        for (GroupingRuleCode code : GroupingRuleCode.values()) {
            Rule stored = byCode.get(code.name());
            boolean active = stored == null ? code.isEnabledByDefault() : Boolean.TRUE.equals(stored.getStatus());
            if (!active) {
                continue;
            }

            int targetValue = stored != null ? stored.getValue() : code.getSuggestedValue();
            boolean hard = isHardRule(code);

            GroupRuleEvaluationDTO.GroupRuleEvaluationDTOBuilder eval = GroupRuleEvaluationDTO.builder()
                .code(code)
                .ruleName(code.name())
                .hardRule(hard)
                .targetValue(targetValue);

            switch (code) {
                case MIN_MEMBERS_PER_GROUP -> {
                    boolean passed = memberCount >= targetValue;
                    eval.actualValue(memberCount);
                    eval.passed(passed);
                    eval.message(passed
                        ? String.format("Đạt số lượng thành viên tối thiểu (%d/%d)", memberCount, targetValue)
                        : String.format("Cần tối thiểu %d thành viên (hiện có %d)", targetValue, memberCount));
                    evaluations.add(eval.build());
                }
                case MAX_MEMBERS_PER_GROUP -> {
                    boolean passed = memberCount <= targetValue;
                    eval.actualValue(memberCount);
                    eval.passed(passed);
                    eval.message(passed
                        ? String.format("Không vượt quá số lượng tối đa (%d/%d)", memberCount, targetValue)
                        : String.format("Vượt quá số lượng tối đa cho phép (%d/%d)", memberCount, targetValue));
                    evaluations.add(eval.build());
                }
                case MIN_MAJORS_PER_GROUP -> {
                    int actualMajors = distinctMajorIds.size();
                    boolean passed = actualMajors >= targetValue;
                    eval.actualValue(actualMajors);
                    eval.passed(passed);
                    eval.message(passed
                        ? String.format("Đạt số lượng chuyên ngành tối thiểu (%d/%d)", actualMajors, targetValue)
                        : String.format("Cần tối thiểu %d chuyên ngành khác nhau (hiện có %d)", targetValue, actualMajors));
                    evaluations.add(eval.build());
                }
                case MAX_MAJORS_PER_GROUP -> {
                    int actualMajors = distinctMajorIds.size();
                    boolean passed = actualMajors <= targetValue;
                    eval.actualValue(actualMajors);
                    eval.passed(passed);
                    eval.message(passed
                        ? String.format("Không vượt quá số chuyên ngành tối đa (%d/%d)", actualMajors, targetValue)
                        : String.format("Vượt quá số chuyên ngành tối đa (%d/%d)", actualMajors, targetValue));
                    evaluations.add(eval.build());
                }
                case MIN_SE_MEMBERS_PER_GROUP -> {
                    boolean passed = seCount >= targetValue;
                    eval.actualValue((int) seCount);
                    eval.passed(passed);
                    eval.message(passed
                        ? String.format("Đạt số lượng sinh viên SE tối thiểu (%d/%d)", seCount, targetValue)
                        : String.format("Cần tối thiểu %d sinh viên chuyên ngành SE (hiện có %d)", targetValue, seCount));
                    evaluations.add(eval.build());
                }
                default -> {
                    // MIN_GROUPS_PER_CLASS, MAX_GROUPS_PER_CLASS are class-level rules, not per-group rules
                }
            }
        }

        return evaluations;
    }

    public boolean areAllRulesPassed(List<GroupRuleEvaluationDTO> evaluations) {
        if (evaluations == null || evaluations.isEmpty()) return true;
        return evaluations.stream().allMatch(GroupRuleEvaluationDTO::isPassed);
    }

    public boolean hasHardRuleViolations(List<GroupRuleEvaluationDTO> evaluations) {
        if (evaluations == null || evaluations.isEmpty()) return false;
        return evaluations.stream().anyMatch(e -> e.isHardRule() && !e.isPassed());
    }

    public List<GroupRuleEvaluationDTO> getHardRuleViolations(List<GroupRuleEvaluationDTO> evaluations) {
        if (evaluations == null) return Collections.emptyList();
        return evaluations.stream().filter(e -> e.isHardRule() && !e.isPassed()).toList();
    }

    public List<GroupRuleEvaluationDTO> getSoftRuleViolations(List<GroupRuleEvaluationDTO> evaluations) {
        if (evaluations == null) return Collections.emptyList();
        return evaluations.stream().filter(e -> !e.isHardRule() && !e.isPassed()).toList();
    }

    public String serializeSnapshot(List<GroupRuleEvaluationDTO> evaluations) {
        try {
            return objectMapper.writeValueAsString(evaluations);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize rule evaluation snapshot", e);
            return "[]";
        }
    }
}
