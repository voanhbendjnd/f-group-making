import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/services/api/client';
import { studentApi } from '@/features/students/api/studentApi';
import { lecturerApi } from '@/features/lecturers/api/lecturerApi';
import { classApi } from '@/features/classes/api/classApi';
import { importApi } from '@/features/import/api/importApi';

vi.mock('@/services/api/client', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));

describe('Term API contracts', () => {
  beforeEach(() => vi.resetAllMocks());

  it('passes termId alongside pagination and existing filters for each scoped list', async () => {
    await studentApi.getStudents({ termId: 7, page: 2, activated: false, majorId: 3 });
    expect(apiClient.get).toHaveBeenCalledWith('/api/students', { params: {
      termId: 7, page: 2, size: 10, activated: false, majorId: 3,
    } });
    await lecturerApi.getLecturers({ termId: 8, search: ' GV ' });
    expect(apiClient.get).toHaveBeenCalledWith('/api/lecturers', { params: { termId: 8, search: 'GV', page: 1, size: 10 } });
    await classApi.getClasses({ termId: 7 });
    expect(apiClient.get).toHaveBeenCalledWith('/api/school-classes', { params: { termId: 7, page: 1, size: 10 } });
  });

  it('omits termId for the explicitly global lecturer list', async () => {
    await lecturerApi.getLecturers({ page: 1 });
    expect(apiClient.get).toHaveBeenCalledWith('/api/lecturers', { params: { page: 1, size: 10 } });
  });

  it('sends activation scopes as query params while preserving Backend request bodies', async () => {
    await studentApi.sendSingleActivation(10, 'test@example.test', 7);
    expect(apiClient.post).toHaveBeenCalledWith('/api/activate', { userId: 10, email: 'test@example.test' }, { params: { termId: 7 } });
    await studentApi.sendBatchActivation([10, 11], 7);
    expect(apiClient.post).toHaveBeenCalledWith('/api/activate/mul', { userIds: [10, 11] }, { params: { termId: 7 } });
    await lecturerApi.sendSingleActivation(20, 'lecturer@example.test', 8);
    expect(apiClient.post).toHaveBeenCalledWith('/api/activate', { userId: 20, email: 'lecturer@example.test' }, { params: { termId: 8 } });
    await lecturerApi.sendBatchActivation([20], 8);
    expect(apiClient.post).toHaveBeenCalledWith('/api/activate/mul', { userIds: [20] }, { params: { termId: 8 } });
  });

  it('scopes activate-all and batch delete without altering endpoint contracts', async () => {
    await studentApi.sendActivateAllMatching(' Student ', undefined, 3, 7);
    expect(apiClient.post).toHaveBeenCalledWith('/api/students/activate/all', null, { params: { search: 'Student', majorId: 3, termId: 7 } });
    await lecturerApi.sendActivateAllMatching(' GV ', 8);
    expect(apiClient.post).toHaveBeenCalledWith('/api/lecturers/activate-all', null, { params: { search: 'GV', termId: 8 } });
    await lecturerApi.deleteBatchLecturers([20], 8);
    expect(apiClient.post).toHaveBeenCalledWith('/api/lecturers/batch-delete', [20], { params: { termId: 8 } });
  });

  it('includes the selected Term for student import and keeps lecturer import global', async () => {
    const file = new File(['test'], 'test.xlsx');
    await importApi.importExcel(file, 7, ['SE']);
    const studentForm = vi.mocked(apiClient.post).mock.calls[0][1] as FormData;
    expect(studentForm.get('file')).toBe(file);
    expect(studentForm.get('termId')).toBe('7');
    expect(studentForm.getAll('confirmedMajorCodes')).toEqual(['SE']);
    await lecturerApi.importExcel(file);
    const lecturerForm = vi.mocked(apiClient.post).mock.calls[1][1] as FormData;
    expect(lecturerForm.get('file')).toBe(file);
    expect(lecturerForm.has('termId')).toBe(false);
  });
});
