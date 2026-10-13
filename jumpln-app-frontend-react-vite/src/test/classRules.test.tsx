import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClassRulesForm } from '@/features/rules/components/ClassRulesForm';
import { RULE_CODES, type ClassRules, type SaveClassRules } from '@/features/rules/types';
import i18n from '@/locales/i18n';

const config: ClassRules = {
  schoolClassId: 1, version: 0, configured: false, warnings: [],
  rules: RULE_CODES.map((code, index) => ({ code, status: true, value: [4, 6, 1, 50, 1, 6, 1][index]! })),
};
const saved = { ...config, version: 1, configured: true };
const minMembers = () => screen.getAllByLabelText(/Tối thiểu/)[0]!;

beforeEach(async () => { await i18n.changeLanguage('vi'); });
afterEach(cleanup);

describe('Class grouping rules workflow', () => {
  const toggle = (index: number) => screen.getAllByRole('switch')[index]!;

  it.each([
    { name: 'members', codes: RULE_CODES.slice(0, 2), min: 'MIN_MEMBERS_PER_GROUP', invalid: 9 },
    { name: 'groups', codes: RULE_CODES.slice(2, 4), min: 'MIN_GROUPS_PER_CLASS', invalid: 60 },
    { name: 'majors', codes: RULE_CODES.slice(4, 6), min: 'MIN_MAJORS_PER_GROUP', invalid: 8 },
    { name: 'seMembers', codes: RULE_CODES.slice(6), min: 'MIN_SE_MEMBERS_PER_GROUP', invalid: 7 },
  ])('toggles all limits of $name together and revalidates when enabled', async section => {
    const save = vi.fn(async (request: SaveClassRules) => ({ ...saved, rules: request.rules }));
    const { container } = render(<ClassRulesForm initial={config} onSave={save} onReload={vi.fn()} />);
    const change = (field: string, value: number) => fireEvent.change(container.querySelector(`#rule-${field}`)!, { target: { value: String(value) } });
    if (section.name === 'majors') change('MAX_MEMBERS_PER_GROUP', 100);
    change(section.min, section.invalid);
    const switchControl = screen.getByRole('switch', { name: i18n.t('rules.toggleLabel', { rule: i18n.t(`rules.sections.${section.name}.title`) }) });
    expect(screen.getAllByRole('switch')).toHaveLength(4);
    fireEvent.click(switchControl);
    section.codes.forEach(code => expect(container.querySelector(`#rule-${code}`)).toHaveAttribute('readonly'));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('rules.save') }));
    await screen.findByText(i18n.t('rules.saved'));
    section.codes.forEach(code => expect(save.mock.calls[0]![0].rules.find(rule => rule.code === code)!.status).toBe(false));
    fireEvent.click(switchControl);
    section.codes.forEach(code => expect(container.querySelector(`#rule-${code}`)).not.toHaveAttribute('readonly'));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('rules.save') }));
    await screen.findByText(i18n.t(section.name === 'seMembers' ? 'rules.seExceedMembers' : 'rules.minGreaterThanMax'));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('saves a status-only change, keeps values across languages and can discard it', async () => {
    const save = vi.fn(async (request: SaveClassRules) => ({ ...saved, version: request.version + 1, rules: request.rules }));
    render(<ClassRulesForm initial={saved} onSave={save} onReload={vi.fn()} />);
    expect(screen.getByRole('button', { name: i18n.t('rules.save') })).toBeDisabled();
    fireEvent.click(toggle(0));
    expect(screen.getByRole('button', { name: i18n.t('rules.save') })).toBeEnabled();
    await act(async () => { await i18n.changeLanguage('en'); });
    expect(toggle(0)).not.toBeChecked();
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(4);
    expect(screen.getAllByRole('spinbutton')[1]).toHaveValue(6);
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('rules.discard') }));
    expect(toggle(0)).toBeChecked();
    expect(screen.getByRole('button', { name: i18n.t('rules.save') })).toBeDisabled();
    fireEvent.click(toggle(0));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('rules.save') }));
    await screen.findByText(i18n.t('rules.saved'));
    expect(save.mock.calls[0]![0]).toMatchObject({ version: 1 });
    expect(save.mock.calls[0]![0].rules[0]).toEqual({ code: 'MIN_MEMBERS_PER_GROUP', value: 4, status: false });
    expect(save.mock.calls[0]![0].rules[1]).toEqual({ code: 'MAX_MEMBERS_PER_GROUP', value: 6, status: false });
    expect(toggle(0)).not.toBeChecked();
    expect(screen.getByRole('button', { name: i18n.t('rules.save') })).toBeDisabled();
    fireEvent.click(toggle(0));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('rules.save') }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0].version).toBe(2);
    expect(save.mock.calls[1]![0].rules.slice(0, 2).every(rule => rule.status)).toBe(true);
    await waitFor(() => expect(screen.getByRole('button', { name: i18n.t('rules.save') })).toBeDisabled());
  });

  it.each([0, 1])('preserves an existing partly enabled pair with bound %s enabled until the user toggles it', async enabledIndex => {
    const initial = { ...saved, rules: saved.rules.map((rule, index) => ({ ...rule,
      status: index < 2 ? index === enabledIndex : rule.status })) };
    const save = vi.fn(async (request: SaveClassRules) => ({ ...saved, version: 2, rules: request.rules }));
    render(<ClassRulesForm initial={initial} onSave={save} onReload={vi.fn()} />);
    expect(toggle(0)).toBeChecked();
    expect(screen.getByText(i18n.t('rules.partlyEnabled'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('rules.save') })).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
    screen.getAllByRole('spinbutton').slice(0, 2).forEach((input, index) => {
      if (index === enabledIndex) expect(input).not.toHaveAttribute('readonly');
      else expect(input).toHaveAttribute('readonly');
    });
    fireEvent.click(toggle(0));
    expect(screen.queryByText(i18n.t('rules.partlyEnabled'))).not.toBeInTheDocument();
    screen.getAllByRole('spinbutton').slice(0, 2).forEach(input => expect(input).toHaveAttribute('readonly'));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('rules.save') }));
    await screen.findByText(i18n.t('rules.saved'));
    expect(save.mock.calls[0]![0].rules[0]).toMatchObject({ status: false, value: 4 });
    expect(save.mock.calls[0]![0].rules[1]).toMatchObject({ status: false, value: 6 });
  });

  it('keeps disabled draft statuses after conflict until explicit reload', async () => {
    const save = vi.fn().mockRejectedValue({ status: 409, message: 'Conflict' });
    const current = { ...saved, version: 4, rules: saved.rules.map(rule => ({ ...rule, status: false })) };
    const reload = vi.fn().mockResolvedValue(current);
    render(<ClassRulesForm initial={saved} onSave={save} onReload={reload} />);
    fireEvent.click(toggle(0));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('rules.save') }));
    await screen.findByText(i18n.t('rules.conflict'));
    expect(toggle(0)).not.toBeChecked();
    expect(toggle(1)).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('rules.reload') }));
    await screen.findByText(i18n.t('rules.reloaded'));
    screen.getAllByRole('switch').forEach(input => expect(input).not.toBeChecked());
    expect(minMembers()).toHaveValue(4);
  });

  it('translates existing validation and save notices when switching language without losing values', async () => {
    const save = vi.fn(async (request: SaveClassRules) => ({ ...saved, rules: request.rules }));
    render(<ClassRulesForm initial={config} onSave={save} onReload={vi.fn()} />);
    fireEvent.change(minMembers(), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu quy định' }));
    await screen.findByText(i18n.t('rules.minGreaterThanMax'));
    await act(async () => { await i18n.changeLanguage('en'); });
    expect(screen.getByText(i18n.t('rules.minGreaterThanMax'))).toBeInTheDocument();
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(9);
    fireEvent.change(screen.getAllByRole('spinbutton')[0]!, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('rules.save') }));
    await screen.findByText(i18n.t('rules.saved'));
    await act(async () => { await i18n.changeLanguage('vi'); });
    expect(screen.getByText('Đã lưu quy định nhóm cho lớp.')).toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(1);
    expect(minMembers()).toHaveValue(3);
  });
  it('saves an SE minimum of zero to disable the requirement', async () => {
    const save = vi.fn(async (request: SaveClassRules) => ({ ...saved, rules: request.rules }));
    render(<ClassRulesForm initial={config} onSave={save} onReload={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Số sinh viên SE tối thiểu/), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu quy định' }));
    await screen.findByText('Đã lưu quy định nhóm cho lớp.');
    expect(save.mock.calls[0]![0].rules).toContainEqual({ code: 'MIN_SE_MEMBERS_PER_GROUP', value: 0, status: true });
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
    screen.getAllByRole('switch').forEach(input => expect(input).toBeDisabled());
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
    expect(request.rules[0]).toEqual({ code: 'MIN_MEMBERS_PER_GROUP', value: 3, status: true });
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
