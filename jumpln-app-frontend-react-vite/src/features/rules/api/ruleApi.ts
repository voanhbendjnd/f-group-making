import i18n from '@/locales/i18n';
import { apiClient } from '@/services/api/client';
import { RULE_CODES, getRuleMinimum, type ClassRules, type RuleCode, type SaveClassRules } from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseRules(value: unknown, classId: number): ClassRules {
  const invalid = () => {
    throw { status: 0, message: i18n.t('rules.invalidResponse'), outcomeUnknown: true };
  };
  if (!isRecord(value) || value.schoolClassId !== classId || !Number.isSafeInteger(value.version)
      || Number(value.version) < 0 || typeof value.configured !== 'boolean'
      || !Array.isArray(value.rules) || !Array.isArray(value.warnings)) return invalid();
  const rules = value.rules.map(item => {
    if (!isRecord(item) || !RULE_CODES.includes(item.code as RuleCode)
        || !Number.isInteger(item.value) || Number(item.value) < getRuleMinimum(item.code as RuleCode)
        || Number(item.value) > 1000 || typeof item.status !== 'boolean') return invalid();
    return { code: item.code as RuleCode, value: Number(item.value), status: item.status };
  });
  if (rules.length !== RULE_CODES.length || new Set(rules.map(rule => rule.code)).size !== RULE_CODES.length
      || !value.warnings.every(item => typeof item === 'string')) return invalid();
  return {
    schoolClassId: classId, version: Number(value.version), configured: value.configured,
    rules, warnings: value.warnings as string[],
  };
}

export const ruleApi = {
  async getRules(classId: number, signal?: AbortSignal): Promise<ClassRules> {
    const value = await apiClient.get<unknown, unknown>(`/api/school-classes/${classId}/rules`, { signal });
    return parseRules(value, classId);
  },
  async saveRules(classId: number, request: SaveClassRules): Promise<ClassRules> {
    const value = await apiClient.put<unknown, unknown>(`/api/school-classes/${classId}/rules`, request);
    return parseRules(value, classId);
  },
};
