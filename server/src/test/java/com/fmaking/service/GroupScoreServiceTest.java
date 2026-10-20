package com.fmaking.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fmaking.domain.GroupingRuleCode;
import com.fmaking.domain.Rule;
import com.fmaking.repository.RuleRepository;
import com.fmaking.service.dto.GroupMemberDTO;
import com.fmaking.service.dto.GroupScoreDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.IntStream;

import static com.fmaking.domain.GroupingRuleCode.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GroupScoreServiceTest {
    @Mock RuleRepository rules;
    GroupScoreService scores;

    @BeforeEach void setup() {
        scores = new GroupScoreService(new GroupRuleValidationService(rules, new ObjectMapper()));
    }

    @ParameterizedTest
    @CsvSource({"2,2,1,80,false", "4,2,1,100,true", "4,2,0,75,false",
        "4,1,1,82.5,false", "1,1,0,27.5,false", "8,2,1,90,false"})
    void scoresCompletionWithoutReplacingValidation(int count, int majors, int se, double expected, boolean passed) {
        when(rules.findBySchoolClassId(17)).thenReturn(List.of());
        var result = scores.evaluate(17, members(count, majors, se));
        assertThat(result.scorePercent()).isEqualTo(expected);
        assertThat(result.compositionRulesPassed()).isEqualTo(passed);
        assertThat(result.breakdown()).hasSize(3);
    }

    @Test void usesCustomThresholdsAndExplainsEachRule() {
        when(rules.findBySchoolClassId(17)).thenReturn(List.of(rule(MIN_MEMBERS_PER_GROUP, 6, true),
            rule(MIN_MAJORS_PER_GROUP, 3, true), rule(MIN_SE_MEMBERS_PER_GROUP, 2, true)));
        var result = scores.evaluate(17, members(3, 2, 1));
        assertThat(result.scorePercent()).isEqualTo(55.8);
        var memberScore = result.breakdown().getFirst();
        assertThat(memberScore.code()).isEqualTo(GroupScoreDTO.Criterion.MEMBERS);
        assertThat(memberScore.contributionPercent()).isEqualTo(20);
        assertThat(memberScore.rules().getFirst().actualValue()).isEqualTo(3);
        assertThat(memberScore.rules().getFirst().targetValue()).isEqualTo(6);
        assertThat(memberScore.rules().getFirst().passed()).isFalse();
    }

    @Test void disablingSeRenormalizesWeightsAndDoesNotPenalizeMissingSe() {
        when(rules.findBySchoolClassId(17)).thenReturn(List.of(rule(MIN_SE_MEMBERS_PER_GROUP, 99, false)));
        var result = scores.evaluate(17, members(2, 2, 0));
        assertThat(result.scorePercent()).isEqualTo(73.3);
        assertThat(result.breakdown()).extracting(GroupScoreDTO.CriterionScore::code)
            .containsExactly(GroupScoreDTO.Criterion.MEMBERS, GroupScoreDTO.Criterion.MAJORS);
        assertThat(result.breakdown().getFirst().effectiveWeightPercent()).isEqualTo(53.3);
    }

    @Test void disabledMinimumIsNotRestoredAndZeroSeMinimumIsSatisfied() {
        when(rules.findBySchoolClassId(17)).thenReturn(List.of(rule(MIN_MEMBERS_PER_GROUP, 100, false),
            rule(MIN_SE_MEMBERS_PER_GROUP, 0, true)));
        var result = scores.evaluate(17, members(2, 2, 0));
        assertThat(result.scorePercent()).isEqualTo(100);
        assertThat(result.compositionRulesPassed()).isTrue();
    }

    @Test void exceedingMajorMaximumReducesScoreEvenWhenMinimumPasses() {
        when(rules.findBySchoolClassId(17)).thenReturn(List.of(rule(MAX_MAJORS_PER_GROUP, 2, true)));
        var result = scores.evaluate(17, members(4, 4, 1));
        assertThat(result.scorePercent()).isEqualTo(82.5);
        assertThat(result.compositionRulesPassed()).isFalse();
    }

    @Test void allDisabledIsNotApplicableRatherThanPerfect() {
        when(rules.findBySchoolClassId(17)).thenReturn(Arrays.stream(GroupingRuleCode.values())
            .map(code -> rule(code, code.getSuggestedValue(), false)).toList());
        var result = scores.evaluate(17, members(4, 2, 1));
        assertThat(result.applicable()).isFalse();
        assertThat(result.scorePercent()).isNull();
        assertThat(result.breakdown()).isEmpty();
    }

    @Test void emptyGroupIsZeroEvenWithOnlyMaximumRules() {
        when(rules.findBySchoolClassId(17)).thenReturn(List.of(rule(MIN_MEMBERS_PER_GROUP, 4, false),
            rule(MIN_MAJORS_PER_GROUP, 2, false), rule(MIN_SE_MEMBERS_PER_GROUP, 1, false)));
        var result = scores.evaluate(17, List.of());
        assertThat(result.scorePercent()).isZero();
        // Composition passing maximums does not imply a valid membership/leader or approval eligibility.
        assertThat(result.compositionRulesPassed()).isTrue();
    }

    @Test void classGroupCountRulesAreNotPartOfAnIndividualScore() {
        when(rules.findBySchoolClassId(17)).thenReturn(List.of(rule(MIN_GROUPS_PER_CLASS, 20, true),
            rule(MAX_GROUPS_PER_CLASS, 21, true)));
        assertThat(scores.evaluate(17, members(4, 2, 1)).scorePercent()).isEqualTo(100);
    }

    @Test void disabledMajorsDoNotUseStoredThresholdsAndMemberMaximumCanBeDisabled() {
        when(rules.findBySchoolClassId(17)).thenReturn(List.of(rule(MIN_MAJORS_PER_GROUP, 10, false),
            rule(MAX_MAJORS_PER_GROUP, 1, false), rule(MAX_MEMBERS_PER_GROUP, 6, false)));
        var result = scores.evaluate(17, members(8, 4, 1));
        assertThat(result.scorePercent()).isEqualTo(100);
        assertThat(result.compositionRulesPassed()).isTrue();
        assertThat(result.breakdown()).extracting(GroupScoreDTO.CriterionScore::code)
            .containsExactly(GroupScoreDTO.Criterion.MEMBERS, GroupScoreDTO.Criterion.SE);
    }

    @Test void highRoundedScoreDoesNotOverrideFailingHardRule() {
        when(rules.findBySchoolClassId(17)).thenReturn(List.of(rule(MIN_SE_MEMBERS_PER_GROUP, 10000, true),
            rule(MAX_MEMBERS_PER_GROUP, 6, false)));
        var result = scores.evaluate(17, members(9999, 2, 9999));
        assertThat(result.scorePercent()).isEqualTo(100);
        assertThat(result.compositionRulesPassed()).isFalse();
        assertThat(result.breakdown().getLast().rules().getFirst().passed()).isFalse();
    }

    @Test void bioAndStoredMembershipAreNotRequiredAndInputIsNotModified() {
        when(rules.findBySchoolClassId(17)).thenReturn(List.of());
        var proposed = members(4, 2, 1);
        var before = proposed.stream().map(GroupMemberDTO::getStudentId).toList();
        var first = scores.evaluate(17, proposed);
        proposed.forEach(member -> member.setSelfDescription("Self-reported information"));
        assertThat(scores.evaluate(17, proposed)).isEqualTo(first);
        assertThat(proposed.stream().map(GroupMemberDTO::getStudentId).toList()).isEqualTo(before);
        verify(rules, times(2)).findBySchoolClassId(17);
        verifyNoMoreInteractions(rules);
    }

    @Test void rejectsMissingInputInsteadOfTreatingItAsAnEmptyGroup() {
        assertThatThrownBy(() -> scores.evaluate(17, null)).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> scores.evaluate(null, List.of())).isInstanceOf(NullPointerException.class);
        verifyNoInteractions(rules);
    }

    private static Rule rule(GroupingRuleCode code, int value, boolean enabled) {
        var rule = new Rule(); rule.setCode(code.name()); rule.setValue(value); rule.setStatus(enabled);
        return rule;
    }

    private static List<GroupMemberDTO> members(int count, int majors, int se) {
        return new ArrayList<>(IntStream.range(0, count).mapToObj(index -> {
            int major = index % majors;
            return GroupMemberDTO.builder().studentId((long) index + 1).majorId(major + 1)
                .majorCode(index < se ? " se " : "M" + major).build();
        }).toList());
    }
}
