import { useTranslation } from 'react-i18next';
import type { GroupDTO } from '../types/groupTypes';

export function StaffGroupRuleWarning({ group }: { group: GroupDTO }) {
  const { t } = useTranslation();
  if (group.allRulesPassed) return null;
  const failures = group.ruleEvaluations.filter(rule => !rule.passed);
  return (
    <div className="alert alert-warning" role="note" style={{ display: 'block', fontSize: '.8rem', padding: '.6rem', margin: '.5rem 0' }}>
      <p style={{ margin: 0 }}>{t('groupReview.ruleWarning')}</p>
      {failures.length > 0 && (
        <ul style={{ margin: '.4rem 0 0', paddingLeft: '1.2rem' }}>
          {failures.map(rule => (
            <li key={rule.code}>
              {t(`rules.codes.${rule.code}`)}: {rule.actualValue} / {rule.targetValue}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
