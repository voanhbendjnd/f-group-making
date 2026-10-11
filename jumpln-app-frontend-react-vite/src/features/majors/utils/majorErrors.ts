import type { ApiError } from '@/services/api/types';

// Return a translation key so an open error also follows language changes.
export function getMajorErrorKey(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'errors.generalFailure';
  }

  const apiError = error as Partial<ApiError>;
  const key = apiError.errorKey?.replace(/^error\./, '');
  switch (key) {
    case 'codeexists':
      return 'majors.errors.codeExists';
    case 'nameexists':
      return 'majors.errors.nameExists';
    case 'majorcodeinuse':
      return 'majors.errors.codeInUse';
    case 'majorinuse':
      return 'majors.errors.inUse';
    case 'majornotfound':
      return 'majors.errors.notFound';
    case 'invalidcode':
      return 'majors.validation.codeLength';
    case 'invalidname':
      return 'majors.validation.nameLength';
  }

  if (apiError.status === 400) return 'majors.errors.invalidData';
  if (apiError.status === 401) return 'common.sessionExpired';
  if (apiError.status === 403) return 'errors.accessDenied';
  if (apiError.status === 404) return 'majors.errors.notFound';
  if (apiError.status === 409) return 'majors.errors.conflict';
  if (apiError.status && apiError.status >= 500) return 'errors.status500';
  return 'errors.generalFailure';
}
