import { Avatar, Collapse, Empty, Progress, Tag } from 'antd';
import { LockKeyhole, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { memo } from 'react';
import type { AllocationGroup, Reason, RuleView, Score } from '../types';

export function AllocationReasons({ reasons }: { reasons: Reason[] }) {
  const { t } = useTranslation();
  if (!reasons.length) return null;
  return <ul className="allocation-reasons">{reasons.map((reason, index) => <li key={`${reason.code}-${index}`}>
    {t(`allocation.reasons.${reason.code}`, { ...reason.parameters, defaultValue: t('allocation.reasons.other') })}
  </li>)}</ul>;
}
export function ScoreValue({ score }: { score: Score | null }) {
  const { t } = useTranslation();
  return <span>{score?.applicable && score.scorePercent !== null ? `${score.scorePercent}%` : t('allocation.notApplicable')}</span>;
}
export function AllocationRules({ rules }: { rules: RuleView[] }) {
  const { t } = useTranslation();
  return rules.length ? <ul className="allocation-rules">{rules.map(rule => <li key={rule.code} className={rule.passed ? 'is-passed' : 'is-warning'}>
    <span>{t(`studentGroup.rules.${rule.code}_${rule.passed ? 'passed' : 'failed'}`, { actual: rule.actualValue, target: rule.targetValue })}</span>
    <Tag color={rule.passed ? 'success' : 'warning'}>{t(rule.passed ? 'allocation.passed' : 'allocation.warning')}</Tag>
  </li>)}</ul> : <p className="allocation-muted">{t('allocation.noRules')}</p>;
}
export const AllocationGroups = memo(function AllocationGroups({ groups, proposed = false }: { groups: AllocationGroup[]; proposed?: boolean }) {
  const { t } = useTranslation();
  return <div className="allocation-groups">{groups.length ? groups.map(group => <article className={`allocation-group ${group.protectedGroup ? 'is-protected' : ''}`} key={group.groupId}>
    <div className="allocation-group-heading"><h3>{group.name}</h3><Tag color={group.status === 'ACCEPTED' ? 'success' : 'blue'}>{t(`groupReview.statuses.${group.status}`)}</Tag></div>
    <div className="allocation-tags">
      {group.protectedGroup ? <Tag icon={<LockKeyhole size={12} />}>{t('allocation.protected')}</Tag> : proposed && <Tag color="blue">{t('allocation.willApprove')}</Tag>}
      <Tag color={group.allRulesPassed ? 'success' : 'warning'}>{t(group.allRulesPassed ? 'allocation.passed' : 'allocation.warning')}</Tag>
    </div>
    <p className="allocation-muted">{t('allocation.leader')}: <strong>{group.leaderName || t('allocation.missing')}</strong></p>
    <div className="allocation-score"><span>{t('allocation.groupScore')}</span><strong><ScoreValue score={group.score} /></strong></div>
    {group.score.applicable && <Progress percent={group.score.scorePercent ?? 0} showInfo={false} size="small" strokeColor="var(--color-primary)" />}
    <Collapse ghost size="small" items={[
      { key: 'members', label: <span><Users size={14} aria-hidden="true" /> {t('allocation.members', { count: group.members.length })}</span>, children:
        <ul className="allocation-members">{group.members.map(member => <li key={member.studentId}>
          <Avatar size={30}>{member.fullName?.trim().slice(0, 1) || '?'}</Avatar>
          <div><strong>{member.fullName || t('allocation.missing')}</strong><small>{member.rollNumber || t('allocation.missing')} · {member.majorCode || member.majorName || t('allocation.missing')}</small></div>
          {member.role === 'LEADER' && <Tag>{t('allocation.leader')}</Tag>}
        </li>)}</ul> },
      { key: 'rules', label: t('allocation.rules'), children: <AllocationRules rules={group.rules} /> },
      { key: 'score', label: t('allocation.breakdown'), children: <>
        <p className="allocation-muted">{t('allocation.scoreHint')}</p>
        {group.score.breakdown.map(item => <div className="allocation-score-detail" key={item.code}>
          <strong>{t(`allocation.criteria.${item.code}`)}</strong>
          <span>{t('allocation.weight', { weight: item.effectiveWeightPercent.toFixed(1), value: item.fulfillmentPercent.toFixed(1) })}</span>
          <Progress percent={item.fulfillmentPercent} size="small" />
        </div>)}
      </> },
    ]} />
  </article>) : <Empty description={t('allocation.noGroups')} />}</div>;
});
