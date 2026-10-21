export interface CreateStudentValues {
  fullName: string;
  rollNumber: string;
  memberCode: string;
  email: string;
  majorId: number;
  termId: number;
  schoolClassId: number;
}

export interface Student {
  userId: number;
  rollNumber: string;
  fullName: string;
  email: string;
  memberCode: string;
  majorId: number | null;
  majorCode: string | null;
  majorName?: string | null;
  schoolClassId?: number | null;
  groupName?: string | null;
  lecturerCode?: string | null;
  activated: boolean;
  hasActivationKey: boolean;
  activationKeyExpiresAt: string | null;
  isKeyExpired: boolean;
  createdDate: string | null;
  lastModifiedDate: string | null;
}

export interface StudentFilterParams {
  termId?: number;
  search?: string;
  majorSearch?: string;
  majorId?: number;
  majorLabel?: string;
  activated?: boolean;
  hasActivationKey?: boolean;
  page?: number; // 1-indexed for Spring
  size?: number;
  sort?: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  pages: number;
  total: number;
}

export interface PaginatedStudents {
  meta: PaginationMeta;
  result: Student[];
}

export interface BatchActivationResult {
  totalRequested: number;
  totalProcessed: number;
  totalSkippedAlreadyActive: number;
  sentEmails: string[];
}
