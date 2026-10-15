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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <Tag color="blue" icon={<Clock size={12} style={{ marginRight: 4 }} />}>Đang Mở (OPEN)</Tag>;
      case 'PENDING':
        return <Tag color="orange" icon={<Clock size={12} style={{ marginRight: 4 }} />}>Đang Chờ Duyệt (PENDING)</Tag>;
      case 'ACCEPTED':
        return <Tag color="green" icon={<ShieldCheck size={12} style={{ marginRight: 4 }} />}>Đã Phê Duyệt (ACCEPTED)</Tag>;
      case 'REVOKED':
        return <Tag color="red" icon={<AlertTriangle size={12} style={{ marginRight: 4 }} />}>Bị Thu Hồi (REVOKED)</Tag>;
      case 'DISBANDED':
        return <Tag color="default">Đã Giải Tán</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const isPending = group.status === 'PENDING';
  const isAccepted = group.status === 'ACCEPTED';
  const isOpen = group.status === 'OPEN';
  const canModify = isOpen && !isDeadlineExpired;

  return (
    <div
      style={{
        backgroundColor: 'var(--color-surface, #ffffff)',
        borderRadius: '16px',
        border: '1px solid var(--color-border, #e2e8f0)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
        padding: '1.75rem',
        marginBottom: '2rem',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
          borderBottom: '1px solid var(--color-border, #f1f5f9)',
          paddingBottom: '1.25rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
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
              Nhóm Của Bạn
            </span>
            {getStatusBadge(group.status)}
          </div>
          <h2 style={{ margin: 0, fontSize: '1.625rem', fontWeight: 800, color: 'var(--color-text-main, #0f172a)' }}>
            {group.name}
          </h2>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted, #64748b)', marginTop: '4px' }}>
            Trưởng nhóm: <strong style={{ color: 'var(--color-text-main)' }}>{group.leaderName}</strong>
          </div>
        </div>

        {/* Member count tag */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Số lượng thành viên</div>
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
              Nhóm bị Giảng viên từ chối phê duyệt
            </div>
            <div style={{ fontSize: '0.875rem', color: '#b91c1c', marginTop: '2px' }}>
              Lý do: {group.rejectReason}
            </div>
            <div style={{ fontSize: '0.8125rem', color: '#7f1d1d', marginTop: '4px' }}>
              Vui lòng điều chỉnh cơ cấu nhóm để đáp ứng yêu cầu và nộp lại trước hạn chót.
            </div>
          </div>
        </div>
      )}

      {/* Grid: Members list & Rules evaluation */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.5rem',
          marginBottom: '1.75rem',
        }}
      >
        {/* Members List */}
        <div>
          <h4 style={{ margin: '0 0 0.875rem', fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
            Danh sách thành viên ({group.members.length})
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
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                      }}
                    >
                      {member.fullName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                        MSSV: {member.rollNumber} • {member.memberCode}
                      </div>
                    </div>
                  </div>

                  <Tag color={member.majorCode === 'SE' ? 'geekblue' : 'purple'}>
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
            title="Đánh giá tiêu chuẩn của nhóm"
            subtitle="Toàn bộ quy tắc phải đạt trước khi Leader có thể Submit"
          />
        </div>
      </div>

      {/* Action Buttons Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          borderTop: '1px solid var(--color-border, #f1f5f9)',
          paddingTop: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Member Actions */}
          {canModify && !isLeader && (
            <Popconfirm
              title="Rời khỏi nhóm này?"
              description="Bạn có chắc chắn muốn rời nhóm hiện tại?"
              onConfirm={onLeave}
              okText="Đồng ý rời"
              cancelText="Hủy"
            >
              <Button danger icon={<UserMinus size={16} />}>
                Rời nhóm
              </Button>
            </Popconfirm>
          )}

          {/* Leader Disband when alone */}
          {canModify && isLeader && group.memberCount === 1 && (
            <Popconfirm
              title="Giải tán nhóm?"
              description="Nhóm chỉ còn một mình bạn. Bạn có muốn giải tán nhóm này không?"
              onConfirm={onDisband}
              okText="Giải tán"
              cancelText="Hủy"
            >
              <Button danger icon={<Trash2 size={16} />}>
                Giải tán nhóm
              </Button>
            </Popconfirm>
          )}

          {/* Leader Transfer Role */}
          {canModify && isLeader && group.memberCount > 1 && (
            <Button icon={<Share2 size={16} />} onClick={onOpenTransferModal}>
              Chuyển quyền Leader
            </Button>
          )}
        </div>

        {/* Submission Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isPending && isLeader && !isDeadlineExpired && (
            <Popconfirm
              title="Hủy nộp nhóm?"
              description="Bạn có chắc chắn muốn rút lại danh sách nhóm để tiếp tục chỉnh sửa?"
              onConfirm={onCancelSubmit}
              okText="Hủy nộp"
              cancelText="Đóng"
            >
              <Button icon={<RotateCcw size={16} />} loading={isSubmitting}>
                Hủy nộp (Cancel Submit)
              </Button>
            </Popconfirm>
          )}

          {isOpen && isLeader && !isDeadlineExpired && (
            <Tooltip
              title={
                !group.allRulesPassed
                  ? 'Nhóm chưa đạt đủ các điều kiện bắt buộc của lớp để có thể nộp.'
                  : 'Nộp danh sách nhóm lên Giảng viên phê duyệt'
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
                Nộp nhóm (Submit)
              </Button>
            </Tooltip>
          )}

          {isAccepted && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#16a34a', fontWeight: 600 }}>
              <CheckCircle size={18} />
              <span>Nhóm đã được Giảng viên phê duyệt chính thức</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
