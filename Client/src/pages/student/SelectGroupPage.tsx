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

  const deadlineIdStr = searchParams.get('deadlineId');
  const classIdStr = searchParams.get('classId');

  const deadlineId = deadlineIdStr ? parseInt(deadlineIdStr, 10) : null;
  const classId = classIdStr ? parseInt(classIdStr, 10) : null;

  // Auto-resolve deadlineId and classId if accessed directly without query params
  const { data: myActivities, isLoading: isActivitiesLoading } = useQuery({
    queryKey: ['student-deadline-activities'],
    queryFn: () => deadlineApi.getMyActivities(),
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
    queryFn: () => deadlineApi.validateDeadline(deadlineId!, classId!),
    enabled: !!deadlineId && !!classId,
    retry: false,
  });

  // Fetch full group workspace
  const {
    data: workspace,
    isLoading: isWorkspaceLoading,
    isError: isWorkspaceError,
    error: workspaceError,
    refetch: refetchWorkspace,
  } = useQuery({
    queryKey: ['group-workspace', deadlineId, classId],
    queryFn: () => groupApi.getWorkspace(deadlineId!, classId!),
    enabled: !!deadlineId && !!classId && !!validateResult?.valid,
    retry: false,
  });

  // Realtime WebSocket sync
  const { status: wsStatus } = useGroupWebSocket({
    deadlineId,
    classId,
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
      message.success('Tạo nhóm mới thành công!');
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || 'Tạo nhóm thất bại');
    },
  });

  const joinGroupMutation = useMutation({
    mutationFn: (groupId: number) => {
      setActionLoadingGroupId(groupId);
      return groupApi.joinGroup(deadlineId!, classId!, groupId);
    },
    onSuccess: () => {
      message.success('Tham gia nhóm thành công!');
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || 'Không thể tham gia nhóm');
    },
    onSettled: () => setActionLoadingGroupId(null),
  });

  const leaveGroupMutation = useMutation({
    mutationFn: (groupId: number) => groupApi.leaveGroup(deadlineId!, classId!, groupId),
    onSuccess: () => {
      message.success('Đã rời khỏi nhóm');
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || 'Không thể rời nhóm');
    },
  });

  const transferLeaderMutation = useMutation({
    mutationFn: (newLeaderId: number) =>
      groupApi.transferLeader(deadlineId!, classId!, workspace!.myGroup!.id, { newLeaderId }),
    onSuccess: () => {
      message.success('Chuyển quyền Trưởng nhóm thành công!');
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || 'Không thể chuyển quyền');
    },
  });

  const submitGroupMutation = useMutation({
    mutationFn: (groupId: number) => groupApi.submitGroup(deadlineId!, classId!, groupId),
    onSuccess: () => {
      message.success('Nộp danh sách nhóm lên Giảng viên thành công!');
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || 'Không thể nộp nhóm');
    },
  });

  const cancelSubmitMutation = useMutation({
    mutationFn: (groupId: number) => groupApi.cancelSubmitGroup(deadlineId!, classId!, groupId),
    onSuccess: () => {
      message.info('Đã hủy nộp nhóm. Nhóm chuyển về trạng thái OPEN.');
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || 'Không thể hủy nộp');
    },
  });

  const disbandGroupMutation = useMutation({
    mutationFn: (groupId: number) => groupApi.disbandGroup(deadlineId!, classId!, groupId),
    onSuccess: () => {
      message.success('Đã giải tán nhóm');
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || 'Không thể giải tán nhóm');
    },
  });

  const acceptGroupMutation = useMutation({
    mutationFn: (groupId: number) => groupApi.acceptGroup(deadlineId!, classId!, groupId),
    onSuccess: () => {
      message.success('Phê duyệt nhóm thành công!');
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || 'Không thể duyệt nhóm');
    },
  });

  const rejectGroupMutation = useMutation({
    mutationFn: ({ groupId, reason }: { groupId: number; reason: string }) =>
      groupApi.rejectGroup(deadlineId!, classId!, groupId, { reason }),
    onSuccess: () => {
      message.info('Đã từ chối duyệt nhóm');
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || 'Không thể từ chối nhóm');
    },
  });

  const revokeGroupMutation = useMutation({
    mutationFn: (groupId: number) => groupApi.revokeGroup(deadlineId!, classId!, groupId),
    onSuccess: () => {
      message.info('Đã thu hồi phê duyệt nhóm');
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || 'Không thể thu hồi');
    },
  });

  const lecturerCreateGroupMutation = useMutation({
    mutationFn: (data: { name: string; studentIds: number[]; overrideReason?: string }) =>
      groupApi.lecturerCreateGroup(deadlineId!, classId!, data),
    onSuccess: () => {
      message.success('Giảng viên tạo và duyệt nhóm thành công!');
      queryClient.invalidateQueries({ queryKey: ['group-workspace', deadlineId, classId] });
    },
    onError: (err: any) => {
      message.error(err.message || 'Không thể tạo nhóm');
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
              Thử lại
            </Button>
            <Button variant="primary" icon={<ArrowLeft size={16} />} onClick={() => navigate('/student/dashboard')}>
              {t('deadline.student.backToDashboard', 'Quay lại Trang Chủ')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isExpired = !validateResult?.valid || validateResult?.status === 'EXPIRED' || timeLeft.isOver;

  if (isExpired) {
    return (
      <div style={{ maxWidth: '720px', margin: '2rem auto', padding: '0 1rem' }}>
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
            <Clock size={32} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
            {t('deadline.student.expiredTitle')}
          </h2>
          <p
            style={{
              color: 'var(--color-text-muted)',
              fontSize: '0.9375rem',
              margin: '0.75rem 0 1.5rem',
              lineHeight: 1.6,
              whiteSpace: 'pre-line',
            }}
          >
            {t('deadline.student.expiredDesc', {
              name: validateResult?.name,
              className: validateResult?.className,
              endTime: formatDateTime(validateResult?.endTime),
            })}
          </p>
          <Button variant="primary" icon={<ArrowLeft size={16} />} onClick={() => navigate('/student/dashboard')}>
            {t('deadline.student.backToDashboard')}
          </Button>
        </div>
      </div>
    );
  }

  const otherGroups = (workspace?.groups || []).filter(
    (g) => !workspace?.myGroup || g.id !== workspace.myGroup.id
  );

  return (
    <div style={{ maxWidth: '1200px', margin: '1.5rem auto', padding: '0 1.25rem' }}>
      {/* Top Header Card */}
      <div
        className="card"
        style={{
          padding: '1.5rem 2rem',
          borderRadius: '16px',
          marginBottom: '1.5rem',
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          border: '1px solid var(--color-border, #e2e8f0)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="badge badge-success">Đang Diễn Ra</span>
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
                {wsStatus === 'connected' ? 'Đồng bộ thời gian thực' : 'Đang kết nối lại...'}
              </span>
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-main)', margin: '0 0 4px' }}>
              {workspace?.deadlineName || validateResult?.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              <Users size={16} />
              <span>
                Lớp học: <strong style={{ color: 'var(--color-text-main)' }}>{workspace?.schoolClassName || validateResult?.className}</strong>
              </span>
              <span>•</span>
              <span>Hạn chót: {formatDateTime(workspace?.deadlineEndTime || validateResult?.endTime)}</span>
            </div>
          </div>

          {/* Countdown block */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#ffffff',
              padding: '8px 14px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            <Clock size={18} color="var(--color-primary, #2563eb)" />
            <div style={{ display: 'flex', gap: '6px', fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
              <span>{timeLeft.days}d</span>:
              <span>{timeLeft.hours}h</span>:
              <span>{timeLeft.minutes}m</span>:
              <span style={{ color: 'var(--color-primary, #2563eb)' }}>{timeLeft.seconds}s</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Workspace Actions Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--color-text-main)' }}>
            Không Gian Chọn Nhóm
          </h2>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            ({workspace?.groups?.length || 0} nhóm đã tạo)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Button
            variant="outline"
            icon={<Users size={16} />}
            onClick={() => setUnassignedDrawerOpen(true)}
          >
            Chưa có nhóm ({workspace?.unassignedStudents?.length || 0})
          </Button>

          {workspace?.canCreateGroup && (
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => setCreateModalOpen(true)}
            >
              Tạo Nhóm Mới
            </Button>
          )}

          {workspace?.isLecturer && (
            <Button
              variant="primary"
              icon={<UserPlus size={16} />}
              onClick={() => setLecturerModalOpen(true)}
            >
              Giảng Viên Tạo & Gán Nhóm
            </Button>
          )}

          <Button variant="ghost" icon={<RefreshCw size={15} />} onClick={() => refetchWorkspace()}>
            Tải lại
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--color-text-main)' }}>
            {workspace?.myGroup ? 'Các Nhóm Khác Trong Lớp' : 'Danh Sách Nhóm Đang Mở'}
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
              Chưa có nhóm nào được tạo trong lớp
            </div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', margin: '4px 0 1rem' }}>
              Hãy là người tiên phong tạo nhóm đầu tiên để mời các bạn khác cùng tham gia!
            </p>
            {workspace?.canCreateGroup && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateModalOpen(true)}>
                Tạo Nhóm Ngay
              </Button>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {otherGroups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                canJoin={!!workspace?.canJoinGroup}
                isMyGroup={false}
                isLecturer={!!workspace?.isLecturer}
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
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={async (name) => {
          await createGroupMutation.mutateAsync(name);
        }}
        isLoading={createGroupMutation.isPending}
      />

      {workspace?.myGroup && (
        <TransferLeaderModal
          open={transferModalOpen}
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
        open={rejectModalOpen}
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
        open={lecturerModalOpen}
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
        open={unassignedDrawerOpen}
        students={workspace?.unassignedStudents || []}
        onClose={() => setUnassignedDrawerOpen(false)}
        isLecturer={workspace?.isLecturer}
        onOpenLecturerCreate={() => setLecturerModalOpen(true)}
      />
    </div>
  );
};
