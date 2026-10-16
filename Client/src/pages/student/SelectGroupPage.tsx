import { useAuth } from '@/app/providers/AuthContext';
import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  AlertTriangle,
  ArrowLeft,
  Users,
  Plus,
  UserPlus,
  RefreshCw,
} from 'lucide-react';
import { message } from 'antd';
import { useDeadlineBoundary, effectiveDeadlineStatus } from '@/features/deadline/hooks/useDeadlineBoundary';
import { DeadlineStateNotice } from '@/features/deadline/components/DeadlineStateNotice';
import { DeadlineStatusBadge } from '@/features/deadline/components/DeadlineStatusBadge';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import { groupApi } from '@/features/group/api/groupApi';
import { useGroupWebSocket } from '@/features/group/hooks/useGroupWebSocket';
import { MyGroupCard } from '@/features/group/components/MyGroupCard';
import { GroupCard } from '@/features/group/components/GroupCard';
import { CreateGroupModal } from '@/features/group/components/CreateGroupModal';
import { TransferLeaderModal } from '@/features/group/components/TransferLeaderModal';
import { RejectGroupModal } from '@/features/group/components/RejectGroupModal';
import { LecturerGroupModal } from '@/features/group/components/LecturerGroupModal';
import { UnassignedStudentsDrawer } from '@/features/group/components/UnassignedStudentsDrawer';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export const SelectGroupPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const currentLocale = i18n.language === 'en' ? 'en-US' : 'vi-VN';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const deadlineIdStr = searchParams.get('deadlineId');
  const classIdStr = searchParams.get('classId');

  const deadlineId = deadlineIdStr ? parseInt(deadlineIdStr, 10) : null;
  const classId = classIdStr ? parseInt(classIdStr, 10) : null;

  // Auto-resolve deadlineId and classId if accessed directly without query params
  const { data: myActivities, isLoading: isActivitiesLoading } = useQuery({
    queryKey: ['student-deadline-activities'],
    queryFn: ({ signal }) => deadlineApi.getMyActivities(signal),
    enabled: !deadlineId || !classId,
    retry: false,
  });

  useEffect(() => {
    if ((!deadlineId || !classId) && myActivities && myActivities.length > 0) {
      const active = myActivities.find((a) => a.status === 'ACTIVE') || myActivities[0];
      if (active?.deadlineId && active?.schoolClassId) {
        navigate(`/student/groups/select?deadlineId=${active.deadlineId}&classId=${active.schoolClassId}`, {
          replace: true,
        });
      }
    }
  }, [deadlineId, classId, myActivities, navigate]);

  // Validate deadline
  const {
    data: validateResult,
    isLoading: isValidateLoading,
    isError: isValidateError,
    error: validateError,
  } = useQuery({
    queryKey: ['validate-deadline', deadlineId, classId],
    queryFn: ({ signal }) => deadlineApi.validateDeadline(deadlineId!, classId!, signal),
    enabled: !!deadlineId && !!classId,
    retry: false,
  });

  const boundaryNow = useDeadlineBoundary(validateResult ? [validateResult] : []);
  const deadlineState = validateResult
    ? effectiveDeadlineStatus(validateResult.status, validateResult.startTime, validateResult.endTime, boundaryNow)
    : 'UPCOMING';
  const isExpired = deadlineState !== 'ACTIVE';

  // Fetch full group workspace
  const {
    data: workspace,
    isLoading: isWorkspaceLoading,
    isError: isWorkspaceError,
    error: workspaceError,
    refetch: refetchWorkspace,
  } = useQuery({
    queryKey: ['group-workspace', deadlineId, classId],
    queryFn: ({ signal }) => groupApi.getWorkspace(deadlineId!, classId!, signal),
    enabled: !!deadlineId && !!classId && !!validateResult,
    retry: false,
  });

  // Realtime WebSocket sync
  const { status: wsStatus } = useGroupWebSocket({
    deadlineId,
    classId,
    onEvent: event => {
      if (!['DEADLINE_CLOSED', 'DEADLINE_EXPIRED', 'DEADLINE_CANCELLED'].includes(event.eventType)) return;
      setCreateModalOpen(false); setTransferModalOpen(false); setRejectModalOpen(false);
      setLecturerModalOpen(false); setUnassignedDrawerOpen(false);
    },
  });

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectGroupId, setRejectGroupId] = useState<number | null>(null);
  const [lecturerModalOpen, setLecturerModalOpen] = useState(false);
  const [unassignedDrawerOpen, setUnassignedDrawerOpen] = useState(false);
  const [actionLoadingGroupId, setActionLoadingGroupId] = useState<number | null>(null);



  // Countdown timer
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isOver: boolean;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, isOver: false });

  useEffect(() => {
    if (!validateResult?.endTime) return;
    const targetTime = new Date(validateResult.endTime).getTime();

    const updateCountdown = () => {
      const now = Date.now();
      const diff = targetTime - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isOver: true });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      setTimeLeft({ days, hours, minutes, seconds, isOver: false });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [validateResult?.endTime]);

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      return new Intl.DateTimeFormat(currentLocale, {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  // Actions mutations
  const createGroupMutation = useMutation({
    mutationFn: (name: string) => groupApi.createGroup(deadlineId!, classId!, { name }),
    onSuccess: () => {
      message.success(t('studentGroup.messages.createSuccess'));
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || t('studentGroup.messages.createError'));
    },
  });

  const joinGroupMutation = useMutation({
    mutationFn: (groupId: number) => {
      setActionLoadingGroupId(groupId);
      return groupApi.joinGroup(deadlineId!, classId!, groupId);
    },
    onSuccess: () => {
      message.success(t('studentGroup.messages.joinSuccess'));
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || t('studentGroup.messages.joinError'));
    },
    onSettled: () => setActionLoadingGroupId(null),
  });

  const leaveGroupMutation = useMutation({
    mutationFn: (groupId: number) => groupApi.leaveGroup(deadlineId!, classId!, groupId),
    onSuccess: () => {
      message.success(t('studentGroup.messages.leaveSuccess'));
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || t('studentGroup.messages.leaveError'));
    },
  });

  const transferLeaderMutation = useMutation({
    mutationFn: (newLeaderId: number) =>
      groupApi.transferLeader(deadlineId!, classId!, workspace!.myGroup!.id, { newLeaderId }),
    onSuccess: () => {
      message.success(t('studentGroup.messages.transferSuccess'));
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || t('studentGroup.messages.transferError'));
    },
  });

  const submitGroupMutation = useMutation({
    mutationFn: (groupId: number) => groupApi.submitGroup(deadlineId!, classId!, groupId),
    onSuccess: () => {
      message.success(t('studentGroup.messages.submitSuccess'));
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || t('studentGroup.messages.submitError'));
    },
  });

  const cancelSubmitMutation = useMutation({
    mutationFn: (groupId: number) => groupApi.cancelSubmitGroup(deadlineId!, classId!, groupId),
    onSuccess: () => {
      message.info(t('studentGroup.messages.cancelSubmitSuccess'));
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || t('studentGroup.messages.cancelSubmitError'));
    },
  });

  const disbandGroupMutation = useMutation({
    mutationFn: (groupId: number) => groupApi.disbandGroup(deadlineId!, classId!, groupId),
    onSuccess: () => {
      message.success(t('studentGroup.messages.disbandSuccess'));
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || t('studentGroup.messages.disbandError'));
    },
  });

  const acceptGroupMutation = useMutation({
    mutationFn: (groupId: number) => groupApi.acceptGroup(deadlineId!, classId!, groupId),
    onSuccess: () => {
      message.success(t('studentGroup.messages.approveSuccess'));
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || t('studentGroup.messages.approveError'));
    },
  });

  const rejectGroupMutation = useMutation({
    mutationFn: ({ groupId, reason }: { groupId: number; reason: string }) =>
      groupApi.rejectGroup(deadlineId!, classId!, groupId, { reason }),
    onSuccess: () => {
      message.info(t('studentGroup.messages.rejectSuccess'));
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || t('studentGroup.messages.rejectError'));
    },
  });

  const revokeGroupMutation = useMutation({
    mutationFn: (groupId: number) => groupApi.revokeGroup(deadlineId!, classId!, groupId),
    onSuccess: () => {
      message.info(t('studentGroup.messages.revokeSuccess'));
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || t('studentGroup.messages.revokeError'));
    },
  });

  const lecturerCreateGroupMutation = useMutation({
    mutationFn: (data: { name: string; studentIds: number[]; overrideReason?: string }) =>
      groupApi.lecturerCreateGroup(deadlineId!, classId!, data),
    onSuccess: () => {
      message.success(t('studentGroup.messages.lecturerCreateSuccess'));
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || t('studentGroup.messages.lecturerCreateError'));
    },
  });

  // Missing query parameters
  if (!deadlineId || !classId) {
    if (isActivitiesLoading) {
      return (
        <div style={{ maxWidth: '640px', margin: '4rem auto', padding: '0 1rem', textAlign: 'center' }}>
          <div className="card" style={{ padding: '3rem' }}>
            <LoadingSpinner message={t('studentWidget.resolving', 'Đang kết nối không gian chọn nhóm của lớp bạn...')} />
          </div>
        </div>
      );
    }

    return (
      <div style={{ maxWidth: '640px', margin: '3rem auto', padding: '0 1rem' }}>
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#eff6ff',
              color: 'var(--color-primary, #2563eb)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1.25rem',
            }}
          >
            <Users size={32} />
          </div>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
            {t('studentWidget.noDeadlineTitle', 'Chưa có đợt chọn nhóm nào đang mở')}
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem', margin: '0.75rem 0 1.5rem' }}>
            {t('studentWidget.noDeadlineDesc', 'Khi giảng viên mở đợt chọn nhóm mới cho lớp học của bạn, thông tin chọn nhóm sẽ hiển thị ngay tại đây.')}
          </p>
          <Button variant="primary" icon={<ArrowLeft size={16} />} onClick={() => navigate('/student/dashboard')}>
            {t('deadline.student.backToDashboard', 'Quay lại Bảng điều khiển')}
          </Button>
        </div>
      </div>
    );
  }

  // Loading state
  if (isValidateLoading || (isWorkspaceLoading && !workspace)) {
    return (
      <div style={{ maxWidth: '640px', margin: '4rem auto', padding: '0 1rem', textAlign: 'center' }}>
        <div className="card" style={{ padding: '3rem' }}>
          <LoadingSpinner message={t('deadline.student.verifying', 'Đang tải dữ liệu không gian chọn nhóm...')} />
        </div>
      </div>
    );
  }

  // Access denied or Error
  if (isValidateError || isWorkspaceError) {
    const errorObj = validateError || workspaceError;
    return (
      <div style={{ maxWidth: '640px', margin: '3rem auto', padding: '0 1rem' }}>
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-error-bg, #fee2e2)',
              color: 'var(--color-error, #ef4444)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1.25rem',
            }}
          >
            <AlertTriangle size={32} />
          </div>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
            {t('deadline.student.accessDeniedTitle', 'Không thể truy cập không gian nhóm')}
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem', margin: '0.75rem 0 1.5rem' }}>
            {(errorObj as any)?.message || t('deadline.student.accessDeniedDesc', 'Bạn không có quyền truy cập hoặc phiên làm việc đã kết thúc.')}
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <Button variant="ghost" icon={<RefreshCw size={16} />} onClick={() => refetchWorkspace()}>
              {t('common.retry', 'Thử lại')}
            </Button>
            <Button variant="primary" icon={<ArrowLeft size={16} />} onClick={() => navigate('/student/dashboard')}>
              {t('deadline.student.backToDashboard', 'Quay lại Trang Chủ')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const otherGroups = (workspace?.groups || []).filter(
    (g) => !workspace?.myGroup || g.id !== workspace.myGroup.id
  );

  return (
    <div className="student-group-container">
      <DeadlineStateNotice status={deadlineState} />
      {/* Top Header Card */}
      <div className="card student-group-header-card">
        <div className="student-group-header-content">
          <div className="student-group-header-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
              <DeadlineStatusBadge status={deadlineState} />
              {/* WebSocket live status badge */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: wsStatus === 'connected' ? '#dcfce7' : '#fef9c3',
                  color: wsStatus === 'connected' ? '#15803d' : '#a16207',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: wsStatus === 'connected' ? '#22c55e' : '#eab308',
                    display: 'inline-block',
                  }}
                />
                {wsStatus === 'connected' ? t('studentGroup.realtimeSync') : t('studentGroup.reconnecting')}
              </span>
            </div>
            <h1 className="student-group-header-title">
              {workspace?.deadlineName || validateResult?.name}
            </h1>
            <div className="student-group-header-meta">
              <Users size={16} />
              <span>
                {t('studentGroup.classLabel')} <strong style={{ color: 'var(--color-text-main)' }}>{workspace?.schoolClassName || validateResult?.className}</strong>
              </span>
              {deadlineState !== 'CANCELLED' && <><span>•</span><span>{t('studentGroup.deadlineLabel')} {formatDateTime(workspace?.deadlineEndTime || validateResult?.endTime)}</span></>}
            </div>
          </div>

          {/* Countdown block */}
          {deadlineState === 'ACTIVE' && <div className="student-group-countdown-box">
            <Clock size={18} color="var(--color-primary, #2563eb)" />
            <div style={{ display: 'flex', gap: '6px', fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
              <span>{timeLeft.days}d</span>:
              <span>{timeLeft.hours}h</span>:
              <span>{timeLeft.minutes}m</span>:
              <span style={{ color: 'var(--color-primary, #2563eb)' }}>{timeLeft.seconds}s</span>
            </div>
          </div>}
        </div>
      </div>

      {/* Main Workspace Actions Bar */}
      <div className="student-group-actions-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--color-text-main)' }}>
            {t('studentGroup.title')}
          </h2>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            {t('studentGroup.groupCount', { count: workspace?.groups?.length || 0 })}
          </span>
        </div>

        <div className="student-group-actions-buttons">
          <Button
            variant="outline"
            icon={<Users size={16} />}
            onClick={() => setUnassignedDrawerOpen(true)}
          >
            {t('studentGroup.unassignedCount', { count: workspace?.unassignedStudents?.length || 0 })}
          </Button>

          {workspace?.canCreateGroup && !isExpired && (
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => setCreateModalOpen(true)}
            >
              {t('studentGroup.createNewGroup')}
            </Button>
          )}

          {workspace?.isLecturer && (
            <Button
              variant="primary"
              icon={<UserPlus size={16} />}
              onClick={() => setLecturerModalOpen(true)}
            >
              {t('studentGroup.lecturerCreate')}
            </Button>
          )}

          <Button variant="ghost" icon={<RefreshCw size={15} />} onClick={() => refetchWorkspace()}>
            {t('studentGroup.reload')}
          </Button>
        </div>
      </div>

      {/* 1. MY GROUP SECTION (If student has a group) */}
      {workspace?.myGroup && (
        <MyGroupCard
          group={workspace.myGroup}
          isLeader={workspace.isLeader}
          isDeadlineExpired={isExpired}
          onSubmit={() => submitGroupMutation.mutate(workspace.myGroup!.id)}
          onCancelSubmit={() => cancelSubmitMutation.mutate(workspace.myGroup!.id)}
          onLeave={() => leaveGroupMutation.mutate(workspace.myGroup!.id)}
          onDisband={() => disbandGroupMutation.mutate(workspace.myGroup!.id)}
          onOpenTransferModal={() => setTransferModalOpen(true)}
          isSubmitting={submitGroupMutation.isPending || cancelSubmitMutation.isPending}
        />
      )}

      {/* 2. AVAILABLE GROUPS GRID */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--color-text-main)' }}>
            {workspace?.myGroup ? t('studentGroup.otherGroups') : t('studentGroup.availableGroups')}
          </h3>
        </div>

        {otherGroups.length === 0 ? (
          <div
            style={{
              padding: '3rem 1.5rem',
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px dashed #cbd5e1',
              textAlign: 'center',
            }}
          >
            <Users size={36} color="#94a3b8" style={{ marginBottom: '8px' }} />
            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-main)' }}>
              {t('studentGroup.emptyGroupsTitle')}
            </div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', margin: '4px 0 1rem' }}>
              {t('studentGroup.emptyGroupsDesc')}
            </p>
            {workspace?.canCreateGroup && !isExpired && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateModalOpen(true)}>
                {t('studentGroup.createFirstGroup')}
              </Button>
            )}
          </div>
        ) : (
          <div className="student-group-grid">
            {otherGroups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                canJoin={!!workspace?.canJoinGroup && !isExpired}
                isMyGroup={false}
                isLecturer={!!workspace?.isLecturer}
                canUnlock={Boolean(user?.authorities.includes('ROLE_ADMIN') || user?.id === workspace?.lecturerId)}
                isDeadlineExpired={isExpired}
                onJoin={(id) => joinGroupMutation.mutate(id)}
                onAccept={(id) => acceptGroupMutation.mutate(id)}
                onOpenRejectModal={(id) => {
                  setRejectGroupId(id);
                  setRejectModalOpen(true);
                }}
                onRevoke={(id) => revokeGroupMutation.mutate(id)}
                isActionLoading={actionLoadingGroupId === group.id && joinGroupMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* MODALS */}
      <CreateGroupModal
        open={createModalOpen && !isExpired}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={async (name) => {
          await createGroupMutation.mutateAsync(name);
        }}
        isLoading={createGroupMutation.isPending}
      />

      {workspace?.myGroup && (
        <TransferLeaderModal
          open={transferModalOpen && !isExpired}
          members={workspace.myGroup.members}
          currentLeaderId={workspace.myGroup.leaderId}
          onClose={() => setTransferModalOpen(false)}
          onSubmit={async (newLeaderId) => {
            await transferLeaderMutation.mutateAsync(newLeaderId);
          }}
          isLoading={transferLeaderMutation.isPending}
        />
      )}

      <RejectGroupModal
        open={rejectModalOpen && !isExpired}
        groupId={rejectGroupId}
        onClose={() => {
          setRejectModalOpen(false);
          setRejectGroupId(null);
        }}
        onSubmit={async (groupId, reason) => {
          await rejectGroupMutation.mutateAsync({ groupId, reason });
        }}
        isLoading={rejectGroupMutation.isPending}
      />

      <LecturerGroupModal
        open={lecturerModalOpen && !isExpired}
        unassignedStudents={workspace?.unassignedStudents || []}
        rules={workspace?.rules || []}
        maxMembers={workspace?.groups?.[0]?.maxMembers || 6}
        onClose={() => setLecturerModalOpen(false)}
        onSubmit={async (data) => {
          await lecturerCreateGroupMutation.mutateAsync(data);
        }}
        isLoading={lecturerCreateGroupMutation.isPending}
      />

      <UnassignedStudentsDrawer
        open={unassignedDrawerOpen && !isExpired}
        students={workspace?.unassignedStudents || []}
        onClose={() => setUnassignedDrawerOpen(false)}
        isLecturer={workspace?.isLecturer}
        onOpenLecturerCreate={() => setLecturerModalOpen(true)}
      />
    </div>
  );
};
