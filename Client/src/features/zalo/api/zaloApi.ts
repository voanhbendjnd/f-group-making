import { apiClient } from '@/services/api/client';

export interface ZaloShare {
  id: number; classId: number | null; className: string | null;
  lecturerId: number | null; lecturerName: string | null; termId: number; termName: string;
  scope: 'LECTURER' | 'CLASS';
  title: string; inviteUrl: string; description: string | null; hasQr: boolean;
  version: number; updatedAt: string | null;
}
export type ZaloTarget = { scope: 'LECTURER'; lecturerId: number; termId: number }
  | { scope: 'CLASS'; classId: number; termId: number };
export interface ZaloWrite {
  scope: 'LECTURER' | 'CLASS'; title: string; inviteUrl: string;
  description: string; version: number | null; removeQr: boolean;
}

export function isZaloInvite(value: string): boolean {
  return /^https:\/\/zalo\.me\/g\/[a-z0-9]+\/?$/i.test(value.trim());
}

const root = (target: ZaloTarget) => target.scope === 'CLASS'
  ? `/api/school-classes/${target.classId}/zalo-shares` : `/api/lecturers/${target.lecturerId}/zalo-share`;
export const zaloApi = {
  management: (target: ZaloTarget, signal?: AbortSignal) => apiClient.get<unknown, ZaloShare | null>(root(target), { params: { termId: target.termId }, signal }),
  mine: (signal?: AbortSignal) => apiClient.get<unknown, ZaloShare[]>('/api/me/zalo-shares', { signal }),
  qr: (id: number, signal?: AbortSignal) => apiClient.get<unknown, Blob>(`/api/zalo-shares/${id}/qr`, { responseType: 'blob', signal }),
  save(target: ZaloTarget, data: ZaloWrite, qr: File | null): Promise<ZaloShare> {
    const form = new FormData();
    form.append('data', new Blob([JSON.stringify(data)], { type: 'application/json' }));
    if (qr) form.append('qr', qr);
    // Let the browser set the multipart boundary; the shared client defaults to JSON.
    return apiClient.put<unknown, ZaloShare>(root(target), form, { params: { termId: target.termId }, headers: { 'Content-Type': undefined } });
  },
  remove: (target: ZaloTarget, share: ZaloShare) => apiClient.delete(root(target) + `/${share.id}`, { params: { termId: target.termId, version: share.version } }),
};
