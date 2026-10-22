import type { GroupMemberDTO, GroupStatus, GroupingRuleCode, GroupingRuleDTO } from '@/features/group/types/groupTypes';

export type AllocationStatus = 'FEASIBLE' | 'PROVEN_INFEASIBLE' | 'SEARCH_LIMIT_REACHED';
export interface Reason { code: string; parameters: Record<string, number> }
export interface Score {
  scorePercent: number | null; applicable: boolean; compositionRulesPassed: boolean;
  breakdown: { code: 'MEMBERS' | 'MAJORS' | 'SE'; baseWeight: number; effectiveWeightPercent: number;
    fulfillmentPercent: number; contributionPercent: number;
    rules: { code: GroupingRuleCode; actualValue: number; targetValue: number; passed: boolean; fulfillmentPercent: number }[] }[];
}
export interface RuleView { code: GroupingRuleCode; scope: 'GROUP' | 'CLASS'; actualValue: number; targetValue: number; passed: boolean; hardRule: boolean }
export interface AllocationGroup { groupId: number | null; planGroupKey?: string | null; newGroup?: boolean; name: string; status: GroupStatus; leaderId: number; leaderName: string | null;
  protectedGroup: boolean; members: GroupMemberDTO[]; score: Score; rules: RuleView[]; allRulesPassed: boolean }
export interface Scope { classId: number; className: string; termId: number | null; lecturerId: number | null; rulesVersion: number;
  deadlineId: number; deadlineName: string; deadlineStatus: string; startTime: string; endTime: string; deadlineVersion: number }
export interface Summary { totalStudents: number; totalGroups: number; unassignedStudents: number; validGroups: number; invalidGroups: number; protectedGroups: number }
export interface Overview { scope: Scope; snapshotFingerprint: string; summary: Summary; rules: GroupingRuleDTO[];
  groups: AllocationGroup[]; unassignedStudents: GroupMemberDTO[]; warnings: Reason[] }
export interface PreliminaryRange { minimum: number; maximum: number; protectedGroups: number; editableStudents: number; reasons: Reason[] }
export interface Setup { scope: Scope; snapshotFingerprint: string; seed: number; summary: Summary; range: PreliminaryRange;
  suggestion: { suggestedCount: number | null; status: AllocationStatus; reasons: Reason[]; checkedTargets: { target: number; status: AllocationStatus }[] };
  limits: { maximumSearchNodes: number; maximumSearchDepth: number; createsNewGroups: boolean }; warnings: Reason[] }
export interface AllocationReportData {
  groupsBefore: number; groupsAfter: number; studentsBefore: number; studentsAfter: number; unassignedBefore: number; unassignedAfter: number;
  keptGroupIds: number[]; disbandedGroupIds: number[]; createdGroupIds: number[]; createdGroupKeys?: string[] | null; protectedGroupIds: number[];
  movements: { studentId: number; fullName: string; rollNumber: string; fromGroupId: number | null; fromGroupName: string | null;
    toGroupId: number | null; toGroupKey?: string | null; toGroupName: string; previouslyUnassigned: boolean }[];
  leaderChanges: { groupId: number | null; planGroupKey?: string | null; previousLeaderId: number | null; previousLeaderName: string | null; leaderId: number; leaderName: string | null }[];
  groupChanges: { groupId: number | null; planGroupKey?: string | null; newGroup?: boolean; name: string; protectedGroup: boolean; disbanded: boolean; leaderBefore: number | null;
    leaderNameBefore: string | null; leaderAfter: number | null; leaderNameAfter: string | null; scoreBefore: Score | null; scoreAfter: Score | null;
    rulesBefore: RuleView[]; rulesAfter: RuleView[] }[];
}
export interface Preview { scope: Scope; snapshotFingerprint: string; planFingerprint: string | null; sameAsPreviousPlan: boolean;
  result: { status: AllocationStatus; targetGroupCount: number; seed: number; range: PreliminaryRange; warnings: Reason[];
    visitedNodes: number; searchComplete: boolean; optimization: { validGroupsPreserved: number; leadersPreserved: number; movedStudents: number; compatibilityUtility: number } | null };
  groups: AllocationGroup[]; report: AllocationReportData | null; previewId: string | null; createdAt: string | null; expiresAt: string | null }
export interface PreviewRequest { targetGroupCount: number; seed?: number; previousPlanFingerprint?: string }
export interface ApplyResult { runId: number; previewId: string; actorId: number; classId: number; deadlineId: number; targetGroupCount: number;
  seed: number; appliedAt: string; snapshotFingerprint: string; planFingerprint: string; approvedGroupIds: number[];
  cancelledInvitationIds: number[]; report: AllocationReportData }
export interface RunSummary { runId: number; previewId: string; actorId: number; targetGroupCount: number; seed: number; appliedAt: string }
export interface HistoryPage { meta: { page: number; pageSize: number; pages: number; total: number }; result: RunSummary[] }
export interface PlanSummary { planId: string; actorId: number; actorName: string | null; createdAt: string; appliedAt: string | null;
  targetGroupCount: number; seed: number; totalStudents: number | null; status: 'UNAPPLIED' | 'APPLIED' | 'INVALID';
  available: boolean; canApply: boolean; invalidReason: string | null }
export interface PlanDetail { summary: PlanSummary; preview: Preview }
export interface PlanPage { meta: HistoryPage['meta']; result: PlanSummary[] }
export interface PlanRecommendation {
  snapshotFingerprint: string | null; planId: string | null; targetGroupCount: number | null;
  eligiblePlans: number; equivalentPlans: number;
  metrics: { students: number; groups: number; sizeDistribution: { members: number; groups: number }[]; sizeDifference: number;
    sameMajorPairs: number; evenDistributionLowerBound: number; excessMajorPairs: number;
    groupsWithThreePlusSameMajor: number; groupsWithFourPlusSameMajor: number; unknownMajorStudents: number;
    validDraftsPreserved: number; validDraftsBefore: number; leadersPreserved: number; leadersBefore: number;
    movedStudents: number; unassignedAllocated: number; protectedGroups: number; averageGroupScore: number | null } | null;
  reasons: { code: string; parameters: Record<string, number> }[];
}
