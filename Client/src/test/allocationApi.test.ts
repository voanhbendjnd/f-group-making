import { afterEach, describe, expect, it } from 'vitest';
import { apiClient } from '@/services/api/client';
import { allocationApi } from '@/features/allocation/api/allocationApi';
import { applyFixture, overviewFixture, previewFixture, setupFixture } from './allocationFixtures';
import type { InternalAxiosRequestConfig } from 'axios';

const originalAdapter = apiClient.defaults.adapter;
afterEach(() => { apiClient.defaults.adapter = originalAdapter; });
describe('allocation actual Axios and Java DTO contracts', () => {
  it('uses the existing envelope interceptor, exact paths/params and minimal Apply payload', async () => {
    const requests: InternalAxiosRequestConfig[] = [];
    apiClient.defaults.adapter = async config => {
      requests.push(config);
      const result = config.url?.endsWith('/overview') ? overviewFixture : config.url?.endsWith('/setup') ? setupFixture
        : config.url?.endsWith('/preview') ? previewFixture() : config.url?.endsWith('/apply') || config.url?.endsWith('/9') ? applyFixture()
        : { meta: { page: 2, pageSize: 10, pages: 2, total: 11 }, result: [] };
      return { config, headers: {}, status: 200, statusText: 'OK', data: { statusCode: 200, message: 'ok', data: result } };
    };
    const signal = new AbortController().signal;
    expect(await allocationApi.overview(3, 2, signal)).toEqual(overviewFixture);
    expect(await allocationApi.setup(3, 2, signal)).toEqual(setupFixture);
    await allocationApi.preview(3, 2, { targetGroupCount: 2, seed: 17, previousPlanFingerprint: 'b'.repeat(64) }, signal);
    const result = await allocationApi.apply(3, 2, previewFixture().previewId!, 'stable-key');
    expect(result.runId).toBe(9);
    await allocationApi.history(3, 2, 2, signal); await allocationApi.historyDetail(3, 2, 9, signal);
    expect(requests.map(request => request.url)).toEqual(['overview', 'setup', 'preview', 'apply', 'history', 'history/9'].map(action => `/api/deadlines/3/classes/2/allocation/${action}`));
    expect(requests[0].signal).toBe(signal); expect(requests[2].signal).toBe(signal);
    expect(JSON.parse(requests[2].data)).toEqual({ targetGroupCount: 2, seed: 17, previousPlanFingerprint: 'b'.repeat(64) });
    expect(JSON.parse(requests[3].data)).toEqual({ previewId: result.previewId });
    expect(requests[3].headers.get('Idempotency-Key')).toBe('stable-key');
    expect(requests[4].params).toEqual({ page: 2, size: 10 });
    expect(JSON.parse(requests[3].data)).not.toHaveProperty('assignments'); expect(JSON.parse(requests[3].data)).not.toHaveProperty('leaderId');
  });
  it.each([null, {}, { ...applyFixture(), classId: 99 }, { ...applyFixture(), previewId: 'other' }])('keeps an unconfirmed 200 response as an unknown outcome %#', async data => {
    apiClient.defaults.adapter = async config => ({ config, headers: {}, status: 200, statusText: 'OK', data: { statusCode: 200, data } });
    await expect(allocationApi.apply(3, 2, previewFixture().previewId!, 'same-key')).rejects.toMatchObject({ outcomeUnknown: true });
  });
});
