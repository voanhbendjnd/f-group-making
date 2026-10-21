package com.fmaking.service.dto;

import com.fmaking.domain.GroupStatus;

import java.util.List;
import java.util.Map;

public record AllocationResultDTO(Status status, int targetGroupCount, long seed, PreliminaryRange range,
                                    List<PlannedGroup> groups, List<Long> disbandedGroupIds,
                                    List<Reason> reasons, long visitedNodes, boolean searchComplete,
                                    Optimization optimization) {
    public enum Status { FEASIBLE, PROVEN_INFEASIBLE, SEARCH_LIMIT_REACHED }

    public enum ReasonCode {
        TARGET_MUST_BE_POSITIVE, TARGET_BELOW_PROTECTED, NEW_GROUPS_NOT_ALLOWED,
        MEMBER_CAPACITY, INSUFFICIENT_MEMBERS, INSUFFICIENT_SE, INSUFFICIENT_MAJORS,
        CLASS_GROUP_BOUND, RULE_BOUNDS_CONFLICT, NO_EDITABLE_GROUP, NO_PARTITION,
        SEARCH_BUDGET_EXHAUSTED, SEARCH_DEPTH_LIMIT, PROTECTED_RULE_WARNING,
        PRELIMINARY_ONLY, VALIDATED_SUGGESTION, NO_CONFIRMED_SUGGESTION,
        SUGGESTED_BALANCED_SIZE, SUGGESTED_PRESERVES_VALID_GROUPS, PROTECTED_COUNTS_INCLUDED,
        SAME_AS_PREVIOUS_PLAN, BALANCED_SIZE_CONFLICT
    }

    /** Codes/parameters, not localized UI text. */
    public record Reason(ReasonCode code, Map<String, Long> parameters) {}

    /** Necessary bounds only: values inside this interval still require allocation search. */
    public record PreliminaryRange(int minimum, int maximum, int protectedGroups, int editableStudents,
                                    List<Reason> reasons) {
        public boolean hasCandidates() { return minimum <= maximum; }
    }

    public record PlannedGroup(Long groupId, String name, GroupStatus status, Long leaderId,
                                boolean protectedGroup, List<GroupMemberDTO> members, GroupScoreDTO score) {}

    /** Lexicographic objective; a feasible result is not necessarily a proven global optimum. */
    public record Optimization(int validGroupsPreserved, int leadersPreserved, int movedStudents,
                                long compatibilityUtility) {}

    public record CheckedTarget(int target, Status status) {}
    public record Suggestion(Integer suggestedCount, Status status, List<Reason> reasons,
                                List<CheckedTarget> checkedTargets) {}
}
