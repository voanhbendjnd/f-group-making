import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/services/api/client';
import { ruleApi } from '@/features/rules/api/ruleApi';
import { RULE_CODES } from '@/features/rules/types';

vi.mock('@/services/api/client', () => ({ apiClient: { get: vi.fn(), put: vi.fn() } }));
const response = () => ({ schoolClassId: 12, version: 1, configured: true, warnings: [],
  rules: RULE_CODES.map((code, index) => ({ code, status: true, value: [4, 6, 1, 50, 1, 6, 0][index]! })) });
beforeEach(() => vi.resetAllMocks());

describe('Rule API response contract', () => {
  it('preserves disabled status and value in read, request and save response', async () => {
    const body = response();
    body.rules[6]!.status = false;
    body.rules[6]!.value = 5;
    vi.mocked(apiClient.get).mockResolvedValue(body);
    vi.mocked(apiClient.put).mockResolvedValue(body);
    const data = await ruleApi.getRules(12);
    expect(data.rules[6]).toEqual({ code: 'MIN_SE_MEMBERS_PER_GROUP', value: 5, status: false });
    const request = { version: 1, rules: data.rules };
    expect((await ruleApi.saveRules(12, request)).rules[6]!.status).toBe(false);
    expect(apiClient.put).toHaveBeenCalledWith('/api/school-classes/12/rules', request);
  });

  it.each([undefined, null, 0, 1, 'true', 'false'])('rejects missing or invalid status %s from the server', async status => {
    const body = response();
    vi.mocked(apiClient.get).mockResolvedValue({ ...body, rules: body.rules.map(rule => ({ ...rule, status })) });
    vi.mocked(apiClient.put).mockResolvedValue({ ...body, rules: body.rules.map(rule => ({ ...rule, status })) });
    await expect(ruleApi.getRules(12)).rejects.toMatchObject({ outcomeUnknown: true });
    await expect(ruleApi.saveRules(12, { version: 0, rules: body.rules })).rejects.toMatchObject({ outcomeUnknown: true });
  });

  it('accepts an SE minimum of zero in both read and save responses', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(response());
    vi.mocked(apiClient.put).mockResolvedValue(response());
    expect((await ruleApi.getRules(12)).rules).toContainEqual({ code: 'MIN_SE_MEMBERS_PER_GROUP', value: 0, status: true });
    const request = { version: 0, rules: response().rules };
    expect((await ruleApi.saveRules(12, request)).rules).toContainEqual({ code: 'MIN_SE_MEMBERS_PER_GROUP', value: 0, status: true });
    expect(apiClient.put).toHaveBeenCalledWith('/api/school-classes/12/rules', request);
  });

  it.each([-1, 0.5, 1001, '0', null])('rejects an invalid SE value %s from the server', async value => {
    const body = response();
    vi.mocked(apiClient.get).mockResolvedValue({ ...body,
      rules: body.rules.map(rule => rule.code === 'MIN_SE_MEMBERS_PER_GROUP' ? { ...rule, value } : rule) });
    await expect(ruleApi.getRules(12)).rejects.toMatchObject({ status: 0, outcomeUnknown: true });
  });

  it('rejects zero in another rule and incomplete sets', async () => {
    const body = response(); body.rules[0]!.value = 0;
    vi.mocked(apiClient.get).mockResolvedValue(body);
    await expect(ruleApi.getRules(12)).rejects.toMatchObject({ outcomeUnknown: true });
    vi.mocked(apiClient.get).mockResolvedValue({ ...response(), rules: response().rules.slice(0, 6) });
    await expect(ruleApi.getRules(12)).rejects.toMatchObject({ outcomeUnknown: true });
  });
});
