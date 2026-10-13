export interface SchoolClass {
  id: number;
  name: string;
  termId: number | null;
  termName: string | null;
  lecturerId: number | null;
  lecturerCode: string | null;
  lecturerName: string | null;
  lecturerEmail: string | null;
  studentCount: number;
  createdDate: string;
}

export interface SchoolClassFilterParams {
  search?: string;
  termId?: number;
  page?: number;
  size?: number;
  sort?: string;
}

export interface PaginatedSchoolClasses {
  meta: {
    page: number;
    pageSize: number;
    pages: number;
    total: number;
  };
  result: SchoolClass[];
}
