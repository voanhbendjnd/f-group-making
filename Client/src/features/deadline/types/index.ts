export type DeadlineStatus = 'UPCOMING' | 'ACTIVE' | 'EXPIRED';

export interface Deadline {
  id: number;
  name: string;
  description?: string;
  startTime: string;
  endTime: string;
  status: DeadlineStatus;
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
}

export interface DeadlineValidateResult {
  valid: boolean;
  status: DeadlineStatus;
  deadlineId: number;
  name: string;
  description?: string;
  startTime: string;
  endTime: string;
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
  startTime: string;
  endTime: string;
  status: DeadlineStatus;
  schoolClassId: number;
  schoolClassName: string;
  hasGroup: boolean;
  groupId?: number;
  groupName?: string;
  groupStatus?: 'OPEN' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  memberCount?: number;
  maxMembers?: number;
  isLeader?: boolean;
}
