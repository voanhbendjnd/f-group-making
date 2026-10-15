import { TermProvider } from '@/app/providers/TermContext';
import { TermSelect } from '@/features/terms/components/TermSelect';
import { termApi } from '@/features/terms/api/termApi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LecturerClassListPage } from '@/pages/lecturer/LecturerClassListPage';
import { LecturerClassDetailPage } from '@/pages/lecturer/LecturerClassDetailPage';
import { classApi } from '@/features/classes/api/classApi';
import { ruleApi } from '@/features/rules/api/ruleApi';
import { RULE_CODES } from '@/features/rules/types';
import type { SchoolClass } from '@/features/classes/types';
import i18n from '@/locales/i18n';

const auth = vi.hoisted(() => ({ user: { id: 10, authorities: ['ROLE_LECTURE'] } }));
vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/features/classes/api/classApi', () => ({ classApi: {
  getClasses: vi.fn(), getMyClasses: vi.fn(), getClassById: vi.fn(), getClassStudents: vi.fn(),
} }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/features/terms/api/termApi', () => ({ termApi: { getTerms: vi.fn(), getCurrentTerm: vi.fn() } }));
vi.mock('@/features/rules/api/ruleApi', () => ({ ruleApi: { getRules: vi.fn(), saveRules: vi.fn() } }));

const ownClass: SchoolClass = {
  id: 1, name: 'Owned class', lecturerId: 10, lecturerName: 'Assigned teacher',
  lecturerCode: 'T10', lecturerEmail: 'teacher@example.com', termId: 1, termName: 'FA26',
  studentCount: 12, createdDate: '2026-10-13T00:00:00Z',
};
const otherClass = { ...ownClass, id: 2, name: 'Other class', lecturerId: 20 };
const config = { schoolClassId: 2, version: 0, configured: false, warnings: [],
  rules: RULE_CODES.map((code, index) => ({ code, status: true, value: [4, 6, 1, 50, 1, 6, 1][index]! })) };
const clients: QueryClient[] = [];

function renderPage(detail = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[detail ? '/lecturer/classes/2' : '/lecturer/classes']}>
    <TermProvider><TermSelect compact /><Routes>
      <Route path="/lecturer/classes" element={<LecturerClassListPage />} />
      <Route path="/lecturer/classes/:id" element={<LecturerClassDetailPage />} />
    </Routes></TermProvider>
  </MemoryRouter></QueryClientProvider>);
}

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(termApi.getCurrentTerm).mockResolvedValue({ id: 1, name: 'FALL26', isCurrent: true });
  vi.mocked(termApi.getTerms).mockResolvedValue([{ id: 1, name: 'FALL26', isCurrent: true }, { id: 2, name: 'SP26', isCurrent: false }]);
  auth.user.authorities = ['ROLE_LECTURE'];
  await i18n.changeLanguage('vi');
  vi.mocked(classApi.getMyClasses).mockResolvedValue({ result: [ownClass], meta: { page: 1, pageSize: 10, pages: 1, total: 1 } });
  vi.mocked(classApi.getClasses).mockResolvedValue({ result: [ownClass, otherClass], meta: { page: 1, pageSize: 10, pages: 1, total: 2 } });
  vi.mocked(classApi.getClassById).mockResolvedValue(otherClass);
  vi.mocked(classApi.getClassStudents).mockResolvedValue([]);
  vi.mocked(ruleApi.getRules).mockResolvedValue(config);
  vi.mocked(ruleApi.saveRules).mockImplementation(async (_id, request) => ({ ...config, ...request, version: 1, configured: true }));
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

describe('Class permissions in lecturer pages', () => {
  it.each(['ROLE_LECTURE', 'ROLE_LECTURE_MASTER'])('changes term and resets pagination without stale classes for %s', async role => {
    auth.user.authorities = [role];
    const api = role === 'ROLE_LECTURE' ? classApi.getMyClasses : classApi.getClasses;
    vi.mocked(api).mockImplementation(async params => ({
      result: params?.termId === 2 ? [] : [ownClass],
      meta: { page: params?.page || 1, pageSize: 10, pages: 2, total: params?.termId === 2 ? 0 : 12 },
    }));
    renderPage(); await screen.findByText('Owned class');
    fireEvent.click(screen.getByRole('button', { name: '2', exact: true }));
    await waitFor(() => expect(api).toHaveBeenLastCalledWith(expect.objectContaining({ termId: 1, page: 2 }), expect.any(AbortSignal)));
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'SP26' }));
    await waitFor(() => expect(api).toHaveBeenLastCalledWith(expect.objectContaining({ termId: 2, page: 1 }), expect.any(AbortSignal)));
    expect(screen.queryByText('Owned class')).not.toBeInTheDocument();
    expect(localStorage.getItem('f_group_selected_term_10')).toBe('2');
  });

  it('does not load students or rules for a class outside the selected term', async () => {
    renderPage(true); await screen.findByRole('heading', { name: i18n.t('lecturer.classTitle', { name: 'Other class' }) });
    await waitFor(() => expect(classApi.getClassStudents).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'SP26' }));
    await screen.findByText(i18n.t('terms.classOutsideTerm'));
    expect(screen.queryByText('Other class')).not.toBeInTheDocument();
    expect(ruleApi.getRules).not.toHaveBeenCalled();
    expect(classApi.getClassStudents).toHaveBeenCalledTimes(1);
  });

  it('loads only assigned classes for an ordinary lecturer', async () => {
    renderPage();
    await screen.findByText('Owned class');
    expect(screen.queryByText('Other class')).not.toBeInTheDocument();
    expect(classApi.getMyClasses).toHaveBeenCalledTimes(1);
    expect(classApi.getClasses).not.toHaveBeenCalled();
  });

  it.each(['ROLE_LECTURE_MASTER', 'ROLE_ADMIN'])('loads all classes for %s', async role => {
    auth.user.authorities = [role];
    renderPage();
    await screen.findByText('Other class');
    expect(screen.getByRole('heading', { name: 'Tất cả lớp học' })).toBeInTheDocument();
    expect(classApi.getClasses).toHaveBeenCalledTimes(1);
    expect(classApi.getMyClasses).not.toHaveBeenCalled();
  });

  it('gives a department head read-only access to another lecturer’s class', async () => {
    auth.user.authorities = ['ROLE_LECTURE_MASTER'];
    renderPage(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Xem quy định nhóm' }));
    await screen.findByText(/Bạn có quyền xem lớp này/);
    expect(screen.queryByRole('button', { name: 'Lưu quy định' })).not.toBeInTheDocument();
    screen.getAllByRole('spinbutton').forEach(input => expect(input).toHaveAttribute('readonly'));
    expect(ruleApi.saveRules).not.toHaveBeenCalled();
  });

  it('allows a department head to manage a class assigned to them', async () => {
    auth.user.authorities = ['ROLE_LECTURE_MASTER'];
    vi.mocked(classApi.getClassById).mockResolvedValue({ ...otherClass, lecturerId: 10 });
    renderPage(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Quy định nhóm' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu quy định' }));
    await waitFor(() => expect(ruleApi.saveRules).toHaveBeenCalledTimes(1));
  });

  it('allows an admin to save rules of another lecturer’s class', async () => {
    auth.user.authorities = ['ROLE_ADMIN'];
    renderPage(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Quy định nhóm' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu quy định' }));
    await waitFor(() => expect(ruleApi.saveRules).toHaveBeenCalledTimes(1));
  });

  it('does not fetch students when the class detail is forbidden', async () => {
    vi.mocked(classApi.getClassById).mockRejectedValue({ status: 403, message: 'Class access denied' });
    renderPage(true);
    await screen.findByText('Class access denied');
    expect(classApi.getClassStudents).not.toHaveBeenCalled();
  });

  it('starts with rules collapsed, loads on demand and preserves the draft when collapsed again', async () => {
    vi.mocked(classApi.getClassById).mockResolvedValue({ ...otherClass, lecturerId: 10 });
    renderPage(true);
    const toggle = await screen.findByRole('button', { name: 'Quy định nhóm' });
    await screen.findByText('Lớp chưa có sinh viên');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(ruleApi.getRules).not.toHaveBeenCalled();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    const fields = await screen.findAllByRole('spinbutton');
    fireEvent.change(fields[0]!, { target: { value: '3' } });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(3);
    expect(ruleApi.getRules).toHaveBeenCalledTimes(1);
    expect(ruleApi.saveRules).not.toHaveBeenCalled();
  });
});
