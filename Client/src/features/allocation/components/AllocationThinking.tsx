import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

const criteria = ['step1', 'step2', 'step3', 'step4', 'step5'] as const;

export function AllocationThinking() {
  const { t } = useTranslation();
  const captionId = useId();
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (activeStep === criteria.length - 1) return;
    // Presentation only: the API does not report individual processing stages.
    // The parent unmounts this panel as soon as the request settles.
    const timer = setTimeout(() => setActiveStep(step => step + 1), 1100);
    return () => clearTimeout(timer);
  }, [activeStep]);

  return (
    <section className="allocation-thinking-card" role="status" aria-busy="true"
      aria-label={t('allocation.calculating')} aria-describedby={captionId}>
      <header className="allocation-thinking-header">
        <span className="allocation-thinking-label">{t('allocation.thinking.analyzing')}</span>
        <h3 className="allocation-thinking-title">{t('allocation.thinking.title')}</h3>
        <p className="allocation-thinking-subtitle">{t('allocation.thinking.subtitle')}</p>
      </header>
      <p className="allocation-thinking-caption" id={captionId}>{t('allocation.thinking.criteria')}</p>
      <ul className="allocation-thinking-lines" aria-live="off">
        {criteria.map((key, index) => (
          <li key={key} className={`allocation-thinking-line ${index === activeStep ? 'is-active' : index < activeStep ? 'is-past' : 'is-upcoming'}`}
            aria-hidden={index > activeStep ? true : undefined}>
            {t(`allocation.thinking.${key}`)}
          </li>
        ))}
      </ul>
    </section>
  );
}
