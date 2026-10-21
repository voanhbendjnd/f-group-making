import { studentApi } from './studentApi';
import type { Student, StudentFilterParams } from '../types';

/** Resolve an explicit recipient snapshot using every filter supported by the list. */
export async function getActivationRecipients(filters: StudentFilterParams, signal?: AbortSignal): Promise<Student[]> {
  const records = new Map<number, Student>();
  let page = 1;
  while (true) {
    const data = await studentApi.getStudents({ ...filters, page, size: 100 }, signal);
    data.result.forEach(student => records.set(student.userId, student));
    if (page >= data.meta.pages) return [...records.values()];
    page += 1;
  }
}
