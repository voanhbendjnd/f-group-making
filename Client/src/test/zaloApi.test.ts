import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/services/api/client';
import { zaloApi } from '@/features/zalo/api/zaloApi';
vi.mock('@/services/api/client', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
describe('Zalo API contracts', () => {
  it('sends JSON as a multipart part and leaves the boundary to the browser', async () => {
    const file = new File(['image'], 'qr.png', { type: 'image/png' });
    await zaloApi.save({ scope: 'LECTURER', lecturerId: 3, termId: 8 }, { scope: 'LECTURER', title: 'Group', inviteUrl: 'https://zalo.me/g/abc', description: '', version: null, removeQr: false }, file);
    const call = vi.mocked(apiClient.put).mock.calls[0]!;
    expect(call[0]).toBe('/api/lecturers/3/zalo-share');
    expect(call[1]).toBeInstanceOf(FormData); const form = call[1] as FormData;
    expect((form.get('data') as Blob).type).toBe('application/json'); expect(form.get('qr')).toBeInstanceOf(File);
    expect(call[2]?.headers?.['Content-Type']).toBeUndefined(); expect(call[2]?.params).toEqual({ termId: 8 });
  });
  it('reads only the authenticated student endpoint and requests QR as a blob', async () => {
    await zaloApi.mine(); await zaloApi.qr(4);
    expect(apiClient.get).toHaveBeenCalledWith('/api/me/zalo-shares', { signal: undefined });
    expect(apiClient.get).toHaveBeenCalledWith('/api/zalo-shares/4/qr', { responseType: 'blob', signal: undefined });
  });
});
