import type { SchoolClass, ClassViewScope } from '@/features/classes/types';
import type { GroupStatus } from '@/features/group/types/groupTypes';

export interface DepartmentStatistics {
  students: number; activatedStudents: number; groupedStudents: number; unassignedStudents: number;
  groups: number; openGroups: number; pendingGroups: number; acceptedGroups: number; revokedGroups: number;
}
export interface DepartmentClassRow { schoolClass: SchoolClass; statistics: DepartmentStatistics }
export interface DepartmentOverview {
  summary: { classes: number; lecturers: number; unassignedClasses: number; statistics: DepartmentStatistics };
  classes: { meta: { page: number; pageSize: number; pages: number; total: number }; result: DepartmentClassRow[] };
}
export interface DepartmentClassDetail extends DepartmentClassRow {
  assignedStudentIds: number[];
  groups: { id: number; sequenceNo: number | null; name: string; status: GroupStatus; leaderName: string | null;
    deadlineId: number; deadlineName: string | null; members: number }[];
}
export interface DepartmentFilters { termId: number; search?: string; classScope?: ClassViewScope; page?: number; size?: number }
