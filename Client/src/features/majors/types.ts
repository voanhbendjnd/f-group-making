export interface Major {
  id: number;
  code: string;
  name: string;
}

export interface MajorFormValues {
  code: string;
  name: string;
}

export interface MajorListParams {
  search?: string;
  temporaryName?: boolean;
  sort?: string;
  page: number;
  size: number;
}

export type MajorFilters = Pick<MajorListParams, 'search' | 'temporaryName'>;

export interface PaginatedMajors {
  meta: {
    page: number;
    pageSize: number;
    pages: number;
    total: number;
  };
  result: Major[];
}
