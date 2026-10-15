import { useQuery } from '@tanstack/react-query';
import { majorApi } from '@/features/majors/api/majorApi';
import { classApi } from '@/features/classes/api/classApi';
import type { Major } from '@/features/majors/types';
import type { SchoolClass } from '@/features/classes/types';

export function useStudentCreateOptions(termId: number) {
  const majors = useQuery({
    queryKey: ['majors', 'student-create-options'],
    queryFn: async () => {
      const result: Major[] = [];
      let page = 1;
      while (true) {
        const data = await majorApi.getMajors({ page, size: 100, sort: 'code,asc' });
        result.push(...data.result);
        if (page >= data.meta.pages) return result;
        page += 1;
      }
    },
  });
  const classes = useQuery({
    queryKey: ['school-classes', 'student-create-options', termId],
    enabled: Number.isSafeInteger(termId) && termId > 0,
    queryFn: async ({ signal }) => {
      const result: SchoolClass[] = [];
      let page = 1;
      while (true) {
        const data = await classApi.getClasses({ termId, page, size: 100, sort: 'name,asc' }, signal);
        result.push(...data.result.filter((schoolClass) => schoolClass.termId === termId));
        if (page >= data.meta.pages) return result;
        page += 1;
      }
    },
  });
  return { majors, classes };
}
