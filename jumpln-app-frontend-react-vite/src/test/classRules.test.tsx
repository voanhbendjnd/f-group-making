import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClassRulesForm } from '@/features/rules/components/ClassRulesForm';
import { RULE_CODES, type ClassRules, type SaveClassRules } from '@/features/rules/types';
import i18n from '@/locales/i18n';

const config: ClassRules = {
  schoolClassId: 1, version: 0, configured: false, warnings: [],
  rules: RULE_CODES.map((code, index) => ({ code, value: [4, 6, 1, 50, 1, 6, 1][index]! })),
};
const saved = { ...config, version: 1, configured: true };
const minMembers = () => screen.getAllByLabelText(/Tối thiểu/)[0]!;

beforeEach(async () => { await i18n.changeLanguage('vi'); });
afterEach(cleanup);

describe('Class grouping rules workflow', () => {
  it('saves an SE minimum of zero to disable the requirement', async () => {
    const save = vi.fn(async (request: SaveClassRules) => ({ ...saved, rules: request.rules }));
    render(<ClassRulesForm initial={config} onSave={save} onReload={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Số sinh viên SE tối thiểu/), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu quy định' }));
    await screen.findByText('Đã lưu quy định nhóm cho lớp.');
    expect(save.mock.calls[0]![0].rules).toContainEqual({ code: 'MIN_SE_MEMBERS_PER_GROUP', value: 0 });
    expect(screen.getByLabelText(/Số sinh viên SE tối thiểu/)).toHaveValue(0);
  });

  it.each(['-1', '0.5', '1001', ''])('rejects invalid SE minimum %s', async value => {
    const save = vi.fn();
    render(<ClassRulesForm initial={config} onSave={save} onReload={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Số sinh viên SE tối thiểu/), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu quy định' }));
    await screen.findByText('Nhập số nguyên từ 0 đến 1.000.');
    expect(save).not.toHaveBeenCalled();
  });

  it('blocks an SE minimum that cannot fit with the minimum distinct majors', async () => {
    const save = vi.fn();
    render(<ClassRulesForm initial={config} onSave={save} onReload={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Số sinh viên SE tối thiểu/), { target: { value: '5' } });
    fireEvent.change(screen.getAllByLabelText(/Tối thiểu/)[2]!, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu quy định' }));
    await screen.findByText('Số sinh viên SE tối thiểu cùng số ngành tối thiểu vượt sức chứa tối đa của nhóm.');
    expect(save).not.toHaveBeenCalled();
  });

  it('continues to reject zero for the ordinary member rule', async () => {
    const save = vi.fn();
    render(<ClassRulesForm initial={config} onSave={save} onReload={vi.fn()} />);
    fireEvent.change(minMembers(), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu quy định' }));
    await screen.findByText('Nhập số nguyên từ 1 đến 1.000.');
    expect(save).not.toHaveBeenCalled();
  });

  it('shows a read-only form without save controls and cannot submit', async () => {
    const save = vi.fn();
    const { container } = render(<ClassRulesForm initial={config} onSave={save} onReload={vi.fn()} readOnly />);
    expect(screen.queryByRole('button', { name: 'Lưu quy định' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('spinbutton')).toHaveLength(RULE_CODES.length);
    screen.getAllByRole('spinbutton').forEach(input => expect(input).toHaveAttribute('readonly'));
    expect(screen.getByText(/Bạn có quyền xem lớp này/)).toBeInTheDocument();
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(save).not.toHaveBeenCalled());
  });
  it('shows unsaved suggestions and does not save on mount', () => {
    const save = vi.fn();
    render(<ClassRulesForm initial={config} onSave={save} onReload={vi.fn()} />);
    expect(screen.getByText('Chưa lưu quy định')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('submits all seven conditions once and accepts the server version', async () => {
    let resolve: (result: ClassRules) => void = () => {};
    const save = vi.fn((_request: SaveClassRules) => new Promise<ClassRules>(done => { resolve = done; }));
    render(<ClassRulesForm initial={config} onSave={save} onReload={vi.fn()} />);
    fireEvent.change(minMembers(), { target: { value: '3' } });
    const button = screen.getByRole('button', { name: 'Lưu quy định' });
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const request = save.mock.calls[0]![0];
    expect(request.version).toBe(0);
    expect(request.rules).toHaveLength(RULE_CODES.length);
    expect(request.rules[0]).toEqual({ code: 'MIN_MEMBERS_PER_GROUP', value: 3 });
    resolve({ ...saved, rules: request.rules });
    await screen.findByText('Đã lưu quy định nhóm cho lớp.');
    expect(screen.getByRole('button', { name: 'Lưu quy định' })).toBeDisabled();
  });

  it('keeps invalid values visible and blocks min greater than max', async () => {
    const save = vi.fn();
    render(<ClassRulesForm initial={config} onSave={save} onReload={vi.fn()} />);
    fireEvent.change(minMembers(), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu quy định' }));
    await screen.findByText('Giá trị tối thiểu phải nhỏ hơn hoặc bằng giá trị tối đa.');
    expect(save).not.toHaveBeenCalled();
    expect(minMembers()).toHaveValue(9);
    expect(minMembers()).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps the draft after a conflict and requires an explicit reload', async () => {
    const save = vi.fn().mockRejectedValue({ status: 409, message: 'Conflict' });
    const reload = vi.fn().mockResolvedValue(saved);
    render(<ClassRulesForm initial={config} onSave={save} onReload={reload} />);
    fireEvent.change(minMembers(), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu quy định' }));
    await screen.findByText(/Quy định đã thay đổi ở lần cập nhật khác/);
    expect(minMembers()).toHaveValue(3);
    expect(screen.getByRole('button', { name: 'Lưu quy định' })).toBeDisabled();
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Đọc lại quy định đã lưu' }));
    await screen.findByText(/Đã đọc lại quy định hiện tại/);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(minMembers()).toHaveValue(4);
    fireEvent.change(minMembers(), { target: { value: '5' } });
    expect(screen.getByRole('button', { name: 'Lưu quy định' })).toBeEnabled();
  });

  it('does not retry an unconfirmed save and retains the draft', async () => {
    const save = vi.fn().mockRejectedValue({ status: 500, message: 'Timeout', outcomeUnknown: true });
    render(<ClassRulesForm initial={config} onSave={save} onReload={vi.fn()} />);
    fireEvent.change(minMembers(), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu quy định' }));
    await screen.findByText(/Chưa xác nhận được kết quả lưu/);
    expect(save).toHaveBeenCalledTimes(1);
    expect(minMembers()).toHaveValue(3);
    expect(screen.queryByText('Đã lưu quy định nhóm cho lớp.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu quy định' })).toBeDisabled();
  });
});
