import { GitFork, Scale, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function AllocationThinking() {
  const { t } = useTranslation();
  const steps = [
    { text: t('allocation.thinking.step1'), icon: Users },
    { text: t('allocation.thinking.step2'), icon: ShieldCheck },
    { text: t('allocation.thinking.step3'), icon: GitFork },
    { text: t('allocation.thinking.step4'), icon: Scale },
    { text: t('allocation.thinking.step5'), icon: Sparkles }
  ];

  return (
    <div className="allocation-thinking-card" role="status" aria-busy="true" aria-label={t('allocation.calculating')}>
      <div className="allocation-thinking-shimmer" aria-hidden="true" />
      <div className="allocation-thinking-header">
        <div className="allocation-thinking-icon-glow">
          <Sparkles className="allocation-thinking-icon" size={24} aria-hidden="true" />
        </div>
        <div className="allocation-thinking-header-text">
          <div className="allocation-thinking-title-row">
            <h3>{t('allocation.thinking.title')}</h3>
            <span className="allocation-thinking-pulse-badge">
              <span className="allocation-thinking-pulse-dot" aria-hidden="true" />
              {t('allocation.thinking.analyzing')}
            </span>
          </div>
          <p className="allocation-thinking-subtitle">{t('allocation.thinking.subtitle')}</p>
        </div>
      </div>

      <p className="allocation-thinking-caption">{t('allocation.thinking.criteria')}</p>
      <ul className="allocation-thinking-steps">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li
              key={index}
              className="allocation-thinking-step"
            >
              <div className="allocation-thinking-step-icon">
                <Icon size={16} aria-hidden="true" />
              </div>
              <span className="allocation-thinking-step-text">{step.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
