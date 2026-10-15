export interface CreateLecturerValues {
  code: string;
  email: string;
}

export interface Lecturer {
  userId: number;
  code: string;
  name: string;
  email: string;
  activated: boolean;
  hasActivationKey: boolean;
  activationKeyExpiresAt: string | null;
  isKeyExpired: boolean;
  createdDate: string | null;
  lastModifiedDate: string | null;
}

export interface LecturerFilterParams {
  termId?: number;
  search?: string;
  activated?: boolean;
  hasActivationKey?: boolean;
  page?: number;
  size?: number;
  sort?: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  pages: number;
  total: number;
}

export interface PaginatedLecturers {
  meta: PaginationMeta;
  result: Lecturer[];
}

export interface ParsedLecturerRow {
  rowNumber: number;
  code: string;
  email: string;
  isValid: boolean;
  validationErrors: string[];
}

export interface ParseLecturerExcelResult {
  rows: ParsedLecturerRow[];
  totalRows: number;
  validCount: number;
  invalidCount: number;
  hasErrors: boolean;
}
