export const RULE_CODES = [
  'MIN_MEMBERS_PER_GROUP', 'MAX_MEMBERS_PER_GROUP',
  'MIN_GROUPS_PER_CLASS', 'MAX_GROUPS_PER_CLASS',
  'MIN_MAJORS_PER_GROUP', 'MAX_MAJORS_PER_GROUP',
  'MIN_SE_MEMBERS_PER_GROUP',
] as const;

export type RuleCode = typeof RULE_CODES[number];
export type RuleValues = Record<RuleCode, number>;

export function getRuleMinimum(code: RuleCode): number {
  return code === 'MIN_SE_MEMBERS_PER_GROUP' ? 0 : 1;
}

export interface GroupingRule { code: RuleCode; value: number }

export interface ClassRules {
  schoolClassId: number;
  version: number;
  configured: boolean;
  rules: GroupingRule[];
  warnings: string[];
}

export interface SaveClassRules { version: number; rules: GroupingRule[] }
