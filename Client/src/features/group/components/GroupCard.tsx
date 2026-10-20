import { Crown, LogIn, Check, X, Undo, Sparkles } from 'lucide-react';
import { Button, Tag, Popconfirm } from 'antd';
import { useTranslation } from 'react-i18next';
import type { GroupDTO, GroupRecommendationDTO } from '../types/groupTypes';
import { StudentProfilePopover } from './StudentProfilePopover';

interface GroupCardProps {
  group: GroupDTO;
  canJoin: boolean;
  isMyGroup: boolean;
  isLecturer: boolean;
  canUnlock?: boolean;
  isDeadlineExpired: boolean;
  onJoin: (groupId: number) => void;
  onAccept?: (groupId: number) => void;
  onOpenRejectModal?: (groupId: number) => void;
  onRevoke?: (groupId: number) => void;
  isActionLoading?: boolean;
  recommendation?: GroupRecommendationDTO;
}

export const GroupCard: React.FC<GroupCardProps> = ({
  group,
  canJoin,
  isMyGroup,
  isLecturer,
  canUnlock = false,
  isDeadlineExpired,
  onJoin,
  onAccept,
  onOpenRejectModal,
  onRevoke,
  isActionLoading,
  recommendation,
}) => {
  const { t } = useTranslation();

  const isFull = group.memberCount >= group.maxMembers;
  const isOpen = group.status === 'OPEN' || group.status === 'REVOKED';
  const isPending = group.status === 'PENDING';
  const isAccepted = group.status === 'ACCEPTED';

  const getStatusBadge = () => {
    switch (group.status) {
      case 'OPEN':
        return (
          <Tag color="blue">
            {t('studentGroup.card.openStatus', { current: group.memberCount, max: group.maxMembers })}
          </Tag>
        );
      case 'PENDING':
        return <Tag color="orange">{t('studentGroup.card.pendingStatus')}</Tag>;
      case 'ACCEPTED':
        return <Tag color="green">{t('studentGroup.card.acceptedStatus')}</Tag>;
      case 'REVOKED':
        return <Tag color="red">{t('groupLifecycle.revoked')}</Tag>;
      default:
        return <Tag>{group.status}</Tag>;
    }
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--color-surface, #ffffff)',
        borderRadius: '12px',
        border: isMyGroup
          ? '2px solid var(--color-primary, #2563eb)'
          : '1px solid var(--color-border, #e2e8f0)',
        boxShadow: isMyGroup ? '0 4px 12px rgba(37,99,235,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'all 0.2s ease',
        minWidth: 0,
      }}
    >
      <div>
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text-main, #0f172a)', wordBreak: 'break-word' }}>
              {group.name}
            </h3>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted, #64748b)', marginTop: '2px' }}>
              {t('studentGroup.card.leader')} <strong style={{ color: 'var(--color-text-main)' }}>{group.leaderName}</strong>
            </div>
          </div>
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
            {recommendation && (
              <Tag
                color="green"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontWeight: 600,
                  margin: 0,
                  borderRadius: 12,
                }}
              >
                <Sparkles size={11} />
                {recommendation.matchScore}%
              </Tag>
            )}
            {getStatusBadge()}
          </div>
        </div>

        {/* Recommendation reason if available */}
        {recommendation && recommendation.matchReasons && recommendation.matchReasons.length > 0 && (
          <div
            style={{
              fontSize: '0.75rem',
              color: '#15803d',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              padding: '6px 10px',
              borderRadius: '6px',
              margin: '8px 0',
              lineHeight: 1.4,
            }}
          >
            ✨ {recommendation.matchReasons[0]}
          </div>
        )}

        {/* Member tags preview */}
        <div style={{ margin: '0.875rem 0', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {group.members.map((m) => (
            <StudentProfilePopover key={m.studentId} student={m} placement="top">
              <Tag style={{ borderRadius: '6px', fontSize: '0.75rem', padding: '2px 6px', cursor: 'pointer' }}>
                {m.role === 'LEADER' && <Crown size={12} color="#eab308" style={{ marginRight: 4, verticalAlign: -1 }} />}
                {m.fullName} ({m.majorCode || 'N/A'})
              </Tag>
            </StudentProfilePopover>
          ))}
        </div>
      </div>

      {/* Action footer */}
      <div
        style={{
          borderTop: '1px solid var(--color-border, #f1f5f9)',
          paddingTop: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
          {isFull ? (
            <span style={{ color: '#dc2626', fontWeight: 600 }}>
              {t('studentGroup.card.full', { max: group.maxMembers })}
            </span>
          ) : (
            <span>
              {t('studentGroup.card.spotsLeft', { count: group.maxMembers - group.memberCount })}
            </span>
          )}
        </div>

        {/* Student Join Button */}
        {!isLecturer && (
          <div>
            {isMyGroup ? (
              <Tag color="cyan">{t('studentGroup.card.yourGroupBadge')}</Tag>
            ) : (
              <Button
                type="primary"
                icon={<LogIn size={14} />}
                disabled={!canJoin || isFull || !isOpen || isDeadlineExpired}
                loading={isActionLoading}
                onClick={() => onJoin(group.id)}
              >
                {t('studentGroup.card.joinButton')}
              </Button>
            )}
          </div>
        )}

        {/* Lecturer Action Buttons */}
        {isLecturer && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {isPending && (
              <>
                <Button
                  type="primary"
                  size="small"
                  icon={<Check size={14} />}
                  style={{ backgroundColor: '#16a34a', borderColor: '#16a34a' }}
                  onClick={() => onAccept && onAccept(group.id)}
                >
                  {t('studentGroup.card.approveButton')}
                </Button>
                <Button
                  danger
                  size="small"
                  icon={<X size={14} />}
                  onClick={() => onOpenRejectModal && onOpenRejectModal(group.id)}
                >
                  {t('studentGroup.card.rejectButton')}
                </Button>
              </>
            )}

            {isAccepted && canUnlock && (
              <Popconfirm
                title={t('studentGroup.card.revokeConfirmTitle')}
                description={t('studentGroup.card.revokeConfirmDesc')}
                onConfirm={() => onRevoke && onRevoke(group.id)}
                okText={t('studentGroup.card.revokeConfirmOk')}
                cancelText={t('common.cancel')}
              >
                <Button size="small" icon={<Undo size={14} />}>
                  {t('studentGroup.card.revokeButton')}
                </Button>
              </Popconfirm>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

