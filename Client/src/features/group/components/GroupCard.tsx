import React from 'react';
import { Crown, LogIn, Check, X, Undo } from 'lucide-react';
import { Button, Tag, Popconfirm } from 'antd';
import type { GroupDTO } from '../types/groupTypes';

interface GroupCardProps {
  group: GroupDTO;
  canJoin: boolean;
  isMyGroup: boolean;
  isLecturer: boolean;
  isDeadlineExpired: boolean;
  onJoin: (groupId: number) => void;
  onAccept?: (groupId: number) => void;
  onOpenRejectModal?: (groupId: number) => void;
  onRevoke?: (groupId: number) => void;
  isActionLoading?: boolean;
}

export const GroupCard: React.FC<GroupCardProps> = ({
  group,
  canJoin,
  isMyGroup,
  isLecturer,
  isDeadlineExpired,
  onJoin,
  onAccept,
  onOpenRejectModal,
  onRevoke,
  isActionLoading,
}) => {

  const isFull = group.memberCount >= group.maxMembers;
  const isOpen = group.status === 'OPEN';
  const isPending = group.status === 'PENDING';
  const isAccepted = group.status === 'ACCEPTED';

  const getStatusBadge = () => {
    switch (group.status) {
      case 'OPEN':
        return <Tag color="blue">Đang Mở ({group.memberCount}/{group.maxMembers})</Tag>;
      case 'PENDING':
        return <Tag color="orange">Chờ Duyệt</Tag>;
      case 'ACCEPTED':
        return <Tag color="green">Đã Duyệt</Tag>;
      case 'REVOKED':
        return <Tag color="red">Thu Hồi</Tag>;
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
      }}
    >
      <div>
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text-main, #0f172a)' }}>
              {group.name}
            </h3>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted, #64748b)', marginTop: '2px' }}>
              Trưởng nhóm: <strong style={{ color: 'var(--color-text-main)' }}>{group.leaderName}</strong>
            </div>
          </div>
          {getStatusBadge()}
        </div>

        {/* Member tags preview */}
        <div style={{ margin: '0.875rem 0', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {group.members.map((m) => (
            <Tag key={m.studentId} style={{ borderRadius: '6px', fontSize: '0.75rem', padding: '2px 6px' }}>
              {m.role === 'LEADER' && <Crown size={12} color="#eab308" style={{ marginRight: 4, verticalAlign: -1 }} />}
              {m.fullName} ({m.majorCode || 'N/A'})
            </Tag>
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
            <span style={{ color: '#dc2626', fontWeight: 600 }}>Đã đủ người ({group.maxMembers})</span>
          ) : (
            <span>Còn trống <strong>{group.maxMembers - group.memberCount}</strong> chỗ</span>
          )}
        </div>

        {/* Student Join Button */}
        {!isLecturer && (
          <div>
            {isMyGroup ? (
              <Tag color="cyan">Nhóm của bạn</Tag>
            ) : (
              <Button
                type="primary"
                icon={<LogIn size={14} />}
                disabled={!canJoin || isFull || !isOpen || isDeadlineExpired}
                loading={isActionLoading}
                onClick={() => onJoin(group.id)}
              >
                Tham gia
              </Button>
            )}
          </div>
        )}

        {/* Lecturer Action Buttons */}
        {isLecturer && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isPending && (
              <>
                <Button
                  type="primary"
                  size="small"
                  icon={<Check size={14} />}
                  style={{ backgroundColor: '#16a34a', borderColor: '#16a34a' }}
                  onClick={() => onAccept && onAccept(group.id)}
                >
                  Duyệt
                </Button>
                <Button
                  danger
                  size="small"
                  icon={<X size={14} />}
                  onClick={() => onOpenRejectModal && onOpenRejectModal(group.id)}
                >
                  Từ chối
                </Button>
              </>
            )}

            {isAccepted && (
              <Popconfirm
                title="Thu hồi phê duyệt nhóm?"
                description="Nhóm sẽ chuyển sang trạng thái REVOKED. Bạn có chắc muốn thu hồi không?"
                onConfirm={() => onRevoke && onRevoke(group.id)}
                okText="Thu hồi"
                cancelText="Hủy"
              >
                <Button size="small" icon={<Undo size={14} />}>
                  Thu hồi duyệt
                </Button>
              </Popconfirm>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
