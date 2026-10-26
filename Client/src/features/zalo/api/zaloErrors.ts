import { getApiError } from '@/services/api/types';

export function zaloError(error: unknown, t: (key: string) => string): string {
  const api = getApiError(error);
  const code = api.errorKey?.replace(/^error\./, '');
  if (code && ['zaloInvalidLink', 'zaloInvalidScope', 'zaloInvalidData', 'zaloImageSize', 'zaloImageType',
    'zaloStorageUnavailable', 'zaloConflict', 'zaloNotFound', 'zaloForbidden'].includes(code)) return t(`zalo.errors.${code}`);
  if (api.status === 403 || api.status === 401) return t('zalo.errors.zaloForbidden');
  if (api.status === 409) return t('zalo.errors.zaloConflict');
  if (api.status === 413) return t('zalo.errors.zaloImageSize');
  if (api.status === 404) return t('zalo.errors.zaloNotFound');
  return t('zalo.failed');
}
