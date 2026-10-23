package com.fmaking.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fmaking.domain.GroupMemberRole;
import com.fmaking.domain.GroupStatus;
import com.fmaking.domain.GroupingRuleCode;
import com.fmaking.repository.RuleRepository;
import com.fmaking.service.dto.*;
import com.fmaking.service.dto.AllocationResultDTO.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.*;
import java.util.stream.IntStream;

import static com.fmaking.domain.GroupingRuleCode.*;
import static com.fmaking.service.dto.AllocationResultDTO.ReasonCode.*;
import static com.fmaking.service.dto.AllocationResultDTO.Status.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class SmartAllocationServiceTest {
    @Test void classWithoutSeCanAllocateByDefaultAndOnlyRequiresSeWhenEnabled() {
        var all = students(8);
        all.forEach(member -> member.setMajorCode("M" + member.getMajorId()));
        var defaults = snapshot(all, List.of(), List.of());
        assertValid(defaults, allocate(defaults, 2));
        var enabled = snapshot(all, List.of(), List.of(rule(MIN_SE_MEMBERS_PER_GROUP, 1, true)));
        assertReason(allocate(enabled, 2), INSUFFICIENT_SE);
    }

    RuleRepository repository;
    GroupRuleValidationService validator;
    SmartAllocationService engine;
    static final SmartAllocationService.SearchLimits LIMITS = new SmartAllocationService.SearchLimits(10000, 256);

    @BeforeEach void setup() {
        repository = mock(RuleRepository.class);
        validator = new GroupRuleValidationService(repository, new ObjectMapper());
        engine = new SmartAllocationService(validator, new GroupScoreService(validator));
    }

    @Test void fillsUnassignedAndKeepsExistingLeadersWithoutWritingOrMutatingInput() throws Exception {
        var students = students(8);
        var input = snapshot(students, List.of(group(1, GroupStatus.OPEN, students.subList(0, 3)),
            group(2, GroupStatus.REVOKED, students.subList(3, 6))), List.of());
        var mapper = new ObjectMapper();
        String before = mapper.writeValueAsString(input);
        var result = allocate(input, 2);
        assertValid(input, result);
        assertThat(result.optimization().leadersPreserved()).isEqualTo(2);
        assertThat(result.groups()).extracting(PlannedGroup::status).containsExactly(GroupStatus.OPEN, GroupStatus.REVOKED);
        assertThat(mapper.writeValueAsString(input)).isEqualTo(before);
        verifyNoInteractions(repository);
        result.groups().getFirst().members().getFirst().setFullName("Detached result");
        assertThat(mapper.writeValueAsString(input)).isEqualTo(before);
    }

    @Test void pendingAndAcceptedMembershipStatusLeaderAndMetadataStayUnchanged() {
        var students = students(12);
        var pending = group(1, GroupStatus.PENDING, students.subList(0, 4));
        var accepted = group(2, GroupStatus.ACCEPTED, students.subList(4, 8));
        var input = snapshot(students, List.of(pending, accepted, group(3, GroupStatus.OPEN, students.subList(8, 10))), List.of());
        var result = allocate(input, 3);
        assertValid(input, result);
        for (var original : List.of(pending, accepted)) {
            var kept = result.groups().stream().filter(g -> g.groupId().equals(original.getId())).findFirst().orElseThrow();
            assertThat(kept.protectedGroup()).isTrue();
            assertThat(kept.members()).isEqualTo(original.getMembers());
            assertThat(kept.leaderId()).isEqualTo(original.getLeaderId());
            assertThat(kept.status()).isEqualTo(original.getStatus());
        }
    }

    @Test void protectedGroupWithOldRuleViolationIsPreservedAndWarnedInsteadOfRepaired() {
        var students = students(7);
        var fixed = group(1, GroupStatus.ACCEPTED, students.subList(0, 3));
        var input = snapshot(students, List.of(fixed, group(2, GroupStatus.OPEN, students.subList(3, 5))), List.of());
        var result = allocate(input, 2);
        assertValid(input, result);
        assertThat(result.reasons()).extracting(Reason::code).contains(PROTECTED_RULE_WARNING);
        assertThat(result.groups().getFirst().members()).isEqualTo(fixed.getMembers());
    }

    @Test void protectedOnlyPlanWorksButCannotAbsorbUnassignedStudents() {
        var students = students(4);
        var fixed = group(1, GroupStatus.ACCEPTED, students);
        assertValid(snapshot(students, List.of(fixed), List.of()), allocate(snapshot(students, List.of(fixed), List.of()), 1));
        var extra = new ArrayList<>(students); extra.add(student(10, 1));
        assertReason(allocate(snapshot(extra, List.of(fixed), List.of()), 1), NO_EDITABLE_GROUP);
    }

    @Test void rejectsTargetBelowProtectedCount() {
        var students = students(8);
        var input = snapshot(students, List.of(group(1, GroupStatus.PENDING, students.subList(0, 4)),
            group(2, GroupStatus.ACCEPTED, students.subList(4, 8))), List.of());
        assertReason(allocate(input, 1), TARGET_BELOW_PROTECTED);
    }

    @Test void balancesAnUnevenClassUsingOnlyExistingGroups() {
        var students = students(13);
        var input = snapshot(students, List.of(group(1, GroupStatus.OPEN, students.subList(0, 6)),
            group(2, GroupStatus.OPEN, students.subList(6, 9)), group(3, GroupStatus.OPEN, students.subList(9, 12))), List.of());
        var result = allocate(input, 3);
        assertValid(input, result);
        assertThat(result.groups().stream().map(g -> g.members().size()).sorted().toList()).containsExactly(4, 4, 5);
    }

    @Test void protectedSizesCanProveBalanceImpossibleBeforeSearch() {
        var students = students(12);
        var input = snapshot(students, List.of(group(1, GroupStatus.ACCEPTED, students.subList(0, 6)),
            group(2, GroupStatus.OPEN, students.subList(6, 9)), group(3, GroupStatus.OPEN, students.subList(9, 12))), List.of());
        var result = allocate(input, 3);
        assertReason(result, BALANCED_SIZE_CONFLICT);
        assertThat(result.visitedNodes()).isZero();
        assertThat(engine.preliminaryRange(input).maximum()).isEqualTo(2);
    }

    @Test void balanceAlsoAppliesWithCompositionRulesDisabledAndProtectedOnlyPlans() {
        var students = students(10);
        var rules = Arrays.stream(GroupingRuleCode.values()).map(code -> rule(code, code.getSuggestedValue(), false)).toList();
        var input = snapshot(students, List.of(group(1, GroupStatus.OPEN, students.subList(0, 7)),
            group(2, GroupStatus.OPEN, students.subList(7, 10))), rules);
        assertThat(allocate(input, 2).groups()).allSatisfy(g -> assertThat(g.members()).hasSize(5));
        var protectedInput = snapshot(students, List.of(group(1, GroupStatus.ACCEPTED, students.subList(0, 6)),
            group(2, GroupStatus.PENDING, students.subList(6, 10))), rules);
        assertReason(allocate(protectedInput, 2), BALANCED_SIZE_CONFLICT);
        assertThat(AllocationBalancePolicy.isBalanced(List.of(6, 7))).isTrue();
        assertThat(AllocationBalancePolicy.isBalanced(List.of(5, 7))).isFalse();
    }

    @ParameterizedTest @ValueSource(ints = {0, -1, Integer.MIN_VALUE})
    void rejectsNonPositiveTarget(int target) {
        var students = students(4);
        assertReason(allocate(snapshot(students, List.of(group(1, GroupStatus.OPEN, students)), List.of()), target), TARGET_MUST_BE_POSITIVE);
    }

    @Test void createsOnlyMissingSlotsAndAllowsAnInitiallyUngroupedClass() {
        var students = students(8);
        var input = snapshot(students, List.of(group(1, GroupStatus.OPEN, students.subList(0, 4))), List.of());
        var expanded = allocate(input, 2);
        assertValid(input, expanded);
        assertThat(expanded.groups()).filteredOn(PlannedGroup::newGroup).hasSize(1);
        var empty = snapshot(students, List.of(), List.of());
        assertValid(empty, allocate(empty, 2));
        assertReason(allocate(empty, 1), MEMBER_CAPACITY);
    }

    @Test void provesInsufficientSeatsMembersAndSeWithConcreteReasons() {
        var students = students(8);
        var groups = List.of(group(1, GroupStatus.OPEN, students.subList(0, 4)), group(2, GroupStatus.OPEN, students.subList(4, 8)));
        assertReason(allocate(snapshot(students, groups, List.of()), 1), MEMBER_CAPACITY);
        assertReason(allocate(snapshot(students, groups, List.of(rule(MIN_MEMBERS_PER_GROUP, 5, true))), 2), INSUFFICIENT_MEMBERS);
        var noSe = IntStream.rangeClosed(1, 8).mapToObj(id -> student(id, 2)).toList();
        assertReason(allocate(snapshot(noSe, List.of(group(1, GroupStatus.OPEN, noSe.subList(0, 4)),
            group(2, GroupStatus.OPEN, noSe.subList(4, 8))), List.of(rule(MIN_SE_MEMBERS_PER_GROUP, 1, true))), 2), INSUFFICIENT_SE);
    }

    @Test void majorDistributionNotJustDistinctMajorCountConstrainsFeasibility() {
        var students = new ArrayList<GroupMemberDTO>();
        for (int id = 1; id <= 8; id++) students.add(student(id, id == 8 ? 2 : 1));
        var input = snapshot(students, List.of(group(1, GroupStatus.OPEN, students.subList(0, 4)),
            group(2, GroupStatus.OPEN, students.subList(4, 8))), List.of());
        assertReason(allocate(input, 2), INSUFFICIENT_MAJORS);
        assertThat(engine.preliminaryRange(input).maximum()).isLessThan(2);
    }

    @Test void exhaustiveSearchCanProveNoPartitionInsidePreliminaryRange() {
        var students = IntStream.rangeClosed(1, 6).mapToObj(id -> student(id, id <= 4 ? 1 : 2)).toList();
        var rules = List.of(rule(MIN_MEMBERS_PER_GROUP, 3, true), rule(MAX_MEMBERS_PER_GROUP, 3, true),
            rule(MIN_MAJORS_PER_GROUP, 1, true), rule(MAX_MAJORS_PER_GROUP, 1, true), rule(MIN_SE_MEMBERS_PER_GROUP, 0, false));
        var input = snapshot(students, List.of(group(1, GroupStatus.OPEN, students.subList(0, 3)), group(2, GroupStatus.OPEN, students.subList(3, 6))), rules);
        assertThat(engine.preliminaryRange(input).hasCandidates()).isTrue();
        var result = allocate(input, 2);
        assertReason(result, NO_PARTITION);
        assertThat(result.searchComplete()).isTrue();
        assertThat(result.groups()).isEmpty();
    }

    @Test void nodeAndDepthExhaustionAreUnknownNotProofOfInfeasibility() {
        var students = students(8);
        var input = snapshot(students, List.of(group(1, GroupStatus.OPEN, students.subList(0, 4)), group(2, GroupStatus.OPEN, students.subList(4, 8))), List.of());
        for (var limits : List.of(new SmartAllocationService.SearchLimits(1, 256), new SmartAllocationService.SearchLimits(100, 1))) {
            var result = engine.allocate(input, 2, 42, limits);
            assertThat(result.status()).isEqualTo(SEARCH_LIMIT_REACHED);
            assertThat(result.searchComplete()).isFalse();
            assertThat(result.groups()).isEmpty();
        }
    }

    @Test void aWitnessIsFeasibleEvenIfOptimizationBudgetEndsLater() {
        var students = students(8);
        var input = snapshot(students, List.of(group(1, GroupStatus.OPEN, students.subList(0, 4)), group(2, GroupStatus.OPEN, students.subList(4, 8))), List.of());
        var result = engine.allocate(input, 2, 42, new SmartAllocationService.SearchLimits(100, 256));
        assertValid(input, result);
        assertThat(result.searchComplete()).isFalse();
    }

    @Test void disabledRulesAreNotSilentlyRestoredAndGroupScoreIsNotEligibility() {
        var students = IntStream.rangeClosed(1, 8).mapToObj(id -> student(id, 2)).toList();
        var rules = Arrays.stream(GroupingRuleCode.values()).map(code -> rule(code, code.getSuggestedValue(), false)).toList();
        var input = snapshot(students, List.of(group(1, GroupStatus.OPEN, students.subList(0, 4))), rules);
        var result = allocate(input, 1);
        assertValid(input, result);
        assertThat(result.groups().getFirst().members()).hasSize(8);
        assertThat(result.groups().getFirst().score().scorePercent()).isNull();
    }

    @Test void respectsEnabledClassGroupBoundsAndContradictoryRules() {
        var students = students(8);
        var groups = List.of(group(1, GroupStatus.OPEN, students.subList(0, 4)), group(2, GroupStatus.OPEN, students.subList(4, 8)));
        assertReason(allocate(snapshot(students, groups, List.of(rule(MAX_GROUPS_PER_CLASS, 1, true))), 2), CLASS_GROUP_BOUND);
        assertReason(allocate(snapshot(students, groups, List.of(rule(MIN_GROUPS_PER_CLASS, 3, true))), 2), CLASS_GROUP_BOUND);
        assertReason(allocate(snapshot(students, groups, List.of(rule(MIN_MEMBERS_PER_GROUP, 7, true))), 2), RULE_BOUNDS_CONFLICT);
    }

    @Test void keepsACompleteGroupBeforeOptimizingOtherDrafts() {
        var students = students(8);
        var complete = group(1, GroupStatus.OPEN, students.subList(0, 4));
        var input = snapshot(students, List.of(complete, group(2, GroupStatus.OPEN, students.subList(4, 6))), List.of());
        var result = allocate(input, 2);
        assertValid(input, result);
        assertThat(result.optimization().validGroupsPreserved()).isEqualTo(1);
        assertThat(result.groups().getFirst().members()).extracting(GroupMemberDTO::getStudentId)
            .containsExactlyInAnyOrderElementsOf(complete.getMembers().stream().map(GroupMemberDTO::getStudentId).toList());
    }

    @Test void consolidatesNineGroupsIntoSixInMemory() {
        var students = students(36);
        List<GroupDTO> groups = IntStream.range(0, 9).mapToObj(i -> group(i + 1, GroupStatus.OPEN, students.subList(i * 4, i * 4 + 4))).toList();
        var input = snapshot(students, groups, List.of(rule(MAX_GROUPS_PER_CLASS, 6, true)));
        var result = allocate(input, 6);
        assertValid(input, result);
        assertThat(result.disbandedGroupIds()).hasSize(3);
        assertThat(result.groups()).allSatisfy(g -> assertThat(g.members()).hasSize(6));
    }

    @Test void seedIsReproducibleAndCanBreakTiesWithoutPromisingDifferentPlans() {
        var students = students(4);
        var rules = Arrays.stream(GroupingRuleCode.values()).map(code -> rule(code, code.getSuggestedValue(), false)).toList();
        var input = snapshot(students, List.of(group(1, GroupStatus.OPEN, students.subList(0, 2)), group(2, GroupStatus.OPEN, students.subList(2, 4))), rules);
        assertThat(allocate(input, 1)).isEqualTo(allocate(input, 1));
        Set<String> plans = new HashSet<>();
        for (long seed = 0; seed < 20; seed++) {
            var result = engine.allocate(input, 1, seed, LIMITS); assertValid(input, result);
            plans.add(result.groups().stream().map(g -> g.groupId() + ":" + g.leaderId()).toList().toString());
        }
        assertThat(plans.size()).isGreaterThan(1);
    }

    @Test void suggestionIsBackedByAValidatedPlanAndDoesNotPromiseEveryTargetInRange() {
        var students = students(8);
        var input = snapshot(students, List.of(group(1, GroupStatus.OPEN, students.subList(0, 4)), group(2, GroupStatus.OPEN, students.subList(4, 8))), List.of());
        var suggestion = engine.suggest(input, 42);
        assertThat(suggestion.status()).isEqualTo(FEASIBLE);
        assertThat(suggestion.suggestedCount()).isEqualTo(2);
        assertValid(input, allocate(input, suggestion.suggestedCount()));
        assertThat(suggestion.checkedTargets()).contains(new CheckedTarget(2, FEASIBLE));
    }

    @Test void noSuggestionWhenResourcesProveInfeasible() {
        var students = IntStream.rangeClosed(1, 8).mapToObj(id -> student(id, 2)).toList();
        var input = snapshot(students, List.of(group(1, GroupStatus.OPEN, students.subList(0, 4)), group(2, GroupStatus.OPEN, students.subList(4, 8))), List.of());
        var suggestion = engine.suggest(input, 42);
        assertThat(suggestion.status()).isEqualTo(PROVEN_INFEASIBLE);
        assertThat(suggestion.suggestedCount()).isNull();
    }

    @Test void suggestionReturnsUnknownWhenSearchCannotRunWithinResourceLimit() {
        var students = students(300);
        var rules = Arrays.stream(GroupingRuleCode.values()).map(code -> rule(code, code.getSuggestedValue(), false)).toList();
        var input = snapshot(students, List.of(group(1, GroupStatus.OPEN, students)), rules);
        var suggestion = engine.suggest(input, 42);
        assertThat(suggestion.status()).isEqualTo(SEARCH_LIMIT_REACHED);
        assertThat(suggestion.suggestedCount()).isNull();
        assertThat(suggestion.checkedTargets()).hasSize(12).allSatisfy(target -> assertThat(target.status()).isEqualTo(SEARCH_LIMIT_REACHED));
    }

    @Test void emptyClassHasNoPositiveTargetAndMissingMajorDoesNotCountAsAMajor() {
        var empty = snapshot(List.of(), List.of(), List.of());
        assertThat(engine.preliminaryRange(empty).hasCandidates()).isFalse();
        assertReason(allocate(empty, 1), INSUFFICIENT_MEMBERS);
        var students = students(4);
        students.forEach(s -> s.setMajorId(null));
        var input = snapshot(students, List.of(group(1, GroupStatus.OPEN, students)), List.of());
        assertReason(allocate(input, 1), INSUFFICIENT_MAJORS);
    }

    @Test void malformedSnapshotIsAnInputErrorNotAMathematicalInfeasibility() {
        var students = students(8);
        var wrongClass = group(1, GroupStatus.OPEN, students.subList(0, 4)); wrongClass.setSchoolClassId(99);
        assertThatThrownBy(() -> allocate(snapshot(students, List.of(wrongClass), List.of()), 1)).isInstanceOf(IllegalArgumentException.class);
        var duplicate = List.of(group(1, GroupStatus.OPEN, students.subList(0, 4)), group(2, GroupStatus.OPEN, students.subList(0, 4)));
        assertThatThrownBy(() -> allocate(snapshot(students, duplicate, List.of()), 2)).isInstanceOf(IllegalArgumentException.class);
        var badLeader = group(1, GroupStatus.OPEN, students.subList(0, 4)); badLeader.setLeaderId(999L);
        assertThatThrownBy(() -> allocate(snapshot(students, List.of(badLeader), List.of()), 1)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test void disbandedGroupsAreNotAvailableSlotsAndMustNotHaveMemberships() {
        var students = students(4);
        var removed = GroupDTO.builder().id(2L).schoolClassId(17).deadlineId(3).status(GroupStatus.DISBANDED).build();
        var input = snapshot(students, List.of(group(1, GroupStatus.OPEN, students), removed), List.of());
        assertValid(input, allocate(input, 1));
        assertReason(allocate(input, 2), INSUFFICIENT_MEMBERS);
        removed.setMembers(List.of(students.getFirst()));
        assertThatThrownBy(() -> allocate(input, 1)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test void choosesAValidReplacementWhenKeepingEveryLeaderIsImpossible() {
        var students = IntStream.rangeClosed(1, 8).mapToObj(id -> student(id, id <= 4 ? 1 : 2)).toList();
        var groups = List.of(group(1, GroupStatus.OPEN, List.of(students.get(0), students.get(4))),
            group(2, GroupStatus.OPEN, List.of(students.get(1), students.get(5))));
        var rules = List.of(rule(MIN_MAJORS_PER_GROUP, 1, true), rule(MAX_MAJORS_PER_GROUP, 1, true),
            rule(MIN_SE_MEMBERS_PER_GROUP, 0, false));
        var input = snapshot(students, groups, rules);
        var result = allocate(input, 2);
        assertValid(input, result);
        assertThat(result.optimization().leadersPreserved()).isEqualTo(1);
    }

    @Test void snapshotValidatorMatchesExistingDatabaseBackedEntryPoint() {
        var stored = new com.fmaking.domain.Rule();
        stored.setCode(MIN_SE_MEMBERS_PER_GROUP.name()); stored.setValue(9); stored.setStatus(false);
        when(repository.findBySchoolClassId(17)).thenReturn(List.of(stored));
        assertThat(validator.evaluateRules(List.of(rule(MIN_SE_MEMBERS_PER_GROUP, 9, false)), students(4)))
            .isEqualTo(validator.evaluateGroup(17, students(4)));
        verify(repository).findBySchoolClassId(17);
        verifyNoMoreInteractions(repository);
    }

    @Test void smallSearchResultsAgreeWithIndependentExhaustivePartitionEnumeration() {
        var random = new Random(173);
        for (int sample = 0; sample < 80; sample++) {
            var students = IntStream.rangeClosed(1, 6).mapToObj(id -> student(id, 1 + random.nextInt(3))).toList();
            int minimumMajors = 1 + random.nextInt(2);
            int maximumMajors = minimumMajors + random.nextInt(2);
            int minimumSe = random.nextInt(2);
            var rules = List.of(rule(MIN_MEMBERS_PER_GROUP, 2, true), rule(MAX_MEMBERS_PER_GROUP, 4, true),
                rule(MIN_MAJORS_PER_GROUP, minimumMajors, true), rule(MAX_MAJORS_PER_GROUP, maximumMajors, true),
                rule(MIN_SE_MEMBERS_PER_GROUP, minimumSe, true));
            var input = snapshot(students, List.of(group(1, GroupStatus.OPEN, students.subList(0, 3)),
                group(2, GroupStatus.OPEN, students.subList(3, 6))), rules);
            boolean witness = false;
            for (int mask = 1; mask < 63 && !witness; mask++) {
                var left = new ArrayList<GroupMemberDTO>(); var right = new ArrayList<GroupMemberDTO>();
                for (int i = 0; i < 6; i++) ((mask & (1 << i)) == 0 ? left : right).add(students.get(i));
                witness = Math.abs(left.size() - right.size()) <= 1 && oracleValid(left, minimumMajors, maximumMajors, minimumSe)
                    && oracleValid(right, minimumMajors, maximumMajors, minimumSe);
            }
            var result = allocate(input, 2);
            assertThat(result.status()).as("sample %s, independent witness=%s", sample, witness)
                .isEqualTo(witness ? FEASIBLE : PROVEN_INFEASIBLE);
            if (witness) assertValid(input, result);
        }
        verifyNoInteractions(repository);
    }

    private static boolean oracleValid(List<GroupMemberDTO> members, int minMajors, int maxMajors, int minSe) {
        long majors = members.stream().map(GroupMemberDTO::getMajorId).distinct().count();
        long se = members.stream().filter(s -> "SE".equals(s.getMajorCode())).count();
        return members.size() >= 2 && members.size() <= 4 && majors >= minMajors && majors <= maxMajors && se >= minSe;
    }

    @Test void virtualGroupsHaveUniqueNamesKeysSmallestIdLeadersAndStableSeedWithoutMutation() throws Exception {
        var existing = group(1, GroupStatus.OPEN, students(12).subList(0, 4)); existing.setName("gRoUp 01");
        var input = snapshot(students(12), List.of(existing), List.of());
        var mapper = new ObjectMapper(); String before = mapper.writeValueAsString(input);
        var result = allocate(input, 3); assertValid(input, result);
        assertThat(result.groups()).extracting(PlannedGroup::planGroupKey).doesNotHaveDuplicates();
        assertThat(result.groups()).extracting(group -> group.name().toLowerCase(Locale.ROOT)).doesNotHaveDuplicates();
        assertThat(result.groups()).filteredOn(PlannedGroup::newGroup).hasSize(2).allSatisfy(group -> {
            assertThat(group.groupId()).isNull();
            assertThat(group.leaderId()).isEqualTo(group.members().stream().map(GroupMemberDTO::getStudentId).min(Long::compareTo).orElseThrow());
            assertThat(group.members()).allSatisfy(member -> assertThat(member.getGroupId()).isNull());
        });
        assertThat(mapper.writeValueAsString(allocate(input, 3))).isEqualTo(mapper.writeValueAsString(result));
        assertThat(mapper.writeValueAsString(input)).isEqualTo(before); verifyNoInteractions(repository);
    }

    @Test void newSlotsPreserveProtectedGroupsAndExistingValidDraftsAcrossSeeds() {
        var all = students(16);
        var pending = group(1, GroupStatus.PENDING, all.subList(0, 4));
        var open = group(2, GroupStatus.OPEN, all.subList(4, 8));
        var revoked = group(3, GroupStatus.REVOKED, all.subList(8, 12));
        var input = snapshot(all, List.of(pending, open, revoked), List.of());
        for (long seed : List.of(1L, 2L, 3L)) {
            var result = engine.allocate(input, 4, seed, LIMITS); assertValid(input, result);
            assertThat(result.groups()).filteredOn(PlannedGroup::newGroup).hasSize(1);
            assertThat(result.optimization().validGroupsPreserved()).isEqualTo(2);
            for (var old : List.of(pending, open, revoked)) {
                var kept = result.groups().stream().filter(group -> Objects.equals(group.groupId(), old.getId())).findFirst().orElseThrow();
                assertThat(kept.status()).isEqualTo(old.getStatus()); assertThat(kept.leaderId()).isEqualTo(old.getLeaderId());
                assertThat(kept.members()).extracting(GroupMemberDTO::getStudentId)
                    .containsExactlyInAnyOrderElementsOf(old.getMembers().stream().map(GroupMemberDTO::getStudentId).toList());
            }
        }
    }

    @Test void disabledRulesDoNotLimitNewSlotsAndImpossibleAcademicCompositionIsExplained() {
        var all = students(8);
        var disabled = Arrays.stream(GroupingRuleCode.values()).map(code -> rule(code, code.getSuggestedValue(), false)).toList();
        var input = snapshot(all, List.of(), disabled);
        assertThat(engine.preliminaryRange(input).maximum()).isEqualTo(8);
        assertValid(input, allocate(input, 8));
        var noSe = IntStream.rangeClosed(1, 8).mapToObj(id -> student(id, 2)).toList();
        var impossible = allocate(snapshot(noSe, List.of(), List.of(rule(MIN_SE_MEMBERS_PER_GROUP, 1, true))), 2);
        assertReason(impossible, INSUFFICIENT_SE); assertReason(impossible, INSUFFICIENT_MAJORS);
        assertThat(impossible.groups()).isEmpty();
    }

    @ParameterizedTest @ValueSource(longs = {1, 17, 42, 93})
    void balancedMajorDistributionForThirtySixUngroupedStudents(long seed) throws Exception {
        var all = mixedMajors(12, 11, 13);
        all.forEach(student -> { student.setMatchScore(73); student.setMatchReasons(List.of("Existing recommendation")); });
        var input = snapshot(all, List.of(), List.of());
        var mapper = new ObjectMapper(); String before = mapper.writeValueAsString(input);
        var result = engine.allocate(input, 8, seed);
        assertValid(input, result);
        assertThat(result.groups().stream().map(group -> group.members().size()).sorted().toList()).containsExactly(4,4,4,4,5,5,5,5);
        assertThat(result.groups()).allSatisfy(group -> {
            assertThat(majorCounts(group)).allSatisfy(count -> assertThat(count).isBetween(1L, 2L));
            assertThat(group.score().scorePercent()).isEqualTo(100.0);
            assertThat(group.score().breakdown()).extracting(GroupScoreDTO.CriterionScore::baseWeight).containsExactly(40,35);
            assertThat(group.leaderId()).isEqualTo(group.members().stream().map(GroupMemberDTO::getStudentId).min(Long::compareTo).orElseThrow());
            assertThat(group.members()).allSatisfy(member -> {
                assertThat(member.getMatchScore()).isEqualTo(73); assertThat(member.getMatchReasons()).containsExactly("Existing recommendation");
            });
        });
        assertThat(concentration(result)).isEqualTo(12); // Global lower bound: 4 SE pairs + 3 IB pairs + 5 GD pairs.
        assertThat(result.optimization().movedStudents()).isEqualTo(36);
        assertThat(engine.allocate(input, 8, seed)).isEqualTo(result);
        assertThat(mapper.writeValueAsString(input)).isEqualTo(before); verifyNoInteractions(repository);
        System.out.println("MAJOR_DISTRIBUTION_SE_IB_GD seed=" + seed + " " + result.groups().stream().map(group ->
            IntStream.rangeClosed(1, 3).mapToLong(major -> group.members().stream().filter(member -> member.getMajorId() == major).count())
                .boxed().toList()).toList());
    }

    @Test void improvesEditablePoolWithoutTouchingConcentratedProtectedGroups() {
        var all = mixedMajors(12,11,13);
        var accepted = group(1, GroupStatus.ACCEPTED, List.of(all.get(0), all.get(12), all.get(13), all.get(14), all.get(15)));
        var pending = group(2, GroupStatus.PENDING, List.of(all.get(1), all.get(23), all.get(24), all.get(25), all.get(26)));
        var input = snapshot(all, List.of(accepted,pending), List.of());
        var result = engine.allocate(input,8,42); assertValid(input,result);
        for (var original : List.of(accepted,pending)) {
            var fixed = result.groups().stream().filter(group -> Objects.equals(group.groupId(),original.getId())).findFirst().orElseThrow();
            assertThat(fixed.members()).isEqualTo(original.getMembers()); assertThat(fixed.leaderId()).isEqualTo(original.getLeaderId());
            assertThat(fixed.status()).isEqualTo(original.getStatus()); assertThat(fixed.protectedGroup()).isTrue();
            assertThat(majorCounts(fixed)).contains(4L);
        }
        assertThat(result.groups()).filteredOn(group -> !group.protectedGroup()).allSatisfy(group -> assertThat(majorCounts(group)).allSatisfy(count -> assertThat(count).isBetween(1L,2L)));
    }

    @Test void retainingValidOpenAndRevokedGroupsOutranksImprovingTheirMajorBalance() {
        var all = mixedMajors(12,11,13);
        var open = group(1, GroupStatus.OPEN, List.of(all.get(0),all.get(12),all.get(13),all.get(14),all.get(15)));
        var revoked = group(2, GroupStatus.REVOKED, List.of(all.get(1),all.get(23),all.get(24),all.get(25),all.get(26)));
        var input = snapshot(all,List.of(open,revoked),List.of());
        var result = engine.allocate(input,8,42); assertValid(input,result);
        assertThat(result.optimization().validGroupsPreserved()).isEqualTo(2);
        assertThat(result.optimization().leadersPreserved()).isEqualTo(2);
        assertThat(result.optimization().movedStudents()).isEqualTo(26);
        for (var original : List.of(open,revoked)) {
            var kept = result.groups().stream().filter(group -> Objects.equals(group.groupId(),original.getId())).findFirst().orElseThrow();
            assertThat(kept.members()).extracting(GroupMemberDTO::getStudentId)
                .containsExactlyInAnyOrderElementsOf(original.getMembers().stream().map(GroupMemberDTO::getStudentId).toList());
            assertThat(kept.leaderId()).isEqualTo(original.getLeaderId()); assertThat(kept.status()).isEqualTo(original.getStatus());
            assertThat(majorCounts(kept)).contains(4L);
        }
    }

    @Test void majorBalanceDoesNotRejectConcentrationRequiredByActiveRulesOrAvailableStudents() {
        var all = mixedMajors(4,4,0);
        var restricted = snapshot(all,List.of(),List.of(rule(MIN_MAJORS_PER_GROUP,1,true),rule(MAX_MAJORS_PER_GROUP,1,true),rule(MIN_SE_MEMBERS_PER_GROUP,0,false)));
        var result = engine.allocate(restricted,2,42); assertValid(restricted,result);
        assertThat(result.groups()).allSatisfy(group -> assertThat(majorCounts(group)).contains(4L));
        var dominant = snapshot(mixedMajors(16,4,4),List.of(),List.of());
        var balanced = engine.allocate(dominant,6,42); assertValid(dominant,balanced);
        assertThat(balanced.groups()).allSatisfy(group -> assertThat(majorCounts(group)).allSatisfy(count -> assertThat(count).isLessThanOrEqualTo(3L)));
        assertThat(balanced.groups()).anySatisfy(group -> assertThat(majorCounts(group)).contains(3L));
        var disabled = Arrays.stream(GroupingRuleCode.values()).map(code -> rule(code,code.getSuggestedValue(),false)).toList();
        var singleMajor = snapshot(mixedMajors(8,0,0),List.of(),disabled);
        var permitted = engine.allocate(singleMajor,2,42); assertValid(singleMajor,permitted);
        assertThat(permitted.groups()).allSatisfy(group -> {assertThat(group.members()).hasSize(4);assertThat(group.score().applicable()).isFalse();});
    }

    @Test void suggestionOmitsZeroDraftAndProtectedReasonsButKeepsUsefulExplanations() {
        var all = students(8);
        var empty = engine.suggest(snapshot(all,List.of(),List.of()),42);
        assertThat(empty.status()).isEqualTo(FEASIBLE);
        assertThat(empty.reasons()).extracting(Reason::code).contains(VALIDATED_SUGGESTION,SUGGESTED_BALANCED_SIZE)
            .doesNotContain(SUGGESTED_PRESERVES_VALID_GROUPS,PROTECTED_COUNTS_INCLUDED);
        var invalidDrafts = engine.suggest(snapshot(all,List.of(group(1,GroupStatus.OPEN,all.subList(0,2))),List.of()),42);
        assertThat(invalidDrafts.reasons()).extracting(Reason::code).doesNotContain(SUGGESTED_PRESERVES_VALID_GROUPS,PROTECTED_COUNTS_INCLUDED);
        var valid = engine.suggest(snapshot(all,List.of(group(1,GroupStatus.OPEN,all.subList(0,4))),List.of()),42);
        assertThat(valid.reasons()).extracting(Reason::code).contains(SUGGESTED_PRESERVES_VALID_GROUPS).doesNotContain(PROTECTED_COUNTS_INCLUDED);
        var fixed = engine.suggest(snapshot(all,List.of(group(1,GroupStatus.ACCEPTED,all.subList(0,4))),List.of()),42);
        assertThat(fixed.reasons()).extracting(Reason::code).contains(PROTECTED_COUNTS_INCLUDED).doesNotContain(SUGGESTED_PRESERVES_VALID_GROUPS);
        var onlyFixed = engine.suggest(snapshot(all,List.of(group(1,GroupStatus.ACCEPTED,all)),List.of(rule(MAX_MEMBERS_PER_GROUP,8,true))),42);
        assertThat(onlyFixed.reasons()).extracting(Reason::code).containsExactly(VALIDATED_SUGGESTION,PROTECTED_COUNTS_INCLUDED);
    }

    private static List<GroupMemberDTO> mixedMajors(int se, int ib, int gd) {
        var all = new ArrayList<GroupMemberDTO>();
        for (int id=1; id<=se+ib+gd; id++) {
            int major=id<=se?1:id<=se+ib?2:3;
            var member=student(id,major);member.setMajorCode(major==1?"SE":major==2?"IB":"GD");all.add(member);
        }
        return all;
    }
    private static List<Long> majorCounts(PlannedGroup group) {
        return IntStream.rangeClosed(1,3).mapToLong(major -> group.members().stream().filter(member -> member.getMajorId()==major).count()).boxed().toList();
    }
    private static long concentration(AllocationResultDTO result) {
        return result.groups().stream().flatMap(group -> majorCounts(group).stream()).mapToLong(count -> count*(count-1)/2).sum();
    }

    private AllocationResultDTO allocate(AllocationSnapshotDTO input, int target) { return engine.allocate(input, target, 42, LIMITS); }

    private void assertValid(AllocationSnapshotDTO input, AllocationResultDTO result) {
        assertThat(result.status()).isEqualTo(FEASIBLE);
        assertThat(result.groups()).hasSize(result.targetGroupCount());
        var assigned = result.groups().stream().flatMap(g -> g.members().stream()).map(GroupMemberDTO::getStudentId).toList();
        assertThat(assigned).doesNotHaveDuplicates().containsExactlyInAnyOrderElementsOf(input.students().stream().map(GroupMemberDTO::getStudentId).toList());
        assertThat(result.groups()).allSatisfy(g -> {
            assertThat(g.members()).filteredOn(m -> m.getRole() == GroupMemberRole.LEADER).hasSize(1);
            assertThat(g.members()).anySatisfy(m -> { assertThat(m.getStudentId()).isEqualTo(g.leaderId()); assertThat(m.getRole()).isEqualTo(GroupMemberRole.LEADER); });
            if (!g.protectedGroup()) assertThat(validator.areAllRulesPassed(validator.evaluateRules(input.rules(), g.members()))).isTrue();
        });
    }

    private static AllocationSnapshotDTO snapshot(List<GroupMemberDTO> students, List<GroupDTO> groups, List<GroupingRuleDTO> rules) {
        return new AllocationSnapshotDTO(17, 3, students, groups, rules);
    }
    private static List<GroupMemberDTO> students(int count) { return IntStream.rangeClosed(1, count).mapToObj(id -> student(id, id % 2 + 1)).toList(); }
    private static GroupMemberDTO student(int id, int major) {
        return GroupMemberDTO.builder().studentId((long) id).fullName("Student " + id).majorId(major).majorCode(major == 1 ? "SE" : "M" + major).build();
    }
    private static GroupDTO group(int id, GroupStatus status, List<GroupMemberDTO> students) {
        List<GroupMemberDTO> members = new ArrayList<>();
        for (int i = 0; i < students.size(); i++) {
            var student = students.get(i);
            members.add(GroupMemberDTO.builder().studentId(student.getStudentId()).fullName(student.getFullName())
                .majorId(student.getMajorId()).majorCode(student.getMajorCode()).groupId((long) id)
                .role(i == 0 ? GroupMemberRole.LEADER : GroupMemberRole.MEMBER).build());
        }
        return GroupDTO.builder().id((long) id).name("G" + id).status(status).schoolClassId(17).deadlineId(3)
            .leaderId(members.getFirst().getStudentId()).members(members).build();
    }
    private static GroupingRuleDTO rule(GroupingRuleCode code, int value, boolean enabled) { return new GroupingRuleDTO(code, value, enabled); }
    private static void assertReason(AllocationResultDTO result, ReasonCode code) {
        assertThat(result.status()).isEqualTo(PROVEN_INFEASIBLE);
        assertThat(result.reasons()).extracting(Reason::code).contains(code);
    }
}
