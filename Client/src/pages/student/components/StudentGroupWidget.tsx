import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  Clock,
  ArrowRight,
  Crown,
  UserCheck,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Calendar,
  Layers,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDeadlineBoundary, effectiveDeadlineStatus } from '@/features/deadline/hooks/useDeadlineBoundary';
import { DeadlineStateNotice } from '@/features/deadline/components/DeadlineStateNotice';
import { DeadlineStatusBadge } from '@/features/deadline/components/DeadlineStatusBadge';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import { Button } from '@/components/common/Button';

export const StudentGroupWidget: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const currentLocale = i18n.language || 'vi';

  const {
    data: rawActivities = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['student-deadline-activities'],
    queryFn: ({ signal }) => deadlineApi.getMyActivities(signal),
    refetchOnWindowFocus: true,
    staleTime: 1000 * 30, // 30 seconds
  });

  // Tìm đợt ưu tiên hiển thị: đợt ACTIVE trước, sau đó UPCOMING, hoặc đợt mới nhất
  const now = useDeadlineBoundary(rawActivities);
  const activities = rawActivities.map(activity => ({ ...activity,
    status: effectiveDeadlineStatus(activity.status, activity.startTime, activity.endTime, now),
  }));
  const activeActivity =
    activities.find((a) => a.status === 'ACTIVE') ||
    activities.find((a) => a.status === 'UPCOMING') ||
    activities[0];

  const otherActivities = activities.filter((a) => a.deadlineId !== activeActivity?.deadlineId);

  // Countdown timer cho đợt nổi bật
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isOver: boolean;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, isOver: false });

  useEffect(() => {
    if (!activeActivity?.endTime) return;

    const targetTime = new Date(activeActivity.endTime).getTime();

    const updateTimer = () => {
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

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeActivity?.endTime]);

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

  const handleNavigateToGroup = (deadlineId: number, classId: number) => {
    navigate(`/student/groups/select?deadlineId=${deadlineId}&classId=${classId}`);
  };

  // Loading state skeleton
  if (isLoading) {
    return (
      <div
        className="card"
        style={{
          padding: '1.75rem',
          borderRadius: '18px',
          marginBottom: '2rem',
          background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
          border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: '#e2e8f0',
            }}
          />
          <div style={{ width: '220px', height: '24px', backgroundColor: '#e2e8f0', borderRadius: '6px' }} />
        </div>
        <div style={{ width: '60%', height: '16px', backgroundColor: '#e2e8f0', borderRadius: '4px', marginBottom: '1.5rem' }} />
        <div style={{ width: '100%', height: '80px', backgroundColor: '#e2e8f0', borderRadius: '12px' }} />
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div
        className="card"
        style={{
          padding: '1.5rem',
          borderRadius: '16px',
          marginBottom: '2rem',
          backgroundColor: '#fff1f2',
          borderColor: '#fecdd3',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertCircle color="#e11d48" size={24} />
          <div>
            <div style={{ fontWeight: 700, color: '#9f1239', fontSize: '0.9375rem' }}>
              {t('studentWidget.errorTitle', 'Không thể tải tiện ích chọn nhóm')}
            </div>
            <div style={{ fontSize: '0.8125rem', color: '#be123c', marginTop: '2px' }}>
              {t('studentWidget.errorDesc', 'Vui lòng kiểm tra lại kết nối hoặc làm mới trang.')}
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={() => refetch()}>
          {t('common.retry', 'Thử lại')}
        </Button>
      </div>
    );
  }

  // No activity found
  if (!activeActivity) {
    return (
      <div
        className="card"
        style={{
          padding: '1.75rem 2rem',
          borderRadius: '18px',
          marginBottom: '2rem',
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              backgroundColor: '#eff6ff',
              color: 'var(--color-primary, #2563eb)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Calendar size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, margin: '0 0 4px', color: 'var(--color-text-main)' }}>
              {t('studentWidget.noDeadlineTitle', 'Chưa có đợt chọn nhóm nào đang mở')}
            </h3>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
              {t('studentWidget.noDeadlineDesc', 'Khi giảng viên mở đợt chọn nhóm mới cho lớp học của bạn, thông tin chọn nhóm sẽ hiển thị ngay tại đây.')}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => refetch()} loading={isFetching}>
          {t('common.refresh', 'Làm mới')}
        </Button>
      </div>
    );
  }

  if (activeActivity.status === 'CANCELLED' || activeActivity.status === 'EXPIRED') {
    return <div style={{ marginBottom: '2rem' }}>
      <DeadlineStateNotice status={activeActivity.status} />
      {activities.map(activity => <div className="card" key={activity.deadlineId} style={{ padding: '1rem', marginTop: '0.75rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>{activity.deadlineName}</strong><DeadlineStatusBadge status={activity.status} />
        <span>{activity.schoolClassName}</span>
        {activity.hasGroup && <Button variant="secondary" onClick={() => handleNavigateToGroup(activity.deadlineId, activity.schoolClassId)}>{t('deadline.table.viewGroups')}</Button>}
      </div>)}
    </div>;
  }

  const isActive = activeActivity.status === 'ACTIVE' && !timeLeft.isOver;
  const isUpcoming = activeActivity.status === 'UPCOMING';
  const isExpired = timeLeft.isOver;

  return (
    <div style={{ marginBottom: '2.5rem' }}>
      {/* 1. HERO WIDGET CARD */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '22px',
          background: isActive
            ? 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 45%, #2563eb 100%)'
            : isUpcoming
            ? 'linear-gradient(135deg, #1e293b 0%, #334155 60%, #475569 100%)'
            : 'linear-gradient(135deg, #334155 0%, #475569 100%)',
          color: '#ffffff',
          boxShadow: isActive
            ? '0 16px 36px -8px rgba(37, 99, 235, 0.35), 0 4px 12px rgba(15, 23, 42, 0.2)'
            : '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
          padding: '2rem 2.25rem',
          border: '1px solid rgba(255, 255, 255, 0.15)',
        }}
      >
        {/* Subtle decorative background blur glow */}
        <div
          style={{
            position: 'absolute',
            top: '-60px',
            right: '-60px',
            width: '260px',
            height: '260px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(96, 165, 250, 0.35) 0%, rgba(37, 99, 235, 0) 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Top Header Row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1.25rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
              {/* Status Badge with Live Pulse */}
              {isActive && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    backgroundColor: 'rgba(34, 197, 94, 0.2)',
                    border: '1px solid rgba(74, 222, 128, 0.4)',
                    color: '#86efac',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#22c55e',
                      boxShadow: '0 0 10px #4ade80',
                      display: 'inline-block',
                    }}
                  />
                  {t('studentWidget.activeBadge', 'Đang Diễn Ra')}
                </div>
              )}

              {isUpcoming && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    backgroundColor: 'rgba(234, 179, 8, 0.2)',
                    border: '1px solid rgba(250, 204, 21, 0.4)',
                    color: '#fde047',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  <Clock size={12} />
                  {t('studentWidget.upcomingBadge', 'Sắp Diễn Ra')}
                </div>
              )}

              {isExpired && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    backgroundColor: 'rgba(148, 163, 184, 0.2)',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    color: '#cbd5e1',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  {t('studentWidget.expiredBadge', 'Đã Kết Thúc')}
                </div>
              )}

              {/* Class Name Badge */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  backgroundColor: 'rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(8px)',
                  color: '#ffffff',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                }}
              >
                <Users size={13} />
                <span>{activeActivity.schoolClassName}</span>
              </div>
            </div>

            <h2
              style={{
                fontSize: '1.75rem',
                fontWeight: 800,
                margin: '0 0 6px',
                color: '#ffffff',
                letterSpacing: '-0.02em',
                lineHeight: 1.25,
              }}
            >
              {activeActivity.deadlineName}
            </h2>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.875rem',
                color: 'rgba(255, 255, 255, 0.8)',
              }}
            >
              <Calendar size={14} />
              <span>
                {t('studentWidget.deadlineLabel', 'Hạn chót')}:{' '}
                <strong style={{ color: '#ffffff' }}>{formatDateTime(activeActivity.endTime)}</strong>
              </span>
            </div>
          </div>

          {/* Right Action / Countdown timer box */}
          {isActive && (
            <div
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.45)',
                backdropFilter: 'blur(12px)',
                padding: '12px 18px',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <div
                style={{
                  fontSize: '0.6875rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 700,
                  color: '#93c5fd',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Clock size={12} />
                {t('studentWidget.timeRemaining', 'Thời gian còn lại')}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <span>{timeLeft.days}d</span>:<span>{timeLeft.hours}h</span>:<span>{timeLeft.minutes}m</span>:
                <span style={{ color: '#60a5fa' }}>{timeLeft.seconds}s</span>
              </div>
            </div>
          )}
        </div>

        {/* 2. GROUP MEMBERSHIP STATUS CARD (INSIDE BANNER) */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '1.25rem 1.5rem',
            color: 'var(--color-text-main, #0f172a)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1.25rem',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
          }}
        >
          {activeActivity.hasGroup ? (
            /* HAS GROUP STATE */
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: '1 1 320px' }}>
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '14px',
                  backgroundColor: '#eff6ff',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {activeActivity.isLeader ? <Crown size={26} color="#d97706" /> : <UserCheck size={26} />}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '2px' }}>
                  <span style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-main)' }}>
                    {activeActivity.groupName}
                  </span>

                  {activeActivity.isLeader ? (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        backgroundColor: '#fef3c7',
                        color: '#b45309',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Crown size={12} />
                      {t('studentWidget.roleLeader', 'Trưởng nhóm')}
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        backgroundColor: '#f1f5f9',
                        color: '#475569',
                      }}
                    >
                      {t('studentWidget.roleMember', 'Thành viên')}
                    </span>
                  )}

                  {/* Group status badge */}
                  {activeActivity.groupStatus === 'ACCEPTED' && (
                    <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                      {t('studentWidget.statusApproved', 'Đã duyệt')}
                    </span>
                  )}
                  {activeActivity.groupStatus === 'PENDING' && (
                    <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                      {t('studentWidget.statusSubmitted', 'Chờ GV duyệt')}
                    </span>
                  )}
                  {activeActivity.groupStatus === 'OPEN' && (
                    <span className="badge badge-warning" style={{ fontSize: '0.75rem' }}>
                      {t('studentWidget.statusOpen', 'Đang mở (chưa nộp)')}
                    </span>
                  )}
                  {activeActivity.groupStatus === 'REVOKED' && (
                    <span className="badge badge-danger" style={{ fontSize: '0.75rem' }}>
                      {t('studentWidget.statusRejected', 'Cần chỉnh sửa lại')}
                    </span>
                  )}
                </div>

                <div
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--color-text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Users size={14} />
                  <span>
                    {t('studentWidget.membersCount', 'Thành viên')}:{' '}
                    <strong>
                      {activeActivity.memberCount || 1}
                      {activeActivity.maxMembers ? ` / ${activeActivity.maxMembers}` : ''}
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* NO GROUP YET STATE */
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: '1 1 320px' }}>
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '14px',
                  backgroundColor: '#fff7ed',
                  color: '#ea580c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Sparkles size={24} />
              </div>

              <div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#c2410c', marginBottom: '2px' }}>
                  {t('studentWidget.unassignedTitle', 'Bạn chưa tham gia nhóm nào')}
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                  {!isActive ? t('deadline.closed.UPCOMING.description') : t(
                    'studentWidget.unassignedDesc',
                    'Hãy vào không gian chọn nhóm ngay để tạo nhóm mới hoặc xin gia nhập nhóm của các bạn trong lớp!'
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Button */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <Button
              variant="primary"
              size="md"
              icon={<ArrowRight size={16} />}
              onClick={() => handleNavigateToGroup(activeActivity.deadlineId, activeActivity.schoolClassId)}
              style={{
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {activeActivity.hasGroup
                ? t('studentWidget.enterWorkspaceBtn', 'Vào Không Gian Nhóm')
                : !isActive ? t('deadline.table.viewGroups') : t('studentWidget.joinNowBtn', 'Tham Gia Chọn Nhóm Ngay')}
            </Button>
          </div>
        </div>
      </div>

      {/* 3. OTHER OR PAST ACTIVITIES (IF ANY) */}
      {otherActivities.length > 0 && (
        <div style={{ marginTop: '1.25rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.875rem',
              fontWeight: 700,
              color: 'var(--color-text-muted)',
              marginBottom: '0.75rem',
            }}
          >
            <Layers size={15} />
            <span>{t('studentWidget.otherActivitiesTitle', 'Các đợt chọn nhóm khác của lớp')}</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {otherActivities.map((act) => (
              <div
                key={act.deadlineId}
                className="card"
                style={{
                  padding: '1rem 1.25rem',
                  borderRadius: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.75rem',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
                onClick={() => handleNavigateToGroup(act.deadlineId, act.schoolClassId)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.06)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
                    {act.deadlineName}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                    {t(`deadline.status.${act.status.toLowerCase()}`)}
                    {act.status !== 'CANCELLED' && <> • {formatDateTime(act.endTime)}</>}
                  </div>
                </div>

                <Button variant="ghost" size="sm" icon={<ArrowRight size={14} />}>
                  {t('common.view', 'Xem')}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
