import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import type { GroupRuleEvaluationDTO } from '../types/groupTypes';

interface RuleChecklistCardProps {
  evaluations: GroupRuleEvaluationDTO[];
  title?: string;
  subtitle?: string;
}

export const RuleChecklistCard: React.FC<RuleChecklistCardProps> = ({
  evaluations,
  title,
  subtitle,
}) => {
  const { t } = useTranslation();

  if (!evaluations || evaluations.length === 0) {
    return null;
  }

  const allPassed = evaluations.every((e) => e.passed);

  const getRuleMessage = (evalItem: GroupRuleEvaluationDTO) => {
    if (evalItem.code) {
      const key = `studentGroup.rules.${evalItem.code}_${evalItem.passed ? 'passed' : 'failed'}`;
      const translated = t(key, { actual: evalItem.actualValue, target: evalItem.targetValue });
      if (translated && translated !== key) {
        return translated;
      }
    }
    return evalItem.message;
  };

  return (
    <div
      className="rule-checklist-card"
      style={{
        backgroundColor: 'var(--color-surface, #ffffff)',
        borderRadius: '12px',
        border: '1px solid var(--color-border, #e2e8f0)',
        padding: '1.25rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div
        className="rule-checklist-header"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '1rem',
        }}
      >
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-main, #0f172a)' }}>
            {title || t('studentGroup.rules.title', t('groupFormation.rules.title', 'Quy tắc chia nhóm của lớp'))}
          </h4>
          {subtitle && (
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-muted, #64748b)' }}>
              {subtitle}
            </p>
          )}
        </div>
        <span
          className="rule-checklist-status-badge"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.75rem',
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: '20px',
            backgroundColor: allPassed ? '#dcfce7' : '#fee2e2',
            color: allPassed ? '#15803d' : '#b91c1c',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {allPassed ? <ShieldCheck size={14} /> : <AlertCircle size={14} />}
          {allPassed
            ? t('studentGroup.rules.allMet', t('groupFormation.rules.allMet', 'Đủ điều kiện nộp'))
            : t('studentGroup.rules.notMet', t('groupFormation.rules.notMet', 'Chưa đạt yêu cầu'))}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        {evaluations.map((evalItem) => {
          const isHard = evalItem.hardRule;
          return (
            <div
              key={evalItem.code}
              className="rule-checklist-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.625rem 0.875rem',
                borderRadius: '8px',
                gap: '8px',
                backgroundColor: evalItem.passed
                  ? '#f8fafc'
                  : isHard
                  ? '#fef2f2'
                  : '#fffbeb',
                border: `1px solid ${
                  evalItem.passed ? '#f1f5f9' : isHard ? '#fecaca' : '#fde68a'
                }`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flex: 1, minWidth: 0 }}>
                <span style={{ marginTop: '2px', flexShrink: 0 }}>
                  {evalItem.passed ? (
                    <CheckCircle2 size={16} color="#16a34a" />
                  ) : (
                    <AlertCircle size={16} color={isHard ? '#dc2626' : '#d97706'} />
                  )}
                </span>
                <span
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    lineHeight: 1.4,
                    wordBreak: 'break-word',
                    color: evalItem.passed
                      ? 'var(--color-text-main, #1e293b)'
                      : isHard
                      ? '#991b1b'
                      : '#92400e',
                  }}
                >
                  {getRuleMessage(evalItem)}
                </span>
              </div>

              <div
                className="rule-checklist-badge-group"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: isHard ? '#fecaca' : '#fed7aa',
                    color: isHard ? '#991b1b' : '#9a3412',
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                  }}
                >
                  {isHard ? 'HARD' : 'SOFT'}
                </span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-text-muted, #64748b)',
                    fontWeight: 600,
                  }}
                >
                  {evalItem.actualValue}/{evalItem.targetValue}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
