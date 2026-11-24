import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, CheckCircle2, Cpu } from 'lucide-react';

const criteria = ['step1', 'step2', 'step3', 'step4', 'step5'] as const;

export interface AllocationThinkingProps {
  mode?: 'default' | 'regenerate';
  minDuration?: number;
}

export function AllocationThinking({ mode = 'default', minDuration }: AllocationThinkingProps) {
  const { t } = useTranslation();
  const [activeStep, setActiveStep] = useState(0);

  const isRegenerate = mode === 'regenerate';
  const stepInterval = isRegenerate
    ? Math.max(500, Math.floor((minDuration ?? 3000) / criteria.length))
    : 1100;

  useEffect(() => {
    const maxStep = isRegenerate ? criteria.length : criteria.length - 1;
    if (activeStep >= maxStep) return;

    const timer = setTimeout(() => {
      setActiveStep(step => step + 1);
    }, stepInterval);

    return () => clearTimeout(timer);
  }, [activeStep, isRegenerate, stepInterval]);

  return (
    <section
      className="allocation-thinking-card"
      role="status"
      aria-busy="true"
      aria-label={t('allocation.calculating')}
    >
      {/* Top AI Shimmer Aura Bar */}
      <div className="allocation-thinking-shimmer-bar" aria-hidden="true" />

      {/* Header */}
      <header className="allocation-thinking-header">
        <div className="allocation-thinking-badge-row">
          <span className="allocation-thinking-badge">
            <Sparkles size={14} className="allocation-thinking-sparkle" aria-hidden="true" />
            <span className="allocation-thinking-label">{t('allocation.thinking.analyzing')}</span>
          </span>
          <span className="allocation-thinking-model-tag" aria-hidden="true">
            <span className="allocation-thinking-pulse-dot" />
            <span>{t('allocation.thinking.aiBadge')}</span>
          </span>
        </div>
        <h3 className="allocation-thinking-title">{t('allocation.thinking.title')}</h3>
        <p className="allocation-thinking-subtitle">{t('allocation.thinking.subtitle')}</p>
      </header>

      {/* Reasoning Pipeline */}
      <div className="allocation-thinking-body">
        <ul className="allocation-thinking-lines" aria-live="off">
          {criteria.map((key, index) => {
            const isActive = index === activeStep;
            const isPast = index < activeStep;
            const isUpcoming = index > activeStep;

            return (
              <li
                key={key}
                className={`allocation-thinking-line ${isActive ? 'is-active' : isPast ? 'is-past' : 'is-upcoming'}`}
                aria-hidden={isUpcoming ? true : undefined}
              >
                <div className="allocation-thinking-step-indicator" aria-hidden="true">
                  {isPast ? (
                    <span className="allocation-thinking-check-icon">
                      <CheckCircle2 size={16} />
                    </span>
                  ) : isActive ? (
                    <span className="allocation-thinking-active-dot">
                      <span className="allocation-thinking-active-inner" />
                    </span>
                  ) : (
                    <span className="allocation-thinking-pending-dot" />
                  )}
                </div>

                <div className="allocation-thinking-step-content">
                  <span className="allocation-thinking-step-text">
                    {t(`allocation.thinking.${key}`)}
                  </span>
                  {(isActive || isPast) && (
                    <span className="allocation-thinking-reasoning-detail">
                      {t(`allocation.thinking.reasoning${index + 1}`)}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Telemetry Footer */}
      <footer className="allocation-thinking-footer" aria-hidden="true">
        <Cpu size={14} className="allocation-thinking-cpu-icon" />
        <span className="allocation-thinking-footer-text">
          {activeStep >= criteria.length
            ? t('allocation.thinking.footerComplete', 'Đã hoàn thành phân tích — Chuẩn bị hiển thị phương án...')
            : t('allocation.thinking.footerStatus')}
        </span>
      </footer>
    </section>
  );
}
