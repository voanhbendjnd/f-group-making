import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DepartmentOverviewPage } from '@/pages/lecturer/DepartmentOverviewPage';
import { DepartmentClassDetailPage } from '@/pages/lecturer/DepartmentClassDetailPage';
import { departmentApi } from '@/features/department/api/departmentApi';
import { Sidebar } from '@/components/layout/Sidebar';
import type { DepartmentClassDetail, DepartmentOverview, DepartmentStatistics } from '@/features/department/types';
import type { SchoolClass } from '@/features/classes/types';
import i18n from '@/locales/i18n';

const context = vi.hoisted(() => ({ role: 'ROLE_LECTURE_MASTER', term: 8, subscribe: vi.fn(() => () => {}), rules: vi.fn(), zalo: vi.fn(), students: vi.fn() }));
vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, name: 'Head', authorities: [context.role] }, isAdmin: context.role === 'ROLE_ADMIN', logout: vi.fn() }) }));
vi.mock('@/app/providers/TermContext', () => ({ useTerm: () => ({ selectedTermId: context.term, selectedTerm: { id: context.term, name: `TERM${context.term}` }, isLocked: false }) }));
vi.mock('@/app/providers/realtimeContext', () => ({ useRealtime: () => ({ subscribe: context.subscribe }) }));
vi.mock('@/features/department/api/departmentApi', () => ({ departmentApi: { overview: vi.fn(), detail: vi.fn() } }));
vi.mock('@/features/classes/components/ClassMajorDistributionCard', () => ({ ClassMajorDistributionCard: () => <p>Major distribution</p> }));
vi.mock('@/features/classes/components/ClassStudentsPanel', () => ({ ClassStudentsPanel: (props: { classId: number }) => { context.students(props); return <p>Class student list</p>; } }));
vi.mock('@/features/rules/components/ClassRulesDisclosure', () => ({ ClassRulesDisclosure: (props: { readOnly: boolean }) => { context.rules(props); return <p>{props.readOnly ? 'Rules are read only' : 'Rules editor'}</p>; } }));
vi.mock('@/features/zalo/components/ZaloManagementPanel', () => ({ ZaloManagementPanel: (props: { canManage: boolean }) => { context.zalo(props); return <p>{props.canManage ? 'Zalo editor' : 'Zalo is read only'}</p>; } }));

const stats: DepartmentStatistics = { students: 3, activatedStudents: 2, groupedStudents: 2, unassignedStudents: 1,
  groups: 2, openGroups: 0, pendingGroups: 1, acceptedGroups: 1, revokedGroups: 0 };
const own: SchoolClass = { id: 2, name: 'Own department class', lecturerId: 1, lecturerName: 'Head', lecturerCode: 'GV1', lecturerEmail: null, termId: 8, termName: 'TERM8', studentCount: 2, createdDate: '' };
const foreign: SchoolClass = { ...own, id: 3, name: 'Foreign department class', lecturerId: 99, lecturerName: 'Other lecturer' };
const overview: DepartmentOverview = { summary: { classes: 2, lecturers: 2, unassignedClasses: 0, statistics: stats },
  classes: { result: [{ schoolClass: own, statistics: stats }], meta: { page: 1, pageSize: 1, total: 2, pages: 2 } } };
const detail: DepartmentClassDetail = { schoolClass: foreign, statistics: stats, assignedStudentIds: [10, 11],
  groups: [{ id: 1, sequenceNo: 1, name: 'Dashboard group', status: 'PENDING', leaderName: 'Student leader', deadlineId: 4, deadlineName: 'Session A', members: 2 }] };
let client: QueryClient;
function tree(entry = '/lecturer/department-overview', sidebar = false) {
  return <QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}>
    {sidebar && <Sidebar area="lecturer" />}<Routes>
      <Route path="/lecturer/department-overview" element={<DepartmentOverviewPage />} />
      <Route path="/lecturer/department-overview/classes/:id" element={<DepartmentClassDetailPage />} />
      <Route path="/unauthorized" element={<p>Access denied</p>} />
    </Routes>
  </MemoryRouter></QueryClientProvider>;
}
beforeEach(async () => {
  vi.clearAllMocks(); context.role = 'ROLE_LECTURE_MASTER'; context.term = 8; await i18n.changeLanguage('en');
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(departmentApi.overview).mockImplementation(async params => ({ ...overview, classes: { ...overview.classes,
    meta: { ...overview.classes.meta, page: params.page || 1 }, result: [{ schoolClass: params.page === 2 ? foreign : own, statistics: stats }] } }));
  vi.mocked(departmentApi.detail).mockResolvedValue(detail);
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });

describe('Separate department overview', () => {
  it('shows term statistics and opens a class with read-only information tabs', async () => {
    render(tree());
    await screen.findByText(own.name);
    expect(departmentApi.overview).toHaveBeenCalledWith(expect.objectContaining({ termId: 8, classScope: 'ALL' }), expect.any(AbortSignal));
    expect(screen.getAllByRole('article')).toHaveLength(6);
    expect(screen.getByRole('img', { name: i18n.t('departmentOverview.progressAria', { percent: 67 }) })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2', exact: true }));
    fireEvent.click(await screen.findByRole('link', { name: i18n.t('lecturer.openClassLabel', { name: foreign.name }) }));
    await screen.findByRole('heading', { name: foreign.name });
    expect(departmentApi.detail).toHaveBeenCalledWith(3, 8, expect.any(AbortSignal));
    fireEvent.click(screen.getByRole('tab', { name: i18n.t('departmentOverview.groups'), exact: true }));
    await screen.findByText('Dashboard group', { exact: false });
    fireEvent.click(screen.getByRole('tab', { name: i18n.t('groupReview.rules'), exact: true }));
    await screen.findByText('Rules are read only');
    expect(context.rules).toHaveBeenLastCalledWith(expect.objectContaining({ classId: 3, readOnly: true }));
    fireEvent.click(screen.getByRole('tab', { name: i18n.t('zalo.title'), exact: true }));
    await screen.findByText('Zalo is read only');
    expect(context.zalo).toHaveBeenLastCalledWith(expect.objectContaining({ canManage: false }));
    expect(screen.queryByText('Rules editor')).not.toBeInTheDocument();
  });

  it('keeps the overview read only even for a class assigned to the head', async () => {
    vi.mocked(departmentApi.detail).mockResolvedValue({ ...detail, schoolClass: own });
    render(tree('/lecturer/department-overview/classes/2'));
    await screen.findByRole('heading', { name: own.name });
    fireEvent.click(screen.getByRole('tab', { name: i18n.t('groupReview.rules'), exact: true }));
    await screen.findByText('Rules are read only');
    expect(context.rules).toHaveBeenLastCalledWith(expect.objectContaining({ readOnly: true }));
    expect(screen.queryByRole('link', { name: i18n.t('groupBoard.open') })).not.toBeInTheDocument();
  });

  it('resets pagination when the assignment filter or search changes', async () => {
    render(tree()); await screen.findByText(own.name);
    fireEvent.click(screen.getByRole('button', { name: '2', exact: true })); await screen.findByText(foreign.name);
    fireEvent.change(screen.getByLabelText(i18n.t('classVisibility.scope')), { target: { value: 'OTHERS' } });
    await waitFor(() => expect(departmentApi.overview).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, classScope: 'OTHERS' }), expect.any(AbortSignal)));
    fireEvent.change(await screen.findByLabelText(i18n.t('lecturer.searchLabel')), { target: { value: '  Foreign  ' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('lecturer.search'), exact: true }));
    await waitFor(() => expect(departmentApi.overview).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'Foreign', page: 1 }), expect.any(AbortSignal)));
  });

  it('clears old class information when the selected term changes', async () => {
    const view = render(tree()); await screen.findByText(own.name);
    vi.mocked(departmentApi.overview).mockResolvedValue({ ...overview, classes: { result: [], meta: { page: 1, pageSize: 10, pages: 0, total: 0 } } });
    context.term = 9; view.rerender(tree());
    await screen.findByText(i18n.t('departmentOverview.empty'));
    expect(screen.queryByText(own.name)).not.toBeInTheDocument();
    expect(departmentApi.overview).toHaveBeenLastCalledWith(expect.objectContaining({ termId: 9, page: 1, classScope: 'ALL' }), expect.any(AbortSignal));
  });

  it('shows the new navigation item only for a head and blocks direct ordinary lecturer access', async () => {
    render(tree('/lecturer/department-overview', true));
    expect(screen.getByRole('link', { name: i18n.t('departmentOverview.title'), exact: true })).toBeInTheDocument();
    cleanup(); client.clear(); vi.clearAllMocks(); context.role = 'ROLE_LECTURE';
    render(tree('/lecturer/department-overview', true));
    await screen.findByText('Access denied');
    expect(screen.queryByRole('link', { name: i18n.t('departmentOverview.title'), exact: true })).not.toBeInTheDocument();
    expect(departmentApi.overview).not.toHaveBeenCalled();
  });

  it('does not mount class data panels after a class outside the selected term is rejected', async () => {
    vi.mocked(departmentApi.detail).mockRejectedValue({ status: 400, message: 'Class outside selected term' });
    render(tree('/lecturer/department-overview/classes/3'));
    await screen.findByText('Class outside selected term');
    expect(context.students).not.toHaveBeenCalled(); expect(context.rules).not.toHaveBeenCalled(); expect(context.zalo).not.toHaveBeenCalled();
  });
});
