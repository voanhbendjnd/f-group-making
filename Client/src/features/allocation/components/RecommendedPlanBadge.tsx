import { Button, Popover } from 'antd';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PlanRecommendation } from '../types';

export function RecommendedPlanBadge({ recommendation }: { recommendation: PlanRecommendation }) {
  const { t } = useTranslation();
  const metrics = recommendation.metrics;
  return <Popover trigger={['hover', 'focus', 'click']} placement="bottom" title={t('allocation.recommendation.why')}
    content={<div className="allocation-recommendation-reasons">
      <p>{t('allocation.recommendation.scope', { count: recommendation.eligiblePlans })}</p>
      <ul>{recommendation.reasons.map(reason => <li key={reason.code}>
        {t(`allocation.recommendation.reasons.${reason.code}`, { ...reason.parameters,
          distribution: metrics?.sizeDistribution.map(bucket => t('allocation.recommendation.sizeBucket', bucket)).join(', ') })}
      </li>)}</ul>
      <p className="allocation-muted">{t('allocation.recommendation.limit')}</p>
    </div>}>
    <Button type="link" size="small" className="allocation-recommended-badge" icon={<Sparkles size={13} aria-hidden="true" />}
      aria-label={t('allocation.recommendation.why')}>{t('allocation.recommendation.badge')}</Button>
  </Popover>;
}
