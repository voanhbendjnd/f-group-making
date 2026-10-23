export type GroupStatus = 'OPEN' | 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'DISBANDED';
export type GroupMemberRole = 'LEADER' | 'MEMBER';

export interface GroupMemberDTO {
  id?: number;
  groupId?: number;
  studentId: number;
  rollNumber: string;
  fullName: string;
  email?: string;
  memberCode: string;
  cohort?: string | null;
  slotType?: string | null;
  majorId?: number;
  majorCode: string;
  majorName: string;
  role: GroupMemberRole;
  joinedAt?: string;
  selfDescription?: string | null;
  matchScore?: number;
  matchReasons?: string[];
}

export interface GroupRecommendationDTO {
  groupId: number;
  groupName: string;
  currentMembers: number;
  maxMembers: number;
  matchScore: number;
  matchReasons: string[];
  isEligible: boolean;
}

export type GroupingRuleCode =
  | 'MIN_MEMBERS_PER_GROUP'
  | 'MAX_MEMBERS_PER_GROUP'
  | 'MIN_GROUPS_PER_CLASS'
  | 'MAX_GROUPS_PER_CLASS'
  | 'MIN_MAJORS_PER_GROUP'
  | 'MAX_MAJORS_PER_GROUP'
  | 'MIN_SE_MEMBERS_PER_GROUP';

export interface GroupRuleEvaluationDTO {
  code: GroupingRuleCode;
  ruleName: string;
  hardRule: boolean;
  targetValue: number;
  actualValue: number;
  passed: boolean;
  message: string;
}

export interface GroupingRuleDTO {
  code: GroupingRuleCode;
  value: number;
  status: boolean;
}

export interface GroupDTO {
  id: number;
  sequenceNo?: number | null;
  groupCode?: string | null;
  deadlineId: number;
  schoolClassId: number;
  name: string;
  leaderId: number;
  leaderName: string;
  status: GroupStatus;
  memberCount: number;
  maxMembers: number;
  rejectReason?: string;
  submittedRulesVersion?: number;
  isLecturerCreated?: boolean;
  version: number;
  createdDate?: string;
  members: GroupMemberDTO[];
  ruleEvaluations: GroupRuleEvaluationDTO[];
  allRulesPassed: boolean;
  hasHardRuleViolations: boolean;
}

export interface WorkspaceDTO {
  deadlineId: number;
  deadlineName: string;
  deadlineDescription?: string;
  deadlineStatus: string;
  deadlineStartTime: string | null;
  deadlineEndTime: string | null;
  deadlineExpired: boolean;
  readOnlyReason?: string | null;
  canManageGroups: boolean;

  schoolClassId: number;
  schoolClassName: string;
  lecturerId?: number;
  rulesVersion: number;

  myGroup?: GroupDTO | null;
  isLeader: boolean;

  groups: GroupDTO[];
  unassignedStudents: GroupMemberDTO[];
  rules: GroupingRuleDTO[];

  canCreateGroup: boolean;
  canJoinGroup: boolean;
  isLecturer: boolean;
}

export interface CreateGroupRequest {
  name: string;
}

export interface LecturerCreateGroupRequest {
  name: string;
  studentIds: number[];
  overrideReason?: string;
}

export interface TransferLeaderRequest {
  newLeaderId: number;
}

export interface RejectGroupRequest {
  reason: string;
}

export interface GroupRealtimeEvent {
  eventType: string;
  groupId?: number;
  deadlineId: number;
  schoolClassId: number;
  actor: string;
  timestamp: string;
  payload?: any;
}

export interface GroupReviewRow {
  group: GroupDTO; className: string; submittedAt: string | null; deadlineStatus: string;
  eligible: boolean; canReview: boolean; canReopen: boolean;
}
export interface GroupReviewParams { termId: number; classId?: number; status?: GroupStatus; search?: string; page: number; size: number; }
export interface GroupReviewPage { result: GroupReviewRow[]; meta: { page: number; pageSize: number; pages: number; total: number }; }

export type GroupInvitationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export interface GroupInvitationDTO {
  id: number;
  groupId: number;
  groupName: string;
  studentId: number;
  studentName: string;
  studentEmail: string;
  studentRollNumber: string;
  studentMajorCode: string;
  inviterId: number;
  inviterName: string;
  deadlineId: number;
  schoolClassId: number;
  status: GroupInvitationStatus;
  message?: string;
  createdAt: string;
  respondedAt?: string;
  currentMembers: number;
  maxMembers: number;
  matchReasons?: string[];
}

export interface SendInvitationRequest {
  studentId?: number;
  email?: string;
  message?: string;
}

export interface StudentSearchForInviteDTO {
  studentId: number;
  fullName: string;
  email: string;
  rollNumber: string;
  memberCode: string;
  majorId?: number;
  majorCode: string;
  majorName: string;
  selfDescription?: string | null;
  hasGroup: boolean;
  currentGroupId?: number;
  currentGroupName?: string;
  canInvite: boolean;
  ruleViolationReason?: string | null;
  hasPendingInvitation: boolean;
  pendingInvitationId?: number | null;
}

