package com.fmaking.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fmaking.domain.GroupingRuleCode;
import com.fmaking.repository.RuleRepository;
import com.fmaking.service.dto.GroupMemberDTO;
import com.fmaking.service.dto.GroupingRuleDTO;
import com.fmaking.service.projection.StudentRow;
import org.junit.jupiter.api.Test;

import java.util.*;

import static com.fmaking.domain.GroupingRuleCode.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class GroupRecommendationPolicyTest {
    @Test void keepsRewardingNewMajorsAfterTheMinimumIsMet() {
        var policy = new GroupRecommendationPolicy(List.of());
        var se = student(1, 1, "SE");
        var eng = student(2, 2, "ENG");
        var candidates = List.of(student(3, 1, "SE"), student(4, 2, "ENG"), student(5, 3, "MKT"), student(6, 4, "GD"));
        var before = policy.scoreCandidates(List.of(se), 1, join(List.of(eng), candidates));
        assertThat(before.get(2L).score()).isGreaterThan(before.get(3L).score());
        var after = policy.scoreCandidates(List.of(se, eng), 2, candidates);
        assertThat(after.get(5L).score()).isEqualTo(60).isGreaterThan(after.get(3L).score());
        assertThat(after.get(3L).score()).isEqualTo(48).isEqualTo(after.get(4L).score());
        assertThat(after.get(5L).score()).isEqualTo(after.get(6L).score());
    }

    @Test void favorsLessRepresentedMajorsAndDoesNotUseTheBio() {
        var policy = new GroupRecommendationPolicy(List.of());
        var members = List.of(student(1, 1, "SE"), student(2, 1, "SE"), student(3, 2, "ENG"));
        var withBio = student(4, 1, "SE", "Experienced developer");
        var noBio = student(5, 1, "SE");
        var matches = policy.scoreCandidates(members, 3, List.of(withBio, noBio, student(6, 2, "ENG"), student(7, 3, "MKT")));
        assertThat(matches.get(4L)).isEqualTo(matches.get(5L));
        assertThat(matches.get(7L).score()).isGreaterThan(matches.get(6L).score());
        assertThat(matches.get(6L).score()).isGreaterThan(matches.get(4L).score());
    }

    @Test void prioritizesMissingSeWithoutClampingCandidatesToTheSameScore() {
        var policy = new GroupRecommendationPolicy(List.of(rule(MIN_SE_MEMBERS_PER_GROUP, 2, true)));
        var available = List.of(student(2, 1, " se "), student(3, 2, "ENG"), student(4, 3, "MKT"));
        var matches = policy.scoreCandidates(List.of(student(1, 1, "SE")), 1, available);
        assertThat(matches.get(2L).score()).isGreaterThan(matches.get(3L).score());
        assertThat(matches.values()).allSatisfy(match -> assertThat(match.score()).isBetween(0, 100));
    }

    @Test void reservesTheLastSeatsForMissingSe() {
        var policy = new GroupRecommendationPolicy(List.of(rule(MAX_MEMBERS_PER_GROUP, 4, true), rule(MIN_SE_MEMBERS_PER_GROUP, 3, true)));
        var members = List.of(student(1, 1, "SE"), student(2, 2, "ENG"));
        var available = List.of(student(3, 1, "SE"), student(4, 1, "SE"), student(5, 3, "MKT"));
        assertThat(policy.scoreCandidates(members, 2, available)).containsOnlyKeys(3L, 4L);
    }

    @Test void letsOneSeStudentSatisfyBothSeAndDiversity() {
        var policy = new GroupRecommendationPolicy(List.of(rule(MAX_MEMBERS_PER_GROUP, 4, true),
            rule(MIN_MAJORS_PER_GROUP, 3, true), rule(MIN_SE_MEMBERS_PER_GROUP, 1, true)));
        var members = List.of(student(1, 2, "ENG"), student(2, 2, "ENG"));
        var available = List.of(student(3, 1, "SE"), student(4, 3, "MKT"), student(5, 2, "ENG"));
        var matches = policy.scoreCandidates(members, 2, available);
        assertThat(matches).containsOnlyKeys(3L, 4L);
        assertThat(matches.get(3L).score()).isGreaterThan(matches.get(4L).score());
    }

    @Test void respectsMajorMaximumsAndDoesNotTreatAnUnknownMajorAsDiversity() {
        var rules = List.of(rule(MIN_MEMBERS_PER_GROUP, 0, false), rule(MAX_MEMBERS_PER_GROUP, 2, true),
            rule(MAX_MAJORS_PER_GROUP, 1, true), rule(MIN_MAJORS_PER_GROUP, 2, false));
        var policy = new GroupRecommendationPolicy(rules);
        var members = List.of(student(1, 1, "SE"));
        var matches = policy.scoreCandidates(members, 1,
            List.of(student(2, 1, "SE"), student(3, 2, "ENG"), student(4, null, null)));
        assertThat(matches).containsOnlyKeys(2L, 4L);
        assertThat(matches.get(2L).score()).isGreaterThan(matches.get(4L).score());
        var needsDiversity = new GroupRecommendationPolicy(List.of(rule(MIN_MEMBERS_PER_GROUP, 0, false), rule(MAX_MEMBERS_PER_GROUP, 2, true)));
        assertThat(needsDiversity.scoreCandidates(members, 1,
            List.of(student(3, 2, "ENG"), student(4, null, null)))).containsOnlyKeys(3L);
    }

    @Test void usesActualRemainingSupplyAndMajorCapsWhenCheckingCompletion() {
        var policy = new GroupRecommendationPolicy(List.of(rule(MIN_MEMBERS_PER_GROUP, 0, false),
            rule(MIN_MAJORS_PER_GROUP, 2, false), rule(MAX_MAJORS_PER_GROUP, 1, true), rule(MIN_SE_MEMBERS_PER_GROUP, 1, true)));
        var members = List.of(student(1, 2, "ENG"));
        assertThat(policy.scoreCandidates(members, 1, List.of(student(2, 2, "ENG"), student(3, 1, "SE")))).isEmpty();
    }

    @Test void disabledRulesDoNotReserveSeatsOrAwardMinimumBonuses() {
        var rules = Arrays.stream(GroupingRuleCode.values()).map(code -> rule(code, 999, false)).toList();
        var members = List.of(student(1, 1, "SE"));
        var matches = new GroupRecommendationPolicy(rules).scoreCandidates(members, 1,
            List.of(student(2, 1, "SE"), student(3, 2, "ENG")));
        assertThat(matches.get(2L).score()).isEqualTo(43);
        assertThat(matches.get(3L).score()).isEqualTo(55);
    }

    @Test void emptyGroupsHaveEqualScoresForEquivalentMajorsAndFullGroupsHaveNoSuggestions() {
        var policy = new GroupRecommendationPolicy(List.of());
        var available = List.of(student(1, 1, "SE"), student(2, 2, "ENG"), student(3, 3, "MKT"), student(4, 4, "GD"));
        assertThat(policy.scoreCandidates(List.of(), 0, available).values().stream().map(GroupRecommendationPolicy.Match::score).distinct()).hasSize(1);
        assertThat(policy.scoreCandidates(available, 6, List.of(student(5, 5, "FIN")))).isEmpty();
    }

    @Test void feasibilityMatchesExhaustiveValidationOnSmallPools() {
        var validator = new GroupRuleValidationService(mock(RuleRepository.class), new ObjectMapper());
        var random = new Random(4817);
        for (int run = 0; run < 150; run++) {
            var rules = List.of(rule(MIN_MEMBERS_PER_GROUP, 1 + random.nextInt(5), random.nextBoolean()),
                rule(MAX_MEMBERS_PER_GROUP, 2 + random.nextInt(5), random.nextBoolean()),
                rule(MIN_MAJORS_PER_GROUP, 1 + random.nextInt(3), random.nextBoolean()),
                rule(MAX_MAJORS_PER_GROUP, 1 + random.nextInt(3), random.nextBoolean()),
                rule(MIN_SE_MEMBERS_PER_GROUP, random.nextInt(4), random.nextBoolean()));
            List<StudentRow> members = new ArrayList<>();
            List<StudentRow> available = new ArrayList<>();
            for (int i = 0, size = random.nextInt(4); i < size; i++) members.add(randomStudent(i + 1, random));
            for (int i = 0; i < 5; i++) available.add(randomStudent(i + 10, random));
            var matches = new GroupRecommendationPolicy(rules).scoreCandidates(members, members.size(), available);
            for (StudentRow candidate : available) {
                var remaining = available.stream().filter(s -> !s.userId().equals(candidate.userId())).toList();
                boolean possible = false;
                for (int mask = 0; mask < (1 << remaining.size()); mask++) {
                    var completed = new ArrayList<>(members);
                    completed.add(candidate);
                    for (int i = 0; i < remaining.size(); i++) if ((mask & (1 << i)) != 0) completed.add(remaining.get(i));
                    var dtos = completed.stream().map(s -> GroupMemberDTO.builder().studentId(s.userId())
                        .majorId(s.majorId()).majorCode(s.majorCode()).build()).toList();
                    if (validator.areAllRulesPassed(validator.evaluateRules(rules, dtos))) { possible = true; break; }
                }
                assertThat(matches.containsKey(candidate.userId())).as("run %s, candidate %s, rules %s", run, candidate.userId(), rules)
                    .isEqualTo(possible);
            }
        }
    }

    private static StudentRow randomStudent(long id, Random random) {
        int major = random.nextInt(4);
        return student(id, major == 0 ? null : major, major == 0 ? null : major == 1 ? "SE" : "M" + major);
    }

    private static GroupingRuleDTO rule(GroupingRuleCode code, int value, boolean enabled) {
        return new GroupingRuleDTO(code, value, enabled);
    }

    private static StudentRow student(long id, Integer major, String code) { return student(id, major, code, null); }

    private static StudentRow student(long id, Integer major, String code, String bio) {
        return new StudentRow(id, "R" + id, "Student " + id, id + "@example.test", "M" + id,
            major, code, code, true, null, null, null, null, bio);
    }

    private static List<StudentRow> join(List<StudentRow> first, List<StudentRow> second) {
        var result = new ArrayList<>(first); result.addAll(second); return result;
    }
}
