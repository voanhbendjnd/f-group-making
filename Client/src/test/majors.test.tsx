import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/app/providers/ToastContext';
import { majorApi } from '@/features/majors/api/majorApi';
import { getMajorErrorKey } from '@/features/majors/utils/majorErrors';
import type { Major } from '@/features/majors/types';
import i18n from '@/locales/i18n';
import { MajorListPage } from '@/pages/admin/MajorListPage';

vi.mock('@/features/majors/api/majorApi', () => ({
  majorApi: {
    getMajors: vi.fn(),
    getMajorById: vi.fn(),
    createMajor: vi.fn(),
    updateMajor: vi.fn(),
    deleteMajor: vi.fn(),
  },
}));

const major: Major = { id: 1, code: 'SE', name: 'Software Engineering' };
let queryClient: QueryClient;

function renderPage() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider><MajorListPage /></ToastProvider>
    </QueryClientProvider>
  );
}

describe('Major management', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await i18n.changeLanguage('en');
    vi.mocked(majorApi.getMajors).mockResolvedValue({
      meta: { page: 1, pageSize: 10, pages: 1, total: 1 }, result: [major],
    });
    vi.mocked(majorApi.getMajorById).mockResolvedValue(major);
  });

  afterEach(() => {
    cleanup();
    queryClient?.clear();
  });

  it('renders the list, validates fields, creates trimmed values and refreshes', async () => {
    vi.mocked(majorApi.createMajor).mockResolvedValue({ id: 2, code: 'AI', name: 'Artificial Intelligence' });
    renderPage();
    expect(await screen.findByRole('table', { name: 'Major Management' })).toBeInTheDocument();
    expect(majorApi.getMajors).toHaveBeenCalledWith({ page: 1, size: 10 });
    expect(screen.getByText('Showing 1 - 1 of 1 majors')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Major' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Please enter the major code.')).toBeInTheDocument();
    expect(screen.getByText('Please enter the major name.')).toBeInTheDocument();
    expect(majorApi.createMajor).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Major Code/), { target: { value: ' AI ' } });
    fireEvent.change(screen.getByLabelText(/Major Name/), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Please enter the major name.')).toBeInTheDocument();
    expect(majorApi.createMajor).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Major Name/), { target: { value: ' Artificial Intelligence ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(majorApi.createMajor).toHaveBeenCalledWith({ code: 'AI', name: 'Artificial Intelligence' }));
    expect(await screen.findByText('Major created successfully.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(majorApi.getMajors).toHaveBeenCalledTimes(2));
  });

  it('keeps duplicate errors and entered values and translates an open form when language changes', async () => {
    vi.mocked(majorApi.createMajor).mockRejectedValue({ status: 409, errorKey: 'error.codeexists' });
    renderPage();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Add Major' }));
    fireEvent.change(screen.getByLabelText(/Major Code/), { target: { value: 'SE' } });
    fireEvent.change(screen.getByLabelText(/Major Name/), { target: { value: 'Test Major' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('This major code already exists. Please use a different code.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Major Code/)).toHaveValue('SE');

    await act(async () => { await i18n.changeLanguage('vi'); });
    expect(screen.getByRole('heading', { name: 'Thêm ngành' })).toBeInTheDocument();
    expect(screen.getByText('Mã ngành này đã tồn tại. Vui lòng nhập mã khác.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Mã ngành/)).toHaveValue('SE');
  });

  it('loads details using the detail API and lets the admin edit them', async () => {
    vi.mocked(majorApi.updateMajor).mockResolvedValue({ ...major, name: 'Updated Major' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'View major SE' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Software Engineering')).toBeInTheDocument();
    expect(majorApi.getMajorById).toHaveBeenCalledWith(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText(/Major Code/)).toHaveValue('SE');
    fireEvent.change(screen.getByLabelText(/Major Name/), { target: { value: 'Updated Major' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(majorApi.updateMajor).toHaveBeenCalledWith(1, { code: 'SE', name: 'Updated Major' }));
    expect(await screen.findByText('Major updated successfully.')).toBeInTheDocument();
  });

  it('shows the backend restriction when changing the code of a major used by students', async () => {
    vi.mocked(majorApi.updateMajor).mockRejectedValue({ status: 409, errorKey: 'error.majorcodeinuse' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit major SE' }));
    fireEvent.change(screen.getByLabelText(/Major Code/), { target: { value: 'NEW' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Students are using this major. Keep its current code; you can still edit its name.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Major Code/)).toHaveValue('NEW');
  });

  it('requires confirmation and shows a localized delete restriction without removing the row', async () => {
    vi.mocked(majorApi.deleteMajor).mockRejectedValue({ status: 409, errorKey: 'error.majorinuse' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete major SE' }));
    expect(majorApi.deleteMajor).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('This major is used by students or linked to terms and cannot be deleted.')).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('SE');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('returns to the previous page after deleting its last major', async () => {
    let deleted = false;
    vi.mocked(majorApi.getMajors).mockImplementation(async ({ page, size }) => {
      if (page === 2) {
        return { meta: { page, pageSize: size, pages: deleted ? 1 : 2, total: deleted ? 10 : 11 }, result: deleted ? [] : [major] };
      }
      return { meta: { page, pageSize: size, pages: deleted ? 1 : 2, total: deleted ? 10 : 11 }, result: [{ id: 2, code: 'AI', name: 'Artificial Intelligence' }] };
    });
    vi.mocked(majorApi.deleteMajor).mockImplementation(async () => { deleted = true; });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));
    const deleteButton = await screen.findByRole('button', { name: 'Delete major SE' });
    await waitFor(() => expect(deleteButton).toBeEnabled());
    fireEvent.click(deleteButton);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Major deleted successfully.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'View major AI' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(majorApi.getMajors).toHaveBeenLastCalledWith({ page: 1, size: 10 }));
  });

  it('shows an empty catalog and offers creation', async () => {
    vi.mocked(majorApi.getMajors).mockResolvedValue({ meta: { page: 1, pageSize: 10, pages: 0, total: 0 }, result: [] });
    renderPage();
    expect(await screen.findByText('No majors yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('changes the page size and resets the request to page one', async () => {
    renderPage();
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Per page:'), { target: { value: '20' } });
    await waitFor(() => expect(majorApi.getMajors).toHaveBeenLastCalledWith({ page: 1, size: 20 }));
  });

  it('combines search and name filters, resets pagination and clears them', async () => {
    vi.mocked(majorApi.getMajors).mockResolvedValue({
      meta: { page: 1, pageSize: 10, pages: 2, total: 11 }, result: [major],
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(majorApi.getMajors).toHaveBeenLastCalledWith({ page: 2, size: 10 }));
    fireEvent.change(screen.getByLabelText('Search code or name'), { target: { value: ' SE ' } });
    fireEvent.change(screen.getByLabelText('Major name'), { target: { value: 'temporary' } });
    expect(screen.queryByRole('button', { name: 'Apply filters' })).not.toBeInTheDocument();
    await waitFor(() => expect(majorApi.getMajors).toHaveBeenLastCalledWith({ page: 1, size: 10, search: 'SE', temporaryName: true }));
    fireEvent.change(screen.getByLabelText('Major name'), { target: { value: 'named' } });
    await waitFor(() => expect(majorApi.getMajors).toHaveBeenLastCalledWith({ page: 1, size: 10, search: 'SE', temporaryName: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(majorApi.getMajors).toHaveBeenLastCalledWith({ page: 1, size: 10 }));
    expect(screen.getByLabelText('Search code or name')).toHaveValue('');
    expect(screen.getByLabelText('Major name')).toHaveValue('all');
  });

  it('shows a filtered empty state and lets the admin clear it', async () => {
    vi.mocked(majorApi.getMajors).mockImplementation(async (params) => ({
      meta: { page: 1, pageSize: 10, pages: params.search ? 0 : 1, total: params.search ? 0 : 1 },
      result: params.search ? [] : [major],
    }));
    renderPage();
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Search code or name'), { target: { value: 'unknown' } });
    expect(await screen.findByText('No matching majors')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' }).at(-1)!);
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByLabelText('Search code or name')).toHaveValue('');
  });

  it('shows a translated list error and retries on request', async () => {
    vi.mocked(majorApi.getMajors).mockRejectedValueOnce({ status: 500 });
    renderPage();
    expect(await screen.findByText('Server is temporarily unavailable. Please try again later.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});

describe('Major backend error mapping', () => {
  it.each([
    ['error.codeexists', 'majors.errors.codeExists'],
    ['nameexists', 'majors.errors.nameExists'],
    ['error.majorcodeinuse', 'majors.errors.codeInUse'],
    ['error.majorinuse', 'majors.errors.inUse'],
    ['error.majornotfound', 'majors.errors.notFound'],
    ['error.invalidcode', 'majors.validation.codeLength'],
    ['error.invalidname', 'majors.validation.nameLength'],
  ])('maps %s into %s', (errorKey, expected) => {
    expect(getMajorErrorKey({ errorKey })).toBe(expected);
  });
});
