package com.fmaking.service.dto;

import com.fmaking.domain.GroupStatus;
import com.fmaking.domain.GroupingRuleCode;
import com.fmaking.service.dto.AllocationResultDTO.*;

import java.time.Instant;
import java.util.List;

public record AllocationPreviewDTO(Scope scope, String snapshotFingerprint, String planFingerprint,
                                   boolean sameAsPreviousPlan, SearchSummary result, List<GroupView> groups, Report report,
                                   String previewId, Instant createdAt, Instant expiresAt) {
    public record Scope(Integer classId, String className, Integer termId, Long lecturerId, long rulesVersion,
                        Integer deadlineId, String deadlineName, String deadlineStatus,
                        Instant startTime, Instant endTime, long deadlineVersion) {}
    public record Summary(int totalStudents, int totalGroups, int unassignedStudents, int validGroups,
                          int invalidGroups, int protectedGroups) {}
    public enum RuleScope { GROUP, CLASS }
    public record RuleView(GroupingRuleCode code, RuleScope scope, int actualValue, int targetValue,
                           boolean passed, boolean hardRule) {}
    public record GroupView(Long groupId, String name, GroupStatus status, Long leaderId, String leaderName,
                            boolean protectedGroup, List<GroupMemberDTO> members, GroupScoreDTO score,
                            List<RuleView> rules, boolean allRulesPassed, String planGroupKey, boolean newGroup) {
        public GroupView(Long groupId, String name, GroupStatus status, Long leaderId, String leaderName,
                         boolean protectedGroup, List<GroupMemberDTO> members, GroupScoreDTO score,
                         List<RuleView> rules, boolean allRulesPassed) {
            this(groupId, name, status, leaderId, leaderName, protectedGroup, members, score, rules, allRulesPassed, null, false);
        }
        public String key() { return planGroupKey == null ? "group:" + groupId : planGroupKey; }
    }
    public record Overview(Scope scope, String snapshotFingerprint, Summary summary, List<GroupingRuleDTO> rules,
                           List<GroupView> groups, List<GroupMemberDTO> unassignedStudents, List<Reason> warnings) {}
    public record Setup(Scope scope, String snapshotFingerprint, long seed, Summary summary, PreliminaryRange range,
                        Suggestion suggestion, SmartLimits limits, List<Reason> warnings) {}
    public record SmartLimits(long maximumSearchNodes, int maximumSearchDepth, boolean createsNewGroups) {}
    public record SearchSummary(Status status, int targetGroupCount, long seed, PreliminaryRange range,
                                List<Reason> warnings, long visitedNodes, boolean searchComplete, Optimization optimization) {}
    public record Movement(Long studentId, String fullName, String rollNumber, Long fromGroupId, String fromGroupName,
                           Long toGroupId, String toGroupName, boolean previouslyUnassigned, String toGroupKey) {
        public Movement(Long studentId, String fullName, String rollNumber, Long fromGroupId, String fromGroupName,
                        Long toGroupId, String toGroupName, boolean previouslyUnassigned) {
            this(studentId, fullName, rollNumber, fromGroupId, fromGroupName, toGroupId, toGroupName, previouslyUnassigned, null);
        }
    }
    public record LeaderChange(Long groupId, Long previousLeaderId, String previousLeaderName,
                               Long leaderId, String leaderName, String planGroupKey) {
        public LeaderChange(Long groupId, Long previousLeaderId, String previousLeaderName, Long leaderId, String leaderName) {
            this(groupId, previousLeaderId, previousLeaderName, leaderId, leaderName, null);
        }
    }
    public record GroupChange(Long groupId, String name, boolean protectedGroup, boolean disbanded,
                              Long leaderBefore, String leaderNameBefore, Long leaderAfter, String leaderNameAfter,
                              GroupScoreDTO scoreBefore, GroupScoreDTO scoreAfter,
                              List<RuleView> rulesBefore, List<RuleView> rulesAfter, String planGroupKey, boolean newGroup) {
        public GroupChange(Long groupId, String name, boolean protectedGroup, boolean disbanded,
                           Long leaderBefore, String leaderNameBefore, Long leaderAfter, String leaderNameAfter,
                           GroupScoreDTO scoreBefore, GroupScoreDTO scoreAfter, List<RuleView> rulesBefore, List<RuleView> rulesAfter) {
            this(groupId, name, protectedGroup, disbanded, leaderBefore, leaderNameBefore, leaderAfter, leaderNameAfter,
                scoreBefore, scoreAfter, rulesBefore, rulesAfter, null, false);
        }
    }
    public record Report(int groupsBefore, int groupsAfter, int studentsBefore, int studentsAfter,
                         int unassignedBefore, int unassignedAfter, List<Long> keptGroupIds,
                         List<Long> disbandedGroupIds, List<Long> createdGroupIds, List<Long> protectedGroupIds,
                         List<Movement> movements, List<LeaderChange> leaderChanges, List<GroupChange> groupChanges,
                         List<String> createdGroupKeys) {
        public Report(int groupsBefore, int groupsAfter, int studentsBefore, int studentsAfter,
                      int unassignedBefore, int unassignedAfter, List<Long> keptGroupIds, List<Long> disbandedGroupIds,
                      List<Long> createdGroupIds, List<Long> protectedGroupIds, List<Movement> movements,
                      List<LeaderChange> leaderChanges, List<GroupChange> groupChanges) {
            this(groupsBefore, groupsAfter, studentsBefore, studentsAfter, unassignedBefore, unassignedAfter, keptGroupIds,
                disbandedGroupIds, createdGroupIds, protectedGroupIds, movements, leaderChanges, groupChanges, List.of());
        }
    }
}
