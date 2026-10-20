import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/services/api/client';
import { classApi } from '@/features/classes/api/classApi';

vi.mock('@/services/api/client', () => ({ apiClient: { put: vi.fn() } }));
const response = { id: 7, name: 'Class', termId: 2, termName: 'FALL26', lecturerId: 100,
  lecturerCode: 'GV100', lecturerName: 'Lecturer', lecturerEmail: 'lecturer@example.test',
  studentCount: 0, createdDate: '2026-10-13T00:00:00Z' };
beforeEach(() => vi.resetAllMocks());
describe('Class lecturer assignment response', () => {
  it('sends the new lecturer and expected empty assignment, requiring a confirmed response', async () => {
    vi.mocked(apiClient.put).mockResolvedValue(response);
    expect(await classApi.assignLecturer(7, 100, null)).toEqual(response);
    expect(apiClient.put).toHaveBeenCalledWith('/api/school-classes/7/lecturer', { lecturerId: 100, expectedLecturerId: null });
  });
  it('sends the previously read lecturer when changing an assigned class', async () => {
    vi.mocked(apiClient.put).mockResolvedValue(response);
    await classApi.assignLecturer(7, 100, 200);
    expect(apiClient.put).toHaveBeenCalledWith('/api/school-classes/7/lecturer', { lecturerId: 100, expectedLecturerId: 200 });
  });
  it.each([undefined, null, {}, { ...response, id: 8 }, { ...response, lecturerId: null },
    { ...response, lecturerId: 200 }, { ...response, lecturerId: '100' }])('rejects an unconfirmed response %#', async body => {
    vi.mocked(apiClient.put).mockResolvedValue(body);
    await expect(classApi.assignLecturer(7, 100, null)).rejects.toMatchObject({ status: 0 });
    expect(apiClient.put).toHaveBeenCalledTimes(1);
  });
});
