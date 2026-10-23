export type DeadlineStatus = 'UNSCHEDULED' | 'UPCOMING' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

export interface DeadlineClassWindow {
  schoolClassId: number;
  schoolClassName: string;
  startTime: string | null;
  endTime: string | null;
  status: DeadlineStatus;
  canEdit: boolean;
}

export interface Deadline {
  id: number;
  name: string;
  description?: string;
  startTime: string | null;
  endTime: string | null;
  status: DeadlineStatus;
  version?: number;
  cancelledAt?: string;
  cancelledBy?: string;
  canEdit?: boolean;
  canCancel?: boolean;
  canClose?: boolean;
  mixedClassWindows?: boolean;
  classWindows?: DeadlineClassWindow[];
  schoolClassIds: number[];
  schoolClassNames: string[];
  createdDate?: string;
  createdBy?: string;
  lastModifiedDate?: string;
  lastModifiedBy?: string;
}

export interface CreateDeadlineRequest {
  name: string;
  description?: string;
  startTime: string;
  endTime: string;
  schoolClassIds: number[];
}

export interface UpdateDeadlineRequest {
  id: number;
  name: string;
  description?: string;
  startTime?: string;
  endTime: string;
  schoolClassIds?: number[];
  confirmedClassIds?: number[];
  scope?: 'ALL' | 'SELECTED';
  targetClassIds?: number[];
  expectedVersion?: number;
}

export interface DeadlineValidateResult {
  valid: boolean;
  status: DeadlineStatus;
  deadlineId: number;
  name: string;
  description?: string;
  startTime: string | null;
  endTime: string | null;
  classId: number;
  className: string;
  message?: string;
}

export interface PaginatedDeadlines {
  meta: {
    page: number;
    pageSize: number;
    pages: number;
    total: number;
  };
  result: Deadline[];
}

export interface StudentDeadlineActivity {
  deadlineId: number;
  deadlineName: string;
  deadlineDescription?: string;
  startTime: string | null;
  endTime: string | null;
  status: DeadlineStatus;
  schoolClassId: number;
  schoolClassName: string;
  hasGroup: boolean;
  groupId?: number;
  groupName?: string;
  groupStatus?: 'OPEN' | 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'DISBANDED';
  memberCount?: number;
  maxMembers?: number;
  isLeader?: boolean;
}
