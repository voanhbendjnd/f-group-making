import { getApiError } from '@/services/api/types';
import type { PreliminaryRange } from './types';

export function validTarget(value: string, range?: PreliminaryRange): number | null {
  if (!range || !/^\d+$/.test(value)) return null;
  const target = Number(value);
  return Number.isSafeInteger(target) && target > 0 && target >= range.minimum && target <= range.maximum ? target : null;
}
export function allocationErrorKey(error: unknown): string {
  const value = getApiError(error);
  const code = value.errorKey?.replace(/^error\./, '');
  if (code?.startsWith('allocation') || code === 'invalidIdempotencyKey') return code;
  return value.outcomeUnknown || value.status >= 500 || !value.status ? 'unknown' : `http${value.status}`;
}
export function newSeed(previous?: number): number {
  const bytes = crypto.getRandomValues(new Uint32Array(2));
  const value = (bytes[0] & 0x1fffff) * 0x100000000 + bytes[1];
  return value === previous ? (value + 1) % Number.MAX_SAFE_INTEGER : value;
}
export function newRequestKey(): string {
  const native = crypto.randomUUID?.();
  if (native) return native;
  // Web Crypto getRandomValues also works on development LAN origins without randomUUID.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export interface ApplyAttempt { previewId: string; key: string; target: number }
export function readAttempt(storageKey: string): ApplyAttempt | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
    if (typeof value === 'object' && value !== null && 'previewId' in value && 'key' in value && 'target' in value
        && typeof value.previewId === 'string' && typeof value.key === 'string' && typeof value.target === 'number') return value as ApplyAttempt;
  } catch { /* Recovery still works in memory when browser storage is unavailable. */ }
  return null;
}
export function persistAttempt(storageKey: string, attempt: ApplyAttempt | null) {
  try { if (attempt) sessionStorage.setItem(storageKey, JSON.stringify(attempt)); else sessionStorage.removeItem(storageKey); }
  catch { /* Do not prevent an authorized Apply when storage is disabled. */ }
}
