import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag, Button, Empty, Skeleton, message, Tooltip } from 'antd';
import { Sparkles, Mail, Check, UserPlus, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { groupApi } from '../api/groupApi';
import { StudentProfilePopover } from './StudentProfilePopover';
import type { GroupMemberDTO, GroupInvitationDTO } from '../types/groupTypes';

interface RecommendedStudentsSectionProps {
  deadlineId: number;
  classId: number;
  groupId: number;
  currentMemberCount: number;
  maxMembers: number;
}

export const RecommendedStudentsSection: React.FC<RecommendedStudentsSectionProps> = ({
  deadlineId,
  classId,
  groupId,
  currentMemberCount,
  maxMembers,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = React.useState<number | null>(null);
  const [invitingId, setInvitingId] = React.useState<number | null>(null);

  const { data: candidates, isLoading, error } = useQuery({
    queryKey: ['recommended-students', deadlineId, classId, groupId],
    queryFn: ({ signal }) => groupApi.getRecommendedStudents(deadlineId, classId, groupId, signal),
    enabled: !!deadlineId && !!classId && !!groupId && currentMemberCount < maxMembers,
  });

  const { data: invitations = [] } = useQuery({
    queryKey: ['group-invitations', deadlineId, classId, groupId],
    queryFn: ({ signal }) => groupApi.getGroupInvitations(deadlineId, classId, groupId, signal),
    enabled: !!deadlineId && !!classId && !!groupId,
  });

  const pendingInvitationsMap = React.useMemo(() => {
    const map = new Map<number, GroupInvitationDTO>();
    invitations.forEach((inv) => {
      if (inv.status === 'PENDING') {
        map.set(inv.studentId, inv);
      }
    });
    return map;
  }, [invitations]);

  const sendInvitationMutation = useMutation({
    mutationFn: (studentId: number) => {
      setInvitingId(studentId);
      return groupApi.sendInvitation(deadlineId, classId, groupId, { studentId });
    },
    onSuccess: (data) => {
      message.success(t('studentGroup.invitation.sentSuccess', 'Đã gửi lời mời thành công tới {{name}}!', { name: data.studentName }));
      queryClient.invalidateQueries({ queryKey: ['group-invitations', deadlineId, classId, groupId] });
      queryClient.invalidateQueries({ queryKey: ['recommended-students', deadlineId, classId, groupId] });
      queryClient.invalidateQueries({ queryKey: ['search-invitees', deadlineId, classId, groupId] });
    },
    onError: (err: any) => {
      message.error(err.message || t('studentGroup.invitation.sentError', 'Không thể gửi lời mời'));
    },
    onSettled: () => setInvitingId(null),
  });

  if (currentMemberCount >= maxMembers) {
    return null; // Group is already full
  }

  const handleCopyEmail = (student: GroupMemberDTO) => {
    if (!student.email) return;
    navigator.clipboard.writeText(student.email);
    setCopiedId(student.studentId);
    message.success(t('studentGroup.recommendation.copiedEmail', 'Đã sao chép email của {{name}}', { name: student.fullName }));
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div
      style={{
        marginTop: 16,
        padding: '14px 16px',
        backgroundColor: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              backgroundColor: '#dcfce7',
              color: '#16a34a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={14} />
          </div>
          <div>
            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0f172a' }}>
              {t('studentGroup.recommendation.sectionTitle', 'Gợi ý thành viên phù hợp')}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: 8 }}>
              {t('studentGroup.recommendation.neededSlots', '(Cần thêm {{count}} thành viên)', {
                count: maxMembers - currentMemberCount,
              })}
            </span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : error ? (
        <div style={{ fontSize: '0.8rem', color: '#ef4444' }}>
          {t('studentGroup.recommendation.loadError', 'Không thể tải danh sách gợi ý')}
        </div>
      ) : !candidates || candidates.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              {t('studentGroup.recommendation.noCandidates', 'Hiện không còn sinh viên nào chưa có nhóm')}
            </span>
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {candidates.slice(0, 5).map((candidate) => (
            <div
              key={candidate.studentId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                transition: 'all 0.2s ease',
              }}
            >
              <StudentProfilePopover student={candidate} placement="top">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-primary, #2563eb)',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 600,
                      fontSize: '0.8125rem',
                      flexShrink: 0,
                    }}
                  >
                    {candidate.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#0f172a' }}>
                      {candidate.fullName}
                      <Tag
                        color={candidate.majorCode === 'SE' ? 'geekblue' : 'purple'}
                        style={{ marginLeft: 6, fontSize: '0.7rem', padding: '0 4px', lineHeight: '18px' }}
                      >
                        {candidate.majorCode || 'N/A'}
                      </Tag>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      {candidate.rollNumber} • {candidate.memberCode}
                    </div>
                  </div>
                </div>
              </StudentProfilePopover>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {typeof candidate.matchScore === 'number' && (
                  <Tag
                    color="green"
                    style={{
                      margin: 0,
                      fontWeight: 600,
                      fontSize: '0.72rem',
                      borderRadius: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                    }}
                  >
                    <Sparkles size={11} />
                    {candidate.matchScore}%
                  </Tag>
                )}

                {candidate.email && (
                  <Tooltip title={t('studentGroup.recommendation.copyEmailTooltip', 'Sao chép email liên hệ')}>
                    <Button
                      size="small"
                      type="text"
                      icon={copiedId === candidate.studentId ? <Check size={14} color="#16a34a" /> : <Mail size={14} />}
                      onClick={() => handleCopyEmail(candidate)}
                    />
                  </Tooltip>
                )}

                {pendingInvitationsMap.has(candidate.studentId) ? (
                  <Tag
                    color="gold"
                    style={{
                      margin: 0,
                      fontSize: '0.75rem',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 8px',
                    }}
                  >
                    <Clock size={12} />
                    {t('studentGroup.invitation.pendingStatusShort', 'Đã mời')}
                  </Tag>
                ) : (
                  <Button
                    size="small"
                    type="primary"
                    icon={<UserPlus size={13} />}
                    loading={invitingId === candidate.studentId}
                    disabled={currentMemberCount >= maxMembers}
                    onClick={() => sendInvitationMutation.mutate(candidate.studentId)}
                    style={{ fontSize: '0.75rem', height: 26, padding: '0 8px' }}
                  >
                    {t('studentGroup.invitation.inviteBtn', 'Mời')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
