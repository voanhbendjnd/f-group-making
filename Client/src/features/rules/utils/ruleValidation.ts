import type { RuleCode, RuleFormValues } from '../types';

export function validateRuleValues(values: RuleFormValues): Partial<Record<RuleCode, string>> {
  const errors: Partial<Record<RuleCode, string>> = {};
  const pairs: [RuleCode, RuleCode][] = [
    ['MIN_MEMBERS_PER_GROUP', 'MAX_MEMBERS_PER_GROUP'],
    ['MIN_GROUPS_PER_CLASS', 'MAX_GROUPS_PER_CLASS'],
    ['MIN_MAJORS_PER_GROUP', 'MAX_MAJORS_PER_GROUP'],
  ];
  for (const [min, max] of pairs) {
    if (values.statuses[min] && values.statuses[max] && values[min] > values[max]) errors[min] = 'rules.minGreaterThanMax';
  }
  const minMajors = values.statuses.MIN_MAJORS_PER_GROUP ? values.MIN_MAJORS_PER_GROUP : 0;
  if (values.statuses.MAX_MEMBERS_PER_GROUP && minMajors > values.MAX_MEMBERS_PER_GROUP) {
    errors.MIN_MAJORS_PER_GROUP = 'rules.majorsExceedMembers';
  }
  if (values.statuses.MIN_SE_MEMBERS_PER_GROUP && values.statuses.MAX_MEMBERS_PER_GROUP
      && values.MIN_SE_MEMBERS_PER_GROUP > 0
      && values.MIN_SE_MEMBERS_PER_GROUP + Math.max(minMajors - 1, 0) > values.MAX_MEMBERS_PER_GROUP) {
    errors.MIN_SE_MEMBERS_PER_GROUP = 'rules.seExceedMembers';
  }
  return errors;
}
