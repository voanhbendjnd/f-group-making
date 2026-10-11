export interface ImportRowError {
  row: number;
  rollNumber: string | null;
  field: string;
  message: string;
}

export interface ImportResult {
  success: boolean;
  totalImported: number;
  errors: ImportRowError[];
  confirmationRequired?: boolean;
  newMajorCodes?: string[];
  createdMajorCodes?: string[];
}

export interface ParsedStudentRow {
  rowNumber: number;
  rollNumber: string;
  fullName: string;
  originalMajor: string;
  extractedMajorCode?: string;
  memberCode: string;
  email: string;
  isValid: boolean;
  validationErrors: string[];
}
