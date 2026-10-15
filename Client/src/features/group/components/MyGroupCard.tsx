import React from 'react';
import {
  Crown,
  Send,
  RotateCcw,
  UserMinus,
  Trash2,
  Share2,
  AlertTriangle,
  CheckCircle,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { Button, Tag, Tooltip, Popconfirm } from 'antd';
import { useTranslation } from 'react-i18next';
import type { GroupDTO } from '../types/groupTypes';
import { RuleChecklistCard } from './RuleChecklistCard';

interface MyGroupCardProps {
  group: GroupDTO;
  isLeader: boolean;
  isDeadlineExpired: boolean;
  onSubmit: () => void;
  onCancelSubmit: () => void;
  onLeave: () => void;
  onDisband: () => void;
  onOpenTransferModal: () => void;
  isSubmitting?: boolean;
}

export const MyGroupCard: React.FC<MyGroupCardProps> = ({
  group,
  isLeader,
  isDeadlineExpired,
  onSubmit,
  onCancelSubmit,
  onLeave,
  onDisband,
  onOpenTransferModal,
  isSubmitting,
}) => {
  const { t } = useTranslation();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <Tag color="blue" icon={<Clock size={12} style={{ marginRight: 4 }} />}>{t('studentGroup.status.open')}</Tag>;
      case 'PENDING':
        return <Tag color="orange" icon={<Clock size={12} style={{ marginRight: 4 }} />}>{t('studentGroup.status.pending')}</Tag>;
      case 'ACCEPTED':
        return <Tag color="green" icon={<ShieldCheck size={12} style={{ marginRight: 4 }} />}>{t('studentGroup.status.accepted')}</Tag>;
      case 'REVOKED':
        return <Tag color="red" icon={<AlertTriangle size={12} style={{ marginRight: 4 }} />}>{t('studentGroup.status.revoked')}</Tag>;
      case 'DISBANDED':
        return <Tag color="default">{t('studentGroup.status.disbanded')}</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const isPending = group.status === 'PENDING';
  const isAccepted = group.status === 'ACCEPTED';
  const isOpen = group.status === 'OPEN';
  const canModify = isOpen && !isDeadlineExpired;

  return (
    <div className="my-group-container">
      {/* Header */}
      <div className="my-group-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: 'var(--color-primary, #2563eb)',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                padding: '2px 8px',
                borderRadius: '6px',
              }}
            >
              {t('studentGroup.myGroup.badge')}
            </span>
            {getStatusBadge(group.status)}
          </div>
          <h2 style={{ margin: 0, fontSize: '1.625rem', fontWeight: 800, color: 'var(--color-text-main, #0f172a)', wordBreak: 'break-word' }}>
            {group.name}
          </h2>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted, #64748b)', marginTop: '4px' }}>
            {t('studentGroup.myGroup.leader')} <strong style={{ color: 'var(--color-text-main)' }}>{group.leaderName}</strong>
          </div>
        </div>

        {/* Member count tag */}
        <div className="my-group-count-tag" style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            {t('studentGroup.myGroup.memberCountLabel')}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary, #2563eb)' }}>
            {group.memberCount} <span style={{ fontSize: '1rem', fontWeight: 500, color: '#94a3b8' }}>/ {group.maxMembers}</span>
          </div>
        </div>
      </div>

      {/* Rejection notice if present */}
      {group.rejectReason && isOpen && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '10px',
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <AlertTriangle size={20} color="#dc2626" style={{ marginTop: '2px', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#991b1b' }}>
              {t('studentGroup.myGroup.rejectedTitle')}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#b91c1c', marginTop: '2px' }}>
              {t('studentGroup.myGroup.rejectionReason', { reason: group.rejectReason })}
            </div>
            <div style={{ fontSize: '0.8125rem', color: '#7f1d1d', marginTop: '4px' }}>
              {t('studentGroup.myGroup.rejectionTip')}
            </div>
          </div>
        </div>
      )}

      {/* Grid: Members list & Rules evaluation */}
      <div className="my-group-members-grid">
        {/* Members List */}
        <div>
          <h4 style={{ margin: '0 0 0.875rem', fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
            {t('studentGroup.myGroup.membersListTitle', { count: group.members.length })}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {group.members.map((member) => {
              const isMemLeader = member.role === 'LEADER';
              return (
                <div
                  key={member.studentId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    backgroundColor: isMemLeader ? 'rgba(37, 99, 235, 0.04)' : '#f8fafc',
                    border: `1px solid ${isMemLeader ? 'rgba(37, 99, 235, 0.2)' : '#e2e8f0'}`,
                    gap: '8px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '50%',
                        backgroundColor: isMemLeader ? '#dbeafe' : '#e2e8f0',
                        color: isMemLeader ? '#1d4ed8' : '#475569',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.875rem',
                        flexShrink: 0,
                      }}
                    >
                      {member.fullName.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text-main)' }}>
                          {member.fullName}
                        </span>
                        {isMemLeader && (
                          <Tag color="gold" icon={<Crown size={12} style={{ marginRight: 3 }} />}>
                            Leader
                          </Tag>
                        )}
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                        {t('studentGroup.myGroup.studentCode')} {member.rollNumber} • {member.memberCode}
                      </div>
                    </div>
                  </div>

                  <Tag color={member.majorCode === 'SE' ? 'geekblue' : 'purple'} style={{ margin: 0 }}>
                    {member.majorCode || member.majorName || 'N/A'}
                  </Tag>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rule Evaluation Checklist */}
        <div>
          <RuleChecklistCard
            evaluations={group.ruleEvaluations}
            title={t('studentGroup.rules.title')}
            subtitle={t('studentGroup.rules.subtitle')}
          />
        </div>
      </div>

      {/* Action Buttons Bar */}
      <div className="my-group-actions">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Member Actions */}
          {canModify && !isLeader && (
            <Popconfirm
              title={t('studentGroup.myGroup.leaveConfirmTitle')}
              description={t('studentGroup.myGroup.leaveConfirmDesc')}
              onConfirm={onLeave}
              okText={t('studentGroup.myGroup.leaveConfirmOk')}
              cancelText={t('common.cancel')}
            >
              <Button danger icon={<UserMinus size={16} />}>
                {t('studentGroup.myGroup.leaveButton')}
              </Button>
            </Popconfirm>
          )}

          {/* Leader Disband when alone */}
          {canModify && isLeader && group.memberCount === 1 && (
            <Popconfirm
              title={t('studentGroup.myGroup.disbandConfirmTitle')}
              description={t('studentGroup.myGroup.disbandConfirmDesc')}
              onConfirm={onDisband}
              okText={t('studentGroup.myGroup.disbandConfirmOk')}
              cancelText={t('common.cancel')}
            >
              <Button danger icon={<Trash2 size={16} />}>
                {t('studentGroup.myGroup.disbandButton')}
              </Button>
            </Popconfirm>
          )}

          {/* Leader Transfer Role */}
          {canModify && isLeader && group.memberCount > 1 && (
            <Button icon={<Share2 size={16} />} onClick={onOpenTransferModal}>
              {t('studentGroup.myGroup.transferLeaderButton')}
            </Button>
          )}
        </div>

        {/* Submission Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {isPending && isLeader && !isDeadlineExpired && (
            <Popconfirm
              title={t('studentGroup.myGroup.cancelSubmitConfirmTitle')}
              description={t('studentGroup.myGroup.cancelSubmitConfirmDesc')}
              onConfirm={onCancelSubmit}
              okText={t('studentGroup.myGroup.cancelSubmitConfirmOk')}
              cancelText={t('common.close')}
            >
              <Button icon={<RotateCcw size={16} />} loading={isSubmitting}>
                {t('studentGroup.myGroup.cancelSubmitButton')}
              </Button>
            </Popconfirm>
          )}

          {isOpen && isLeader && !isDeadlineExpired && (
            <Tooltip
              title={
                !group.allRulesPassed
                  ? t('studentGroup.myGroup.tooltipNotReady')
                  : t('studentGroup.myGroup.tooltipSubmit')
              }
            >
              <Button
                type="primary"
                size="large"
                icon={<Send size={16} />}
                disabled={!group.allRulesPassed}
                loading={isSubmitting}
                onClick={onSubmit}
              >
                {t('studentGroup.myGroup.submitButton')}
              </Button>
            </Tooltip>
          )}

          {isAccepted && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#16a34a', fontWeight: 600 }}>
              <CheckCircle size={18} />
              <span>{t('studentGroup.myGroup.approvedNotice')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

