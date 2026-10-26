package com.fmaking.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fmaking.domain.*;
import com.fmaking.repository.*;
import com.fmaking.service.dto.*;
import com.fmaking.service.dto.AllocationPreviewDTO.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.SliceImpl;

import java.time.Instant;
import java.util.*;
import java.util.stream.IntStream;

import static com.fmaking.domain.GroupingRuleCode.*;
import static com.fmaking.service.dto.AllocationRecommendationDTO.ReasonCode.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AllocationRecommendationServiceTest {
    AllocationPreviewRepository repository = mock(AllocationPreviewRepository.class);
    AllocationPreviewService snapshots = mock(AllocationPreviewService.class);
    AllocationPlanHistoryService history = mock(AllocationPlanHistoryService.class);
    SchoolClassAccessService access = mock(SchoolClassAccessService.class);
    RuleRepository rulesRepository = mock(RuleRepository.class);
    GroupRuleValidationService validator = new GroupRuleValidationService(rulesRepository, new ObjectMapper());
    GroupScoreService scores = new GroupScoreService(validator);
    EntityManager em = mock(EntityManager.class);
    AllocationRecommendationService service = new AllocationRecommendationService(repository, snapshots, history, access, validator, scores, em);
    List<AllocationPreview> rows;
    Map<String, AllocationPreviewDTO> plans;
    AllocationPreviewService.Captured current;

    @BeforeEach void setup() {
        rows = new ArrayList<>(); plans = new HashMap<>();
        setCurrent(students(36), List.of(), rules());
        when(access.currentLecturerId()).thenReturn(7L);
        when(history.decode(any())).thenAnswer(inv -> plans.get(((AllocationPreview) inv.getArgument(0)).getId()));
        when(repository.findBySchoolClassIdAndDeadlineIdAndOwnerIdAndAppliedAtIsNullAndSnapshotFingerprintOrderByIdAsc(
            eq(20), eq(7), eq(7L), eq("current"), any())).thenAnswer(inv -> {
                Pageable page = inv.getArgument(4);
                int start = Math.min(rows.size(), (int) page.getOffset());
                int end = Math.min(rows.size(), start + page.getPageSize());
                return new SliceImpl<>(rows.subList(start, end), page, end < rows.size());
            });
    }

    @Test void prefersSixFullGroupsForThirtySixStudentsWhenEarlierCriteriaAreEqual() {
        add("p6", "d", plan(6)); add("p7", "c", plan(7)); add("p8", "b", plan(8)); add("p9", "a", plan(9));
        var result = service.recommend(7, 20);
        assertThat(result.planId()).isEqualTo("p6"); // Fullness now decides before the smaller p9 fingerprint.
        assertThat(result.eligiblePlans()).isEqualTo(4); assertThat(result.equivalentPlans()).isEqualTo(1);
        assertThat(result.metrics().sizeDistribution()).containsExactly(new AllocationRecommendationDTO.SizeCount(6, 6));
        assertThat(result.metrics().excessMajorPairs()).isZero();
        var raw = new ArrayList<Long>(); var excess = new ArrayList<Long>();
        for (int count : List.of(6, 7, 8, 9)) {
            var metrics = service.evaluate(current, plan(count));
            raw.add(metrics.sameMajorPairs()); excess.add(metrics.excessMajorPairs());
            assertThat(metrics.sizeDifference()).isBetween(0, 1);
            assertThat(metrics.groupsWithThreePlusSameMajor()).isZero();
            assertThat(metrics.averageGroupScore()).isEqualTo(100.0);
        }
        assertThat(raw).containsExactly(18L, 15L, 12L, 9L);
        assertThat(excess).containsOnly(0L);
        Collections.reverse(rows);
        assertThat(service.recommend(7, 20).planId()).isEqualTo(result.planId());
        verifyNoInteractions(rulesRepository);
    }

    @Test void majorQualityOutranksFewerFullGroups() {
        var compact = plan(6);
        var groups = new ArrayList<>(compact.groups());
        var first = new ArrayList<>(groups.get(0).members());
        var second = new ArrayList<>(groups.get(1).members());
        // 2/2/2 + 2/2/2 becomes 3/1/2 + 1/3/2, still rule-valid and full.
        var member = first.get(4); first.set(4, second.get(3)); second.set(3, member);
        groups.set(0, regroup(groups.get(0), first)); groups.set(1, regroup(groups.get(1), second));
        compact = withGroups(compact, groups);
        assertThat(service.evaluate(current, compact).excessMajorPairs()).isGreaterThan(0);
        assertThat(service.evaluate(current, plan(9)).excessMajorPairs()).isZero();
        add("full-but-concentrated", "a", compact); add("balanced", "z", plan(9));
        assertThat(service.recommend(7, 20).planId()).isEqualTo("balanced");
    }

    @Test void aMoreCompactPlanCannotBypassEnabledRules() {
        add("oversized", "a", plan(5)); add("valid", "z", plan(6));
        var result = service.recommend(7, 20);
        assertThat(result.planId()).isEqualTo("valid"); assertThat(result.eligiblePlans()).isEqualTo(1);
    }

    @Test void preservingValidDraftsOutranksReducingTheGroupCount() {
        var students = students(12);
        var a = existing(1L, GroupStatus.OPEN, students.subList(0, 4));
        var b = existing(2L, GroupStatus.REVOKED, students.subList(4, 8));
        var c = existing(3L, GroupStatus.OPEN, students.subList(8, 12));
        setCurrent(students, List.of(a, b, c), rules());
        var preserved = withGroups(plan(3), List.of(view(a), view(b), view(c)));
        var merged = withGroups(plan(2), List.of(assigned(a, students.subList(0, 6), 1L), assigned(b, students.subList(6, 12), 7L)));
        assertThat(service.evaluate(current, preserved).excessMajorPairs()).isEqualTo(service.evaluate(current, merged).excessMajorPairs());
        assertThat(service.evaluate(current, preserved).validDraftsPreserved()).isEqualTo(3);
        assertThat(service.evaluate(current, merged).validDraftsPreserved()).isZero();
        add("merged-full", "a", merged); add("preserved", "z", preserved);
        assertThat(service.recommend(7, 20).planId()).isEqualTo("preserved");
    }

    @Test void fewerMovementsOutrankFullnessWhenMajorsDraftsAndLeadersAreEqual() {
        var students = students(12);
        var a = existing(1L, GroupStatus.OPEN, students.subList(0, 2));
        var b = existing(2L, GroupStatus.REVOKED, students.subList(2, 4));
        var c = existing(3L, GroupStatus.OPEN, students.subList(4, 6));
        setCurrent(students, List.of(a, b, c), rules());
        var fewerMoves = withGroups(plan(3), List.of(assigned(a, students.subList(0, 4), 1L),
            assigned(c, students.subList(4, 8), 5L), assigned(b, students.subList(8, 12), 9L)));
        var fuller = withGroups(plan(2), List.of(
            assigned(a, List.of(students.get(0), students.get(1), students.get(2), students.get(3), students.get(7), students.get(5)), 1L),
            assigned(c, List.of(students.get(6), students.get(4), students.get(8), students.get(9), students.get(10), students.get(11)), 5L)));
        var fewerMetrics = service.evaluate(current, fewerMoves); var fullerMetrics = service.evaluate(current, fuller);
        assertThat(fewerMetrics.excessMajorPairs()).isEqualTo(fullerMetrics.excessMajorPairs());
        assertThat(fewerMetrics.validDraftsPreserved()).isEqualTo(fullerMetrics.validDraftsPreserved()).isZero();
        assertThat(fewerMetrics.leadersPreserved()).isEqualTo(fullerMetrics.leadersPreserved()).isEqualTo(2);
        assertThat(fewerMetrics.movedStudents()).isEqualTo(2); assertThat(fullerMetrics.movedStudents()).isEqualTo(3);
        add("fuller", "a", fuller); add("fewer-moves", "z", fewerMoves);
        assertThat(service.recommend(7, 20).planId()).isEqualTo("fewer-moves");
    }

    @ParameterizedTest @CsvSource({"4,9", "6,6", "9,4"})
    void adaptsToTheEnabledMaximumInsteadOfHardcodingSix(int maximum, int expectedTarget) {
        var configured = rules().stream().map(rule -> rule.code() == MAX_MEMBERS_PER_GROUP
            ? new GroupingRuleDTO(rule.code(), maximum, true) : rule).toList();
        setCurrent(students(36), List.of(), configured);
        for (int count : List.of(4, 6, 9)) add("p" + count, "f" + count, plan(count));
        assertThat(service.recommend(7, 20).targetGroupCount()).isEqualTo(expectedTarget);
    }

    @Test void missingOrDisabledMaximumKeepsThePreviousFingerprintTieBreak() {
        var withoutMaximum = rules().stream().filter(rule -> rule.code() != MAX_MEMBERS_PER_GROUP).toList();
        var disabledMaximum = rules().stream().map(rule -> rule.code() == MAX_MEMBERS_PER_GROUP
            ? new GroupingRuleDTO(rule.code(), 1000, false) : rule).toList();
        for (var configured : List.of(withoutMaximum, disabledMaximum)) {
            rows.clear(); plans.clear(); setCurrent(students(36), List.of(), configured);
            add("six", "z", plan(6)); add("nine", "a", plan(9));
            var result = service.recommend(7, 20);
            assertThat(result.planId()).isEqualTo("nine"); assertThat(result.equivalentPlans()).isEqualTo(2);
        }
    }

    @Test void fullyEquivalentPlansStillUseFingerprintThenIdRegardlessOfHistoryOrder() {
        add("first", "z", plan(6)); add("second", "a", plan(6)); add("third", "a", plan(6));
        var result = service.recommend(7, 20);
        assertThat(result.planId()).isEqualTo("second"); assertThat(result.equivalentPlans()).isEqualTo(3);
        Collections.reverse(rows);
        assertThat(service.recommend(7, 20)).isEqualTo(result);
    }

    @ParameterizedTest @EnumSource(value = GroupStatus.class, names = {"PENDING", "ACCEPTED"})
    void sizePreferenceLeavesProtectedGroupsUnchanged(GroupStatus status) {
        var students = students(36); var protectedGroup = existing(1L, status, students.subList(0, 6));
        setCurrent(students, List.of(protectedGroup), rules());
        for (int count : List.of(6, 7)) {
            var planned = new ArrayList<GroupView>(); planned.add(view(protectedGroup));
            planned.addAll(planFromMembers(count - 1, students.subList(6, 36)).groups());
            add("p" + count, count == 7 ? "a" : "z", withGroups(plan(count), planned));
        }
        var result = service.recommend(7, 20);
        assertThat(result.planId()).isEqualTo("p6"); assertThat(result.eligiblePlans()).isEqualTo(2);
        assertThat(result.metrics().protectedGroups()).isEqualTo(1);
        assertThat(protectedGroup.getStatus()).isEqualTo(status);
        assertThat(plans.get("p6").groups().getFirst().members()).containsExactlyElementsOf(protectedGroup.getMembers());
        assertThat(plans.get("p6").groups().getFirst().leaderId()).isEqualTo(protectedGroup.getLeaderId());
    }

    @Test void rankingDoesNotMutateTheSnapshotSavedPlansOrEngineResults() throws Exception {
        add("six", "z", plan(6)); add("nine", "a", plan(9));
        var mapper = new ObjectMapper().findAndRegisterModules();
        String snapshotBefore = mapper.writeValueAsString(current), plansBefore = mapper.writeValueAsString(plans);
        var first = service.recommend(7, 20);
        assertThat(service.recommend(7, 20)).isEqualTo(first);
        assertThat(mapper.writeValueAsString(current)).isEqualTo(snapshotBefore);
        assertThat(mapper.writeValueAsString(plans)).isEqualTo(plansBefore);
        verify(repository, never()).save(any()); verify(repository, never()).delete(any());
        verifyNoInteractions(rulesRepository);
    }

    @Test void selectsEvenMajorsOverAConcentratedButRuleValidPlan() {
        var concentrated = new ArrayList<>(plan(8).groups());
        // Move one extra SE into group 2; all rules pass, but SE now clusters 1/3 instead of 2/2.
        var a = new ArrayList<>(concentrated.get(0).members());
        var b = new ArrayList<>(concentrated.get(1).members());
        var first = a.get(3); a.set(3, b.get(3)); b.set(3, first);
        concentrated.set(0, regroup(concentrated.get(0), a));
        concentrated.set(1, regroup(concentrated.get(1), b));
        var bad = withGroups(plan(8), concentrated);
        var badMetrics = service.evaluate(current, bad);
        assertThat(badMetrics).isNotNull();
        assertThat(badMetrics.excessMajorPairs()).isGreaterThan(0);
        add("concentrated", "a", bad); add("balanced", "z", plan(8));
        assertThat(service.recommend(7, 20).planId()).isEqualTo("balanced");
    }

    @Test void rejectsRuleViolationsEvenWhenSavedFlagsAndScoreSayPassed() {
        var ordered = current.snapshot().students().stream().sorted(Comparator.comparing(GroupMemberDTO::getMajorId)).toList();
        var bad = planFromMembers(6, ordered);
        assertThat(bad.groups()).allSatisfy(g -> assertThat(g.allRulesPassed()).isTrue());
        add("invalid", "a", bad); add("valid", "z", plan(8));
        assertThat(service.recommend(7, 20).planId()).isEqualTo("valid");
        assertThat(service.recommend(7, 20).eligiblePlans()).isEqualTo(1);
    }

    @Test void excludesAppliedStaleWrongOwnerAndUndecodableHistory() {
        add("applied", "a", plan(8)).setAppliedAt(Instant.now());
        add("stale", "b", plan(8)).setSnapshotFingerprint("old");
        add("other-owner", "c", plan(8)).setOwnerId(99L);
        var unreadable = add("unreadable", "d", plan(8)); plans.remove(unreadable.getId());
        assertThat(service.recommend(7, 20).planId()).isNull();
        assertThat(service.recommend(7, 20).reasons()).isEmpty();
    }

    @Test void scansBeyondHistoryPaginationWithoutPerPlanReadsOrWrites() {
        for (int n = 0; n < 55; n++) add("plan-" + n, n == 54 ? "a" : "z" + n, plan(8));
        var result = service.recommend(7, 20);
        assertThat(result.planId()).isEqualTo("plan-54"); assertThat(result.eligiblePlans()).isEqualTo(55);
        verify(repository, times(2)).findBySchoolClassIdAndDeadlineIdAndOwnerIdAndAppliedAtIsNullAndSnapshotFingerprintOrderByIdAsc(
            eq(20), eq(7), eq(7L), eq("current"), any());
        verify(em, times(55)).detach(any());
        verify(repository, never()).save(any()); verifyNoInteractions(rulesRepository);
    }

    @Test void explanationsMatchActualMembersRatherThanTheSavedOptimizationAndReport() {
        add("plan", "a", plan(7));
        var result = service.recommend(7, 20);
        assertThat(result.metrics().sizeDistribution()).containsExactly(new AllocationRecommendationDTO.SizeCount(5, 6), new AllocationRecommendationDTO.SizeCount(6, 1));
        assertThat(result.metrics().students()).isEqualTo(36);
        assertThat(result.metrics().unassignedAllocated()).isEqualTo(36);
        assertThat(result.reasons()).anySatisfy(r -> { assertThat(r.code()).isEqualTo(ALL_RULES_PASSED); assertThat(r.parameters().get("groups")).isEqualTo(7); });
        assertThat(result.reasons()).noneSatisfy(r -> assertThat(r.code()).isIn(VALID_DRAFTS_PRESERVED, PROTECTED_UNCHANGED, LEADERS_PRESERVED));
    }

    @Test void preservesProtectedMembersLeaderAndStatusAndChecksTheirRules() {
        var students = students(8);
        var old = existing(1L, GroupStatus.PENDING, students.subList(0, 4));
        setCurrent(students, List.of(old), rules());
        var candidate = plan(2);
        var groups = new ArrayList<>(candidate.groups());
        groups.set(0, new GroupView(1L, old.getName(), old.getStatus(), old.getLeaderId(), "Leader", true, old.getMembers(), null, List.of(), true));
        candidate = withGroups(candidate, groups);
        var metrics = service.evaluate(current, candidate);
        assertThat(metrics).isNotNull(); assertThat(metrics.protectedGroups()).isEqualTo(1);
        var changed = new ArrayList<>(old.getMembers()); changed.set(1, copy(students.get(5), GroupMemberRole.MEMBER));
        groups.set(0, replaceMembers(groups.getFirst(), changed));
        assertThat(service.evaluate(current, withGroups(candidate, groups))).isNull();
        setCurrent(students, List.of(old), List.of(new GroupingRuleDTO(MIN_MEMBERS_PER_GROUP, 5, true)));
        assertThat(service.evaluate(current, candidate)).isNull();
    }

    @Test void afterEqualMajorBalancePrefersPreservedDraftsLeadersAndFewerMovements() {
        var students = students(8);
        var a = existing(1L, GroupStatus.OPEN, students.subList(0, 4));
        var b = existing(2L, GroupStatus.REVOKED, students.subList(4, 8));
        setCurrent(students, List.of(a, b), rules());
        var kept = withGroups(plan(2), List.of(view(a), view(b)));
        var ma = new ArrayList<>(a.getMembers()); var mb = new ArrayList<>(b.getMembers());
        var member = ma.get(1); ma.set(1, mb.get(3)); mb.set(3, member); // IB ↔ IB.
        var moved = withGroups(kept, List.of(replaceMembers(view(a), ma), replaceMembers(view(b), mb)));
        var keepMetrics = service.evaluate(current, kept); var moveMetrics = service.evaluate(current, moved);
        assertThat(keepMetrics.excessMajorPairs()).isEqualTo(moveMetrics.excessMajorPairs());
        assertThat(keepMetrics.validDraftsPreserved()).isEqualTo(2); assertThat(moveMetrics.movedStudents()).isEqualTo(2);
        add("moved", "a", moved); add("kept", "z", kept);
        assertThat(service.recommend(7, 20).planId()).isEqualTo("kept");
    }

    @Test void acknowledgesConcentrationForcedByProtectedGroupsWithoutChangingThem() {
        var students = students(8);
        for (int index : List.of(0, 1, 2)) { students.get(index).setMajorId(1); students.get(index).setMajorCode("SE"); }
        students.get(3).setMajorId(2); students.get(3).setMajorCode("IB");
        var protectedGroup = existing(1L, GroupStatus.ACCEPTED, students.subList(0, 4));
        setCurrent(students, List.of(protectedGroup), rules());
        var candidate = plan(2); var groups = new ArrayList<>(candidate.groups()); groups.set(0, view(protectedGroup));
        add("protected-concentration", "a", withGroups(candidate, groups));
        var result = service.recommend(7, 20);
        assertThat(result.planId()).isEqualTo("protected-concentration");
        assertThat(result.metrics().groupsWithThreePlusSameMajor()).isEqualTo(1);
        assertThat(result.metrics().excessMajorPairs()).isEqualTo(1);
        assertThat(result.reasons()).extracting(AllocationRecommendationDTO.Reason::code)
            .contains(PROTECTED_UNCHANGED, MAJOR_CONCENTRATION_REMAINS);
        assertThat(protectedGroup.getStatus()).isEqualTo(GroupStatus.ACCEPTED);
        assertThat(protectedGroup.getMembers()).containsExactlyElementsOf(groups.getFirst().members());
    }

    @Test void classRulesAndDisabledRulesRemainAuthoritative() {
        var students = students(36);
        setCurrent(students, List.of(), List.of(new GroupingRuleDTO(MIN_GROUPS_PER_CLASS, 8, true)));
        assertThat(service.evaluate(current, plan(7))).isNull();
        setCurrent(students, List.of(), List.of(new GroupingRuleDTO(MAX_GROUPS_PER_CLASS, 7, true)));
        assertThat(service.evaluate(current, plan(8))).isNull();
        var disabled = Arrays.stream(GroupingRuleCode.values()).map(code -> new GroupingRuleDTO(code, 0, false)).toList();
        setCurrent(students, List.of(), disabled);
        var homogeneous = planFromMembers(6, students.stream().sorted(Comparator.comparing(GroupMemberDTO::getMajorId)).toList());
        assertThat(service.evaluate(current, homogeneous)).isNotNull();
        assertThat(service.evaluate(current, homogeneous).averageGroupScore()).isNull();
    }

    @Test void duplicateMissingOrWrongLeaderAndUnbalancedPlansAreIneligible() {
        var candidate = plan(8);
        var groups = new ArrayList<>(candidate.groups());
        var first = groups.getFirst(); var members = new ArrayList<>(first.members());
        members.set(1, members.getFirst()); groups.set(0, replaceMembers(first, members));
        assertThat(service.evaluate(current, withGroups(candidate, groups))).isNull();
        groups.set(0, replaceMembers(first, first.members().subList(0, 3)));
        assertThat(service.evaluate(current, withGroups(candidate, groups))).isNull();
        members = new ArrayList<>(first.members()); members.set(0, copy(members.getFirst(), GroupMemberRole.MEMBER));
        groups.set(0, replaceMembers(first, members));
        assertThat(service.evaluate(current, withGroups(candidate, groups))).isNull();
    }

    @Test void cancelledConflictedOrCompletedScopesHaveNoRecommendation() {
        when(snapshots.captureForHistory(7, 20)).thenReturn(Optional.empty());
        assertThat(service.recommend(7, 20).planId()).isNull();
        var scope = current.overview().scope();
        var cancelled = new Scope(scope.classId(), scope.className(), scope.termId(), scope.lecturerId(), 1, 7, "Session", "CANCELLED", scope.startTime(), scope.endTime(), 1);
        var view = new Overview(cancelled, "current", current.overview().summary(), current.snapshot().rules(), List.of(), List.of(), List.of());
        when(snapshots.captureForHistory(7, 20)).thenReturn(Optional.of(new AllocationPreviewService.Captured(view, current.snapshot())));
        assertThat(service.recommend(7, 20).planId()).isNull();
        var accepted = existing(1L, GroupStatus.ACCEPTED, current.snapshot().students());
        var completed = new Overview(scope, "current", current.overview().summary(), current.snapshot().rules(), List.of(view(accepted)), List.of(), List.of());
        when(snapshots.captureForHistory(7, 20)).thenReturn(Optional.of(new AllocationPreviewService.Captured(completed, current.snapshot())));
        assertThat(service.recommend(7, 20).planId()).isNull();
        verifyNoInteractions(repository);
    }

    private void setCurrent(List<GroupMemberDTO> students, List<GroupDTO> groups, List<GroupingRuleDTO> rules) {
        var scope = new Scope(20, "Class", 1, 7L, 1, 7, "Session", "EXPIRED", Instant.EPOCH, Instant.EPOCH, 1);
        var snapshot = new AllocationSnapshotDTO(20, 7, students, groups, rules);
        var overview = new Overview(scope, "current", new Summary(students.size(), groups.size(), students.size(), 0, 0, 0), rules,
            groups.stream().map(this::view).toList(), students, List.of());
        current = new AllocationPreviewService.Captured(overview, snapshot);
        when(snapshots.captureForHistory(7, 20)).thenAnswer(inv -> Optional.of(current));
    }
    private List<GroupingRuleDTO> rules() {
        return List.of(new GroupingRuleDTO(MIN_MEMBERS_PER_GROUP, 4, true), new GroupingRuleDTO(MAX_MEMBERS_PER_GROUP, 6, true),
            new GroupingRuleDTO(MIN_MAJORS_PER_GROUP, 2, true), new GroupingRuleDTO(MAX_MAJORS_PER_GROUP, 3, true), new GroupingRuleDTO(MIN_SE_MEMBERS_PER_GROUP, 1, true));
    }
    private List<GroupMemberDTO> students(int count) {
        return IntStream.range(0, count).mapToObj(i -> GroupMemberDTO.builder().studentId((long) i + 1).fullName("Name " + i)
            .majorId(i % 3 + 1).majorCode(new String[]{"SE", "IB", "GD"}[i % 3]).role(GroupMemberRole.MEMBER).build()).toList();
    }
    private GroupMemberDTO copy(GroupMemberDTO row, GroupMemberRole role) {
        return GroupMemberDTO.builder().studentId(row.getStudentId()).fullName(row.getFullName()).majorId(row.getMajorId()).majorCode(row.getMajorCode()).role(role).build();
    }
    private AllocationPreviewDTO plan(int count) { return planFromMembers(count, current.snapshot().students()); }
    private AllocationPreviewDTO planFromMembers(int count, List<GroupMemberDTO> students) {
        List<GroupView> groups = new ArrayList<>(); int offset = 0;
        for (int n = 0; n < count; n++) {
            int size = students.size() / count + (n < students.size() % count ? 1 : 0);
            var slice = students.subList(offset, offset + size); offset += size;
            Long leader = slice.stream().map(GroupMemberDTO::getStudentId).min(Long::compareTo).orElseThrow();
            var members = slice.stream().map(m -> copy(m, m.getStudentId().equals(leader) ? GroupMemberRole.LEADER : GroupMemberRole.MEMBER)).toList();
            groups.add(new GroupView(null, "Group " + n, GroupStatus.OPEN, leader, "Leader", false, members,
                scores.evaluateRules(current.snapshot().rules(), members), List.of(), true, "new:" + n, true));
        }
        var search = new SearchSummary(AllocationResultDTO.Status.FEASIBLE, count, 17, null, List.of(), 0, true, null);
        return new AllocationPreviewDTO(current.overview().scope(), "current", "fingerprint", false, search, groups, null, null, null, null);
    }
    private AllocationPreviewDTO withGroups(AllocationPreviewDTO plan, List<GroupView> groups) {
        return new AllocationPreviewDTO(plan.scope(), plan.snapshotFingerprint(), plan.planFingerprint(), false, plan.result(), groups, plan.report(), null, null, null);
    }
    private GroupView replaceMembers(GroupView g, List<GroupMemberDTO> members) {
        return new GroupView(g.groupId(), g.name(), g.status(), g.leaderId(), g.leaderName(), g.protectedGroup(), members, g.score(), g.rules(), g.allRulesPassed(), g.planGroupKey(), g.newGroup());
    }
    private GroupView regroup(GroupView group, List<GroupMemberDTO> members) {
        Long leader = members.stream().map(GroupMemberDTO::getStudentId).min(Long::compareTo).orElseThrow();
        return new GroupView(group.groupId(), group.name(), group.status(), leader, "Leader", false,
            members.stream().map(m -> copy(m, m.getStudentId().equals(leader) ? GroupMemberRole.LEADER : GroupMemberRole.MEMBER)).toList(),
            group.score(), group.rules(), true, group.planGroupKey(), group.newGroup());
    }
    private GroupDTO existing(Long id, GroupStatus status, List<GroupMemberDTO> members) {
        Long leader = members.getFirst().getStudentId();
        return GroupDTO.builder().id(id).name("Existing " + id).status(status).leaderId(leader)
            .members(members.stream().map(m -> copy(m, m.getStudentId().equals(leader) ? GroupMemberRole.LEADER : GroupMemberRole.MEMBER)).toList()).build();
    }
    private GroupView view(GroupDTO old) {
        return new GroupView(old.getId(), old.getName(), old.getStatus(), old.getLeaderId(), "Leader", old.getStatus() == GroupStatus.ACCEPTED || old.getStatus() == GroupStatus.PENDING,
            old.getMembers(), null, List.of(), true);
    }
    private GroupView assigned(GroupDTO old, List<GroupMemberDTO> members, Long leader) {
        return new GroupView(old.getId(), old.getName(), old.getStatus(), leader, "Leader", false,
            members.stream().map(member -> copy(member, member.getStudentId().equals(leader) ? GroupMemberRole.LEADER : GroupMemberRole.MEMBER)).toList(),
            null, List.of(), true);
    }
    private AllocationPreview add(String id, String fingerprint, AllocationPreviewDTO plan) {
        var row = new AllocationPreview(); row.setId(id); row.setOwnerId(7L); row.setSchoolClassId(20); row.setDeadlineId(7);
        row.setSnapshotFingerprint("current"); row.setPlanFingerprint(fingerprint); row.setTargetCount(plan.groups().size());
        row.setCreatedAt(Instant.now()); rows.add(row); plans.put(id, plan); return row;
    }
}
