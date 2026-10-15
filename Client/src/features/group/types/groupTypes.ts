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
  majorId?: number;
  majorCode: string;
  majorName: string;
  role: GroupMemberRole;
  joinedAt?: string;
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
  deadlineStartTime: string;
  deadlineEndTime: string;
  deadlineExpired: boolean;

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
