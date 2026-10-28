import React, { useState, useEffect } from 'react';
import { Modal, Input, Tag, Button, Empty, Skeleton, message, Tooltip, Alert } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, CheckCircle, AlertTriangle, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { groupApi } from '../api/groupApi';
import { StudentProfilePopover } from './StudentProfilePopover';
import type { StudentSearchForInviteDTO } from '../types/groupTypes';

interface InviteMemberModalProps {
  open: boolean;
  onClose: () => void;
  deadlineId: number;
  classId: number;
  groupId: number;
  groupName: string;
  currentMemberCount: number;
  maxMembers: number;
}

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({
  open,
  onClose,
  deadlineId,
  classId,
  groupId,
  groupName,
  currentMemberCount,
  maxMembers,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [invitingId, setInvitingId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchText.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [searchText]);

  const { data: searchResults = [], isLoading, refetch } = useQuery({
    queryKey: ['search-invitees', deadlineId, classId, groupId, debouncedQuery],
    queryFn: ({ signal }) => groupApi.searchStudentsForInvite(deadlineId, classId, groupId, debouncedQuery, signal),
    enabled: open && !!deadlineId && !!classId && !!groupId,
  });

  const sendInvitationMutation = useMutation({
    mutationFn: (studentId: number) => {
      setInvitingId(studentId);
      return groupApi.sendInvitation(deadlineId, classId, groupId, { studentId });
    },
    onSuccess: (data) => {
      message.success(t('studentGroup.invitation.sentSuccess', 'Đã gửi lời mời thành công tới {{name}}!', { name: data.studentName }));
      queryClient.invalidateQueries({ queryKey: ['search-invitees', deadlineId, classId, groupId] });
      queryClient.invalidateQueries({ queryKey: ['group-invitations', deadlineId, classId, groupId] });
      queryClient.invalidateQueries({ queryKey: ['recommended-students', deadlineId, classId, groupId] });
      refetch();
    },
    onError: (err: any) => {
      message.error(err.message || t('studentGroup.invitation.sentError', 'Không thể gửi lời mời'));
    },
    onSettled: () => setInvitingId(null),
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: (invitationId: number) => {
      setCancellingId(invitationId);
      return groupApi.cancelInvitation(deadlineId, classId, invitationId);
    },
    onSuccess: () => {
      message.info(t('studentGroup.invitation.cancelledSuccess', 'Đã hủy lời mời'));
      queryClient.invalidateQueries({ queryKey: ['search-invitees', deadlineId, classId, groupId] });
      queryClient.invalidateQueries({ queryKey: ['group-invitations', deadlineId, classId, groupId] });
      queryClient.invalidateQueries({ queryKey: ['recommended-students', deadlineId, classId, groupId] });
      refetch();
    },
    onError: (err: any) => {
      message.error(err.message || t('studentGroup.invitation.cancelledError', 'Không thể hủy lời mời'));
    },
    onSettled: () => setCancellingId(null),
  });

  const isGroupFull = currentMemberCount >= maxMembers;

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.125rem' }}>
          <UserPlus size={20} color="var(--color-primary, #2563eb)" />
          <span>{t('studentGroup.invitation.modalTitle', 'Mời thành viên vào nhóm')}</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      width="min(95vw, 680px)"
    >
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: '0.875rem', color: '#475569' }}>
            {t('studentGroup.invitation.groupLabel', 'Nhóm')}: <strong style={{ color: '#0f172a' }}>{groupName}</strong>
          </span>
          <span style={{ fontSize: '0.8125rem', color: isGroupFull ? '#ef4444' : '#16a34a', fontWeight: 600 }}>
            <Users size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            {currentMemberCount}/{maxMembers} {t('studentGroup.members', 'thành viên')}
          </span>
        </div>

        {isGroupFull && (
          <Alert
            message={t('studentGroup.invitation.groupFullWarning', 'Nhóm đã đạt số lượng thành viên tối đa ({{max}}). Không thể mời thêm.', { max: maxMembers })}
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
          />
        )}

        <Input
          prefix={<Search size={16} color="#94a3b8" style={{ marginRight: 4 }} />}
          placeholder={t('studentGroup.invitation.searchPlaceholder', 'Tìm theo email, mã số sinh viên hoặc họ tên...')}
          allowClear
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ borderRadius: 8, padding: '8px 12px' }}
        />
      </div>

      <div style={{ maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {isLoading ? (
          <div style={{ padding: '16px 0' }}>
            <Skeleton active avatar paragraph={{ rows: 2 }} />
            <Skeleton active avatar paragraph={{ rows: 2 }} style={{ marginTop: 12 }} />
          </div>
        ) : searchResults.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                {debouncedQuery
                  ? t('studentGroup.invitation.noSearchResults', 'Không tìm thấy sinh viên nào phù hợp với từ khóa "{{query}}"', { query: debouncedQuery })
                  : t('studentGroup.invitation.emptyClass', 'Không có sinh viên trong lớp học này')}
              </span>
            }
          />
        ) : (
          searchResults.map((student: StudentSearchForInviteDTO) => {
            const isInviting = invitingId === student.studentId;
            const isCancelling = cancellingId === student.pendingInvitationId;

            return (
              <div
                key={student.studentId}
                className="invite-student-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  transition: 'border-color 0.2s',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <StudentProfilePopover
                  student={{
                    studentId: student.studentId,
                    fullName: student.fullName,
                    rollNumber: student.rollNumber,
                    memberCode: student.memberCode,
                    email: student.email,
                    majorCode: student.majorCode,
                    majorName: student.majorName,
                    role: 'MEMBER',
                    selfDescription: student.selfDescription,
                  }}
                  placement="top"
                >
                  <div className="invite-student-info" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1, minWidth: 200 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        backgroundColor: 'var(--color-primary, #2563eb)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        flexShrink: 0,
                      }}
                    >
                      {student.fullName ? student.fullName.charAt(0).toUpperCase() : 'S'}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0f172a' }}>
                          {student.fullName}
                        </span>
                        <Tag
                          color={student.majorCode === 'SE' ? 'geekblue' : 'purple'}
                          style={{ margin: 0, fontSize: '0.7rem', padding: '0 4px', lineHeight: '18px' }}
                        >
                          {student.majorCode || 'N/A'}
                        </Tag>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                        {student.email} • {student.rollNumber}
                      </div>
                    </div>
                  </div>
                </StudentProfilePopover>

                <div className="invite-student-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {/* Status tag */}
                  {student.hasGroup ? (
                    <Tag color="default" style={{ margin: 0, fontSize: '0.75rem', padding: '3px 8px' }}>
                      {t('studentGroup.invitation.hasGroupStatus', 'Đã có nhóm: {{name}}', {
                        name: student.currentGroupName || `#${student.currentGroupId}`,
                      })}
                    </Tag>
                  ) : student.hasPendingInvitation ? (
                    <Tag color="gold" style={{ margin: 0, fontSize: '0.75rem', padding: '3px 8px' }}>
                      {t('studentGroup.invitation.pendingStatus', 'Đã gửi lời mời (Chờ duyệt)')}
                    </Tag>
                  ) : !student.canInvite ? (
                    <Tooltip title={student.ruleViolationReason || t('studentGroup.invitation.cannotInvite', 'Không thể mời')}>
                      <Tag
                        color="error"
                        icon={<AlertTriangle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />}
                        style={{ margin: 0, fontSize: '0.75rem', padding: '3px 8px', cursor: 'help' }}
                      >
                        {student.ruleViolationReason
                          ? (student.ruleViolationReason.length > 25 ? student.ruleViolationReason.slice(0, 25) + '...' : student.ruleViolationReason)
                          : t('studentGroup.invitation.ruleViolated', 'Dính rule')}
                      </Tag>
                    </Tooltip>
                  ) : (
                    <Tag
                      color="success"
                      icon={<CheckCircle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />}
                      style={{ margin: 0, fontSize: '0.75rem', padding: '3px 8px' }}
                    >
                      {t('studentGroup.invitation.eligibleStatus', 'Chưa có nhóm (Hợp lệ)')}
                    </Tag>
                  )}

                  {/* Actions */}
                  {student.hasPendingInvitation && student.pendingInvitationId ? (
                    <Button
                      size="small"
                      danger
                      onClick={() => cancelInvitationMutation.mutate(student.pendingInvitationId!)}
                      loading={isCancelling}
                    >
                      {t('studentGroup.invitation.cancelInviteBtn', 'Hủy mời')}
                    </Button>
                  ) : (
                    <Tooltip
                      title={
                        isGroupFull
                          ? t('studentGroup.invitation.groupFullTooltip', 'Nhóm đã đủ thành viên')
                          : !student.canInvite
                          ? (student.ruleViolationReason || t('studentGroup.invitation.ruleViolatedDesc', 'Không thể mời do dính quy định lớp'))
                          : undefined
                      }
                    >
                      <Button
                        size="small"
                        type="primary"
                        icon={<UserPlus size={14} />}
                        disabled={isGroupFull || !student.canInvite || student.hasGroup}
                        loading={isInviting}
                        onClick={() => sendInvitationMutation.mutate(student.studentId)}
                      >
                        {t('studentGroup.invitation.sendInviteBtn', 'Mời')}
                      </Button>
                    </Tooltip>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>
          {t('common.close', 'Đóng')}
        </Button>
      </div>
    </Modal>
  );
};
