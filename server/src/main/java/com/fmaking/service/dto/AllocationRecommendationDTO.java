package com.fmaking.service.dto;

import java.util.List;
import java.util.Map;

/** Read-only comparison of saved plans; not a new score or authorization to Apply. */
public record AllocationRecommendationDTO(String snapshotFingerprint, String planId, Integer targetGroupCount,
        int eligiblePlans, int equivalentPlans, Metrics metrics, List<Reason> reasons) {
    public record SizeCount(int members, int groups) {}
    public record Metrics(int students, int groups, List<SizeCount> sizeDistribution, int sizeDifference,
            long sameMajorPairs, long evenDistributionLowerBound, long excessMajorPairs,
            int groupsWithThreePlusSameMajor, int groupsWithFourPlusSameMajor, int unknownMajorStudents,
            int validDraftsPreserved, int validDraftsBefore, int leadersPreserved, int leadersBefore,
            int movedStudents, int unassignedAllocated, int protectedGroups, Double averageGroupScore) {}
    public enum ReasonCode {
        ALL_RULES_PASSED, BALANCED_SIZES, MAJOR_DISTRIBUTION, MAJOR_CONCENTRATION_REMAINS, UNKNOWN_MAJORS,
        VALID_DRAFTS_PRESERVED, LEADERS_PRESERVED, STUDENT_MOVEMENTS, UNASSIGNED_ALLOCATED,
        PROTECTED_UNCHANGED, GROUP_SCORE, EQUIVALENT_PLANS, SEARCH_NOT_EXHAUSTIVE
    }
    public record Reason(ReasonCode code, Map<String, Number> parameters) {}
}
