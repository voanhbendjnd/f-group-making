import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClassStudentsPanel } from '@/features/classes/components/ClassStudentsPanel';
import { classApi } from '@/features/classes/api/classApi';
import { majorApi } from '@/features/majors/api/majorApi';
import type { Student } from '@/features/students/types';
import i18n from '@/locales/i18n';

vi.mock('@/features/classes/api/classApi', () => ({ classApi: { getClassStudents: vi.fn() } }));
vi.mock('@/features/majors/api/majorApi', () => ({ majorApi: { getMajors: vi.fn() } }));
const student: Student = {
  userId: 100, rollNumber: 'SE001', fullName: 'Nguyễn An', email: 'an@example.com', memberCode: 'MEM001',
  majorId: 1, majorCode: 'SE', majorName: 'Software Engineering', activated: true, hasActivationKey: false,
  activationKeyExpiresAt: null, isKeyExpired: false, createdDate: null, lastModifiedDate: null,
};
const second = { ...student, userId: 101, rollNumber: 'IB002', fullName: 'Trần Bình',
  email: 'binh@example.com', memberCode: 'MEM002', majorId: 2, majorCode: 'IB', majorName: 'International Business',
  activated: false, hasActivationKey: true };
const clients: QueryClient[] = [];
function renderPanel(classId = 12) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><ClassStudentsPanel key={classId} classId={classId} /></QueryClientProvider>);
}

beforeEach(async () => {
  vi.resetAllMocks(); await i18n.changeLanguage('vi');
  vi.mocked(classApi.getClassStudents).mockResolvedValue([student, second]);
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

describe('Class student roster', () => {
  it('fetches the selected class and displays student identity, major and activation status', async () => {
    renderPanel();
    await screen.findByText('Nguyễn An');
    expect(classApi.getClassStudents).toHaveBeenCalledWith(12, expect.any(AbortSignal));
    expect(screen.getByText('SE001')).toBeInTheDocument();
    expect(screen.getByText('an@example.com')).toBeInTheDocument();
    expect(screen.getByText('MEM001')).toBeInTheDocument();
    expect(screen.getByText('SE — Software Engineering')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Đã kích hoạt')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Chờ kích hoạt')).toBeInTheDocument();
    expect(screen.getByText('Hiển thị 2 / 2 sinh viên')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gửi kích hoạt/ })).not.toBeInTheDocument();
  });

  it('filters locally by code, name or email and clears the search without another request', async () => {
    renderPanel(); await screen.findByText('Nguyễn An');
    const search = screen.getByLabelText('Tìm kiếm sinh viên');
    for (const keyword of ['mem002', 'TRẦN BÌNH', 'binh@example.com']) {
      fireEvent.change(search, { target: { value: keyword } });
      fireEvent.keyDown(search, { key: 'Enter' });
      expect(screen.getByText('Trần Bình')).toBeInTheDocument();
      expect(screen.queryByText('Nguyễn An')).not.toBeInTheDocument();
    }
    fireEvent.change(search, { target: { value: 'missing' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByText('Không tìm thấy sinh viên phù hợp')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa từ khóa tìm kiếm' }));
    expect(screen.getByText('Nguyễn An')).toBeInTheDocument();
    expect(classApi.getClassStudents).toHaveBeenCalledTimes(1);
  });

  it('combines activation, invitation and exact class major filters, then resets them', async () => {
    renderPanel(); await screen.findByText('Nguyễn An');
    fireEvent.change(screen.getByLabelText('Trạng thái kích hoạt'), { target: { value: 'unactivated' } });
    expect(screen.queryByText('Nguyễn An')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(i18n.t('adminUx.linkStatus')), { target: { value: 'not_sent' } });
    expect(screen.getByText('Không tìm thấy sinh viên phù hợp')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(i18n.t('adminUx.linkStatus')), { target: { value: 'sent' } });
    expect(screen.getByText('Trần Bình')).toBeInTheDocument();
    fireEvent.focus(screen.getByRole('combobox', { name: 'Ngành' }));
    fireEvent.click(await screen.findByRole('option', { name: 'IB — International Business' }));
    expect(screen.getByRole('combobox', { name: 'Ngành' })).toHaveValue('IB — International Business');
    expect(screen.getByText('Hiển thị 1 / 2 sinh viên')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    expect(screen.getByText('Nguyễn An')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Ngành' })).toHaveValue('');
    expect(screen.getByLabelText('Trạng thái kích hoạt')).toHaveValue('all');
    expect(screen.getByLabelText(i18n.t('adminUx.linkStatus'))).toHaveValue('all');
    expect(majorApi.getMajors).not.toHaveBeenCalled();
    expect(classApi.getClassStudents).toHaveBeenCalledTimes(1);
  });

  it('filters by major text when no exact major has been selected', async () => {
    renderPanel(); await screen.findByText('Nguyễn An');
    const input = screen.getByRole('combobox', { name: 'Ngành' });
    fireEvent.change(input, { target: { value: 'business' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('Trần Bình')).toBeInTheDocument();
    expect(screen.queryByText('Nguyễn An')).not.toBeInTheDocument();
    expect(majorApi.getMajors).not.toHaveBeenCalled();
  });

  it('paginates the class roster and returns to the first page after filtering or resizing', async () => {
    vi.mocked(classApi.getClassStudents).mockResolvedValue(Array.from({ length: 25 }, (_, index) => ({ ...student,
      userId: 100 + index, rollNumber: `SE${String(index + 1).padStart(3, '0')}`, fullName: `Student ${index + 1}` })));
    renderPanel(); await screen.findByText('Student 1');
    expect(screen.getAllByRole('row')).toHaveLength(11);
    expect(screen.queryByText('Student 11')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(screen.getByText('Student 11')).toBeInTheDocument();
    expect(screen.queryByText('Student 1')).not.toBeInTheDocument();
    const search = screen.getByLabelText('Tìm kiếm sinh viên');
    fireEvent.change(search, { target: { value: 'SE001' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByText('Student 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    fireEvent.change(screen.getByLabelText(i18n.t('pagination.perPage')), { target: { value: '20' } });
    expect(screen.getAllByRole('row')).toHaveLength(21);
    expect(classApi.getClassStudents).toHaveBeenCalledTimes(1);
  });

  it('shows the empty class state after a successful empty response', async () => {
    vi.mocked(classApi.getClassStudents).mockResolvedValue([]);
    renderPanel();
    await screen.findByText('Lớp chưa có sinh viên');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows loading until the roster arrives', async () => {
    let resolve: (value: Student[]) => void = () => {};
    vi.mocked(classApi.getClassStudents).mockImplementation(() => new Promise(done => { resolve = done; }));
    renderPanel();
    expect(screen.getByText('Đang tải danh sách sinh viên...')).toBeInTheDocument();
    resolve([student]);
    await screen.findByText('Nguyễn An');
  });

  it.each([401, 403, 404])('does not retry or show student data for status %s', async status => {
    vi.mocked(classApi.getClassStudents).mockRejectedValue({ status, message: 'Roster unavailable' });
    renderPanel(); await screen.findByText('Roster unavailable');
    expect(classApi.getClassStudents).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('allows an explicit retry after a temporary loading failure', async () => {
    vi.mocked(classApi.getClassStudents).mockRejectedValue({ status: 503, message: 'Temporarily unavailable' });
    renderPanel(); await screen.findByText('Temporarily unavailable', {}, { timeout: 4000 });
    vi.mocked(classApi.getClassStudents).mockResolvedValue([student]);
    fireEvent.click(screen.getByRole('button'));
    await screen.findByText('Nguyễn An');
    await waitFor(() => expect(screen.queryByText('Temporarily unavailable')).not.toBeInTheDocument());
  });
});
