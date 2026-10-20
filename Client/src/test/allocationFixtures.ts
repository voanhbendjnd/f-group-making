// Test-only fixtures shaped after the actual Phase 3–4 Java DTOs. Never imported by production UI.
import type { AllocationGroup, AllocationReportData, ApplyResult, Overview, Preview, Score, Setup } from '@/features/allocation/types';
const score: Score = { scorePercent: 100, applicable: true, compositionRulesPassed: true, breakdown: [
  { code: 'MEMBERS', baseWeight: 40, effectiveWeightPercent: 40, fulfillmentPercent: 100, contributionPercent: 40,
    rules: [{ code: 'MIN_MEMBERS_PER_GROUP', actualValue: 4, targetValue: 4, passed: true, fulfillmentPercent: 100 }] },
] };
function group(id: number, ids: number[], fixed = false): AllocationGroup {
  return { groupId: id, name: `Fixture group ${id}`, status: fixed ? 'ACCEPTED' : 'OPEN', leaderId: ids[0], leaderName: `Student ${ids[0]}`,
    protectedGroup: fixed, allRulesPassed: ids.length >= 4, score,
    rules: [{ code: 'MIN_MEMBERS_PER_GROUP', scope: 'GROUP', actualValue: ids.length, targetValue: 4, passed: ids.length >= 4, hardRule: true }],
    members: ids.map((studentId, index) => ({ studentId, fullName: `Student ${studentId}`, rollNumber: `S${studentId}`, memberCode: `Member${studentId}`,
      majorId: index % 2 + 1, majorCode: index % 2 ? 'BA' : 'SE', majorName: index % 2 ? 'Business' : 'Software', role: index === 0 ? 'LEADER' : 'MEMBER' })) };
}
export const overviewFixture: Overview = {
  scope: { classId: 2, className: 'Class A', termId: 8, lecturerId: 1, rulesVersion: 1, deadlineId: 3,
    deadlineName: 'Fixture session', deadlineStatus: 'EXPIRED', startTime: '2026-10-01T00:00:00Z', endTime: '2026-10-02T00:00:00Z', deadlineVersion: 1 },
  snapshotFingerprint: 'a'.repeat(64), summary: { totalStudents: 8, totalGroups: 3, validGroups: 1, invalidGroups: 2, protectedGroups: 1, unassignedStudents: 0 },
  rules: [{ code: 'MIN_MEMBERS_PER_GROUP', value: 4, status: true }],
  groups: [group(1, [10, 11, 12, 13], true), group(2, [20, 21]), group(3, [30, 31])], unassignedStudents: [], warnings: [],
};
export const setupFixture: Setup = {
  scope: overviewFixture.scope, snapshotFingerprint: overviewFixture.snapshotFingerprint, seed: 17, summary: overviewFixture.summary,
  range: { minimum: 2, maximum: 3, protectedGroups: 1, editableStudents: 4, reasons: [{ code: 'PRELIMINARY_ONLY', parameters: { actual: 2, required: 3 } }] },
  suggestion: { suggestedCount: 2, status: 'FEASIBLE', checkedTargets: [{ target: 2, status: 'FEASIBLE' }], reasons: [{ code: 'VALIDATED_SUGGESTION', parameters: { actual: 2, required: 8 } }] },
  limits: { maximumSearchNodes: 100000, maximumSearchDepth: 256, createsNewGroups: false }, warnings: [],
};
export const reportFixture: AllocationReportData = {
  groupsBefore: 3, groupsAfter: 2, studentsBefore: 8, studentsAfter: 8, unassignedBefore: 0, unassignedAfter: 0,
  keptGroupIds: [1, 2], disbandedGroupIds: [3], protectedGroupIds: [1], createdGroupIds: [], leaderChanges: [],
  movements: [30, 31].map(studentId => ({ studentId, fullName: `Student ${studentId}`, rollNumber: `S${studentId}`, fromGroupId: 3,
    fromGroupName: 'Fixture group 3', toGroupId: 2, toGroupName: 'Fixture group 2', previouslyUnassigned: false })),
  groupChanges: overviewFixture.groups.map(g => ({ groupId: g.groupId, name: g.name, protectedGroup: g.protectedGroup, disbanded: g.groupId === 3,
    leaderBefore: g.leaderId, leaderNameBefore: g.leaderName, leaderAfter: g.groupId === 3 ? null : g.leaderId,
    leaderNameAfter: g.groupId === 3 ? null : g.leaderName, scoreBefore: g.score, scoreAfter: g.groupId === 3 ? null : score,
    rulesBefore: g.rules, rulesAfter: g.groupId === 3 ? [] : g.rules.map(r => ({ ...r, actualValue: 4, passed: true })) })),
};
export function previewFixture(): Preview {
  return { scope: overviewFixture.scope, snapshotFingerprint: overviewFixture.snapshotFingerprint, planFingerprint: 'b'.repeat(64), sameAsPreviousPlan: false,
    result: { status: 'FEASIBLE', targetGroupCount: 2, seed: 17, range: setupFixture.range, warnings: [], visitedNodes: 15, searchComplete: true,
      optimization: { validGroupsPreserved: 0, leadersPreserved: 1, movedStudents: 2, compatibilityUtility: 100 } },
    groups: [overviewFixture.groups[0], group(2, [20, 21, 30, 31])], report: reportFixture,
    previewId: '11111111-1111-4111-8111-111111111111', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 900000).toISOString() };
}
export function applyFixture(): ApplyResult {
  return { runId: 9, previewId: previewFixture().previewId!, actorId: 1, classId: 2, deadlineId: 3, targetGroupCount: 2, seed: 17,
    appliedAt: new Date().toISOString(), snapshotFingerprint: overviewFixture.snapshotFingerprint, planFingerprint: 'b'.repeat(64),
    approvedGroupIds: [2], cancelledInvitationIds: [], report: reportFixture };
}
