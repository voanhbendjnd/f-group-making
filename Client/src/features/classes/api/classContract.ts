import i18n from '@/locales/i18n';
import type { SchoolClass, PaginatedSchoolClasses } from '../types';

function invalid(): never {
  throw { status: 0, message: i18n.t('lecturer.invalidResponse') };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseSchoolClass(value: unknown): SchoolClass {
  if (!isRecord(value) || !Number.isSafeInteger(value.id) || Number(value.id) <= 0
      || typeof value.name !== 'string' || !Number.isSafeInteger(value.studentCount)
      || Number(value.studentCount) < 0 || typeof value.createdDate !== 'string') return invalid();
  for (const field of ['termName', 'lecturerCode', 'lecturerName', 'lecturerEmail']) {
    if (value[field] !== null && typeof value[field] !== 'string') return invalid();
  }
  for (const field of ['termId', 'lecturerId']) {
    if (value[field] !== null && (!Number.isSafeInteger(value[field]) || Number(value[field]) <= 0)) return invalid();
  }
  return value as unknown as SchoolClass;
}

export function parseClassPage(value: unknown): PaginatedSchoolClasses {
  if (!isRecord(value) || !isRecord(value.meta) || !Array.isArray(value.result)) return invalid();
  const meta = value.meta;
  for (const field of ['page', 'pageSize', 'pages', 'total']) {
    if (!Number.isSafeInteger(meta[field]) || Number(meta[field]) < (field === 'page' || field === 'pageSize' ? 1 : 0)) return invalid();
  }
  return {
    meta: { page: Number(meta.page), pageSize: Number(meta.pageSize), pages: Number(meta.pages), total: Number(meta.total) },
    result: value.result.map(parseSchoolClass),
  };
}
