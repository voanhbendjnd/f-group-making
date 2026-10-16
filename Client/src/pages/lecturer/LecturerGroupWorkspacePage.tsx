import './LecturerGroupWorkspacePage.css';
import { useToast } from '@/app/providers/ToastContext';
import { translateErrorMessage } from '@/services/api/errorTranslator';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Plus,
  ArrowLeft,
  GripVertical,
  Crown,
  Trash2,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Modal, Tooltip, Dropdown, type MenuProps } from 'antd';
import { classApi } from '@/features/classes/api/classApi';
import { DeadlineStateNotice } from '@/features/deadline/components/DeadlineStateNotice';
import type { DeadlineStatus } from '@/features/deadline/types';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import { groupApi } from '@/features/group/api/groupApi';
import { useGroupWebSocket } from '@/features/group/hooks/useGroupWebSocket';
import { LecturerGroupModal } from '@/features/group/components/LecturerGroupModal';
import { RejectGroupModal } from '@/features/group/components/RejectGroupModal';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Button } from '@/components/common/Button';
import { useAuth } from '@/app/providers/AuthContext';
import { canViewAllClasses } from '@/features/auth/utils/roleRouting';
import type {
  GroupDTO,
  GroupMemberDTO,
} from '@/features/group/types/groupTypes';

interface DragPayload {
  studentId: number;
  studentName: string;
  fromGroupId: number | null;
}

export const LecturerGroupWorkspacePage: React.FC = () => {
  const { t } = useTranslation();
  const message = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const classIdParam = searchParams.get('classId');
  const deadlineIdParam = searchParams.get('deadlineId');

  const selectedClassId = classIdParam ? parseInt(classIdParam, 10) : null;
  const selectedDeadlineId = deadlineIdParam ? parseInt(deadlineIdParam, 10) : null;

  // Filter states for unassigned pool
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMajorFilter, setSelectedMajorFilter] = useState<string>('ALL');

  // Drag-and-drop highlight states
  const [dragOverGroupId, setDragOverGroupId] = useState<number | null>(null);
  const [isDragOverQuickCreate, setIsDragOverQuickCreate] = useState(false);
  const [isDragOverUnassigned, setIsDragOverUnassigned] = useState(false);

  // Expanded rules state for cards
  const [expandedRulesGroupIds, setExpandedRulesGroupIds] = useState<Record<number, boolean>>({});

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [initialStudentIds, setInitialStudentIds] = useState<number[]>([]);
  const [rejectingGroupId, setRejectingGroupId] = useState<number | null>(null);

  const { user } = useAuth();
  const allClasses = canViewAllClasses(user?.authorities || []);

  // 1. Fetch classes: if admin/lecturer master, fetch all classes; otherwise fetch assigned classes
  const { data: classesData, isLoading: isLoadingClasses } = useQuery({
    queryKey: [allClasses ? 'all-classes-for-workspace' : 'my-classes-for-workspace'],
    queryFn: ({ signal }) =>
      allClasses
        ? classApi.getClasses({ page: 1, size: 100 }, signal)
        : classApi.getMyClasses({ page: 1, size: 100 }, signal),
  });

  const availableClasses = useMemo(() => classesData?.result || [], [classesData]);

  // 2. Fetch lecturer's deadlines
  const { data: deadlinesData, isLoading: isLoadingDeadlines } = useQuery({
    queryKey: ['lecturer-deadlines-for-workspace'],
    queryFn: ({ signal }) => deadlineApi.getDeadlines({ page: 1, size: 100 }, signal),
  });

  const availableDeadlines = useMemo(() => deadlinesData?.result || [], [deadlinesData]);

  // Auto-select class & deadline if not in URL
  useEffect(() => {
    if (!selectedClassId && availableClasses.length > 0) {
      const firstClass = availableClasses[0];
      if (!selectedDeadlineId && availableDeadlines.length > 0) {
        const classDeadlines = availableDeadlines.filter((d) =>
          d.schoolClassIds ? d.schoolClassIds.includes(firstClass.id) : true
        );
        const active = classDeadlines.find((d) => d.status === 'ACTIVE') || classDeadlines[0] || availableDeadlines[0];
        setSearchParams({ classId: String(firstClass.id), deadlineId: String(active.id) }, { replace: true });
      } else {
        setSearchParams({ classId: String(firstClass.id), deadlineId: String(selectedDeadlineId || 1) }, { replace: true });
      }
    } else if (selectedClassId && !selectedDeadlineId && availableDeadlines.length > 0) {
      const classDeadlines = availableDeadlines.filter((d) =>
        d.schoolClassIds ? d.schoolClassIds.includes(selectedClassId) : true
      );
      const active = classDeadlines.find((d) => d.status === 'ACTIVE') || classDeadlines[0] || availableDeadlines[0];
      setSearchParams({ classId: String(selectedClassId), deadlineId: String(active.id) }, { replace: true });
    }
  }, [selectedClassId, selectedDeadlineId, availableClasses, availableDeadlines, setSearchParams]);

  // 3. Fetch Workspace data
  const {
    data: workspace,
    isLoading: isLoadingWorkspace,
    isError: isWorkspaceError,
    error: workspaceError,
    refetch: refetchWorkspace,
  } = useQuery({
    queryKey: ['group-workspace', selectedDeadlineId, selectedClassId],
    queryFn: ({ signal }) => groupApi.getWorkspace(selectedDeadlineId!, selectedClassId!, signal),
    enabled: !!selectedDeadlineId && !!selectedClassId,
    retry: false,
  });

  const canManage = !!workspace?.canManageGroups;
  const canUnlock = Boolean(user?.authorities.includes('ROLE_ADMIN') || user?.id === workspace?.lecturerId);
  const canEditGroup = (group: GroupDTO) => canManage && (group.status === 'OPEN'
    || (group.status === 'REVOKED' && workspace?.deadlineStatus === 'ACTIVE'));
  const submitReviewMutation = useMutation({
    mutationFn: (groupId: number) => groupApi.lecturerSubmitGroup(selectedDeadlineId!, selectedClassId!, groupId),
    onSuccess: () => { message.success(t('groupLifecycle.submitted')); invalidateCurrentWorkspace(); },
    onError: (error: any) => message.error(error.message || t('groupLifecycle.rulesRequired')),
  });


  // 4. Realtime WebSocket
  const { status: wsStatus } = useGroupWebSocket({
    deadlineId: selectedDeadlineId,
    classId: selectedClassId,
    onEvent: event => {
      if (event.eventType !== 'DEADLINE_CANCELLED') return;
      setIsCreateModalOpen(false); setRejectingGroupId(null); Modal.destroyAll();
    },
  });

  // Invalidate query helper
  const invalidateCurrentWorkspace = useCallback(() => {
    if (selectedDeadlineId && selectedClassId) {
      queryClient.invalidateQueries({
        queryKey: ['group-workspace', selectedDeadlineId, selectedClassId],
      });
    }
  }, [queryClient, selectedDeadlineId, selectedClassId]);

  // Mutations
  const addMemberMutation = useMutation({
    mutationFn: ({ groupId, studentId }: { groupId: number; studentId: number }) =>
      groupApi.lecturerAddMember(selectedDeadlineId!, selectedClassId!, groupId, studentId),
    onSuccess: (data) => {
      message.success(t('groupWorkspace.messages.addMemberSuccess', { name: data.name }));
      invalidateCurrentWorkspace();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || err.message || t('groupWorkspace.messages.addMemberError'));
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ groupId, studentId }: { groupId: number; studentId: number }) =>
      groupApi.lecturerRemoveMember(selectedDeadlineId!, selectedClassId!, groupId, studentId),
    onSuccess: () => {
      message.success(t('groupWorkspace.messages.removeMemberSuccess'));
      invalidateCurrentWorkspace();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || err.message || t('groupWorkspace.messages.removeMemberError'));
    },
  });

  const setLeaderMutation = useMutation({
    mutationFn: ({ groupId, studentId }: { groupId: number; studentId: number }) =>
      groupApi.lecturerSetLeader(selectedDeadlineId!, selectedClassId!, groupId, studentId),
    onSuccess: () => {
      message.success(t('groupWorkspace.messages.setLeaderSuccess'));
      invalidateCurrentWorkspace();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || err.message || t('groupWorkspace.messages.setLeaderError'));
    },
  });

  const acceptGroupMutation = useMutation({
    mutationFn: (groupId: number) =>
      groupApi.acceptGroup(selectedDeadlineId!, selectedClassId!, groupId),
    onSuccess: (data) => {
      message.success(t('groupWorkspace.messages.acceptSuccess', { name: data.name }));
      invalidateCurrentWorkspace();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || err.message || t('groupWorkspace.messages.acceptError'));
    },
  });

  const revokeGroupMutation = useMutation({
    mutationFn: (groupId: number) =>
      groupApi.revokeGroup(selectedDeadlineId!, selectedClassId!, groupId),
    onSuccess: (data) => {
      message.warning(t('groupWorkspace.messages.revokeSuccess', { name: data.name }));
      invalidateCurrentWorkspace();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || err.message || t('groupWorkspace.messages.revokeError'));
    },
  });

  const disbandGroupMutation = useMutation({
    mutationFn: (groupId: number) =>
      groupApi.lecturerDisbandGroup(selectedDeadlineId!, selectedClassId!, groupId),
    onSuccess: () => {
      message.success(t('groupWorkspace.messages.disbandSuccess'));
      invalidateCurrentWorkspace();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || err.message || t('groupWorkspace.messages.disbandError'));
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: (payload: { name: string; studentIds: number[]; overrideReason?: string }) =>
      groupApi.lecturerCreateGroup(selectedDeadlineId!, selectedClassId!, payload),
    onSuccess: (data) => {
      message.success(t('groupLifecycle.draftCreated', { name: data.name }));
      invalidateCurrentWorkspace();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || err.message || t('groupWorkspace.messages.createError'));
    },
  });

  // Filtered Unassigned Students
  const filteredUnassignedStudents = useMemo(() => {
    if (!workspace?.unassignedStudents) return [];
    return workspace.unassignedStudents.filter((s) => {
      const matchSearch =
        searchQuery === '' ||
        s.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.rollNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.memberCode.toLowerCase().includes(searchQuery.toLowerCase());

      const matchMajor =
        selectedMajorFilter === 'ALL' ||
        s.majorCode?.toUpperCase() === selectedMajorFilter.toUpperCase();

      return matchSearch && matchMajor;
    });
  }, [workspace?.unassignedStudents, searchQuery, selectedMajorFilter]);

  // Unique majors in unassigned list
  const availableMajors = useMemo(() => {
    if (!workspace?.unassignedStudents) return [];
    const set = new Set<string>();
    workspace.unassignedStudents.forEach((s) => {
      if (s.majorCode) set.add(s.majorCode.toUpperCase());
    });
    return Array.from(set);
  }, [workspace?.unassignedStudents]);

  // Max members rule
  const maxMembers = useMemo(() => {
    const rule = workspace?.rules?.find((r) => r.code === 'MAX_MEMBERS_PER_GROUP');
    return rule?.value || 5;
  }, [workspace?.rules]);

  // Min members rule
  const minMembers = useMemo(() => {
    const rule = workspace?.rules?.find((r) => r.code === 'MIN_MEMBERS_PER_GROUP');
    return rule?.value || 4;
  }, [workspace?.rules]);

  const openCreateModal = (studentId?: number) => {
    if (!canManage || createGroupMutation.isPending) return;
    setInitialStudentIds(studentId === undefined ? [] : [studentId]);
    setIsCreateModalOpen(true);
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, student: GroupMemberDTO, fromGroupId: number | null) => {
    if (!canManage || (fromGroupId !== null && !workspace?.groups.some(group => group.id === fromGroupId && canEditGroup(group)))) { e.preventDefault(); return; }
    const payload: DragPayload = {
      studentId: student.studentId,
      studentName: student.fullName,
      fromGroupId,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDragOverGroupId(null);
    setIsDragOverQuickCreate(false);
    setIsDragOverUnassigned(false);
  };

  const handleDropOnGroup = async (e: React.DragEvent, targetGroupId: number) => {
    e.preventDefault();
    if (!canManage) return;
    setDragOverGroupId(null);
    if (!workspace?.groups.some(group => group.id === targetGroupId && canEditGroup(group))) return;
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const data: DragPayload = JSON.parse(raw);

      if (data.fromGroupId === targetGroupId) {
        return; // Dropped on the same group
      }

      if (data.fromGroupId !== null) {
        await groupApi.lecturerMoveMember(selectedDeadlineId!, selectedClassId!, data.fromGroupId, targetGroupId, data.studentId);
        invalidateCurrentWorkspace();
        return;
      }

      await addMemberMutation.mutateAsync({ groupId: targetGroupId, studentId: data.studentId });
    } catch {
      message.error(t('groupLifecycle.moveError'));
      invalidateCurrentWorkspace();
    }
  };

  const handleDropOnQuickCreate = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setIsDragOverQuickCreate(false);
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const data: DragPayload = JSON.parse(raw);

      if (data.fromGroupId !== null) {
        message.warning(t('groupWorkspace.messages.dragUnassignedOnly'));
        return;
      }

      if (!workspace?.unassignedStudents.some(student => student.studentId === data.studentId)) {
        message.warning(t('groupWorkspace.messages.dragUnassignedOnly'));
        return;
      }
      openCreateModal(data.studentId);
    } catch {
      message.warning(t('groupWorkspace.messages.dragUnassignedOnly'));
    }
  };

  const handleDropOnUnassigned = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setIsDragOverUnassigned(false);
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const data: DragPayload = JSON.parse(raw);

      if (data.fromGroupId !== null) {
        const source = workspace?.groups.find(group => group.id === data.fromGroupId);
        if (!source || !canEditGroup(source) || !source.members.some(member => member.studentId === data.studentId)) return;
        if (source.memberCount === 1) {
          confirmDisband(source);
          return;
        }
        await removeMemberMutation.mutateAsync({
          groupId: data.fromGroupId,
          studentId: data.studentId,
        });
      }
    } catch (err) {
      console.error('Drop on unassigned failed', err);
    }
  };

  // Disband confirmation
  const confirmDisband = (group: GroupDTO) => {
    Modal.confirm({
      title: t('groupWorkspace.disbandConfirm.title', { name: group.name }),
      icon: <Trash2 size={22} style={{ color: '#ef4444', marginRight: 8 }} />,
      content: (
        <div>
          <p>{t('groupWorkspace.disbandConfirm.content')}</p>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: 4 }}>
            {t('groupWorkspace.disbandConfirm.warning')}
          </p>
        </div>
      ),
      okText: t('groupWorkspace.disbandConfirm.ok'),
      okType: 'danger',
      cancelText: t('groupWorkspace.disbandConfirm.cancel'),
      centered: true,
      onOk: () => disbandGroupMutation.mutateAsync(group.id),
    });
  };

  // Toggle rule details for a card
  const toggleRules = (groupId: number) => {
    setExpandedRulesGroupIds((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  // Status badge styling
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'ACCEPTED':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 9999,
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: '#ecfdf5',
              color: '#059669',
              border: '1px solid #a7f3d0',
            }}
          >
            <Check size={12} /> {t('groupWorkspace.status.accepted')}
          </span>
        );
      case 'PENDING':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 9999,
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: '#fffbeb',
              color: '#d97706',
              border: '1px solid #fde68a',
            }}
          >
            <AlertTriangle size={12} /> {t('groupWorkspace.status.pending')}
          </span>
        );
      case 'OPEN':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 9999,
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: '#eff6ff',
              color: '#2563eb',
              border: '1px solid #bfdbfe',
            }}
          >
            {t('groupWorkspace.status.open')}
          </span>
        );
      case 'REVOKED':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 9999,
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: '#fef2f2',
              color: '#dc2626',
              border: '1px solid #fecaca',
            }}
          >
            {t('groupLifecycle.revoked')}
          </span>
        );
      default:
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 9999,
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: '#f1f5f9',
              color: '#475569',
            }}
          >
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 lecturer-group-workspace">
      {/* Top Header & Context Selectors */}
      <div
        className="card workspace-header"
      >
        <div className="workspace-heading">
          <Link
            to="/lecturer/classes"
            className="btn btn-secondary workspace-back"
            style={{ padding: '6px 12px', fontSize: '0.875rem' }}
          >
            <ArrowLeft size={16} /> {t('groupWorkspace.backToClasses')}
          </Link>

          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
              {t('groupWorkspace.title')}
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: '0.8125rem', color: '#64748b' }}>
              {t('groupWorkspace.subtitle')}
            </p>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="workspace-toolbar">
          {/* Class Selector */}
          <div className="workspace-selector">
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>
              {t('groupWorkspace.classLabel')}
            </span>
            <select
              className="form-control"
              aria-label={t('groupWorkspace.classLabel')}
              value={selectedClassId || ''}
              onChange={(e) => {
                const newClassId = e.target.value;
                setSearchParams((prev) => {
                  prev.set('classId', newClassId);
                  return prev;
                });
              }}
            >
              {availableClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Deadline Selector */}
          <div className="workspace-selector">
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>
              {t('groupWorkspace.deadlineLabel')}
            </span>
            <select
              className="form-control"
              aria-label={t('groupWorkspace.deadlineLabel')}
              value={selectedDeadlineId || ''}
              onChange={(e) => {
                const newDeadlineId = e.target.value;
                setSearchParams((prev) => {
                  prev.set('deadlineId', newDeadlineId);
                  return prev;
                });
              }}
            >
              {availableDeadlines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({t(`deadline.status.${d.status.toLowerCase()}`)})
                </option>
              ))}
            </select>
          </div>

          <div className="workspace-toolbar-actions">
          {/* Realtime WebSocket Indicator */}
          <Tooltip title={`WebSocket Realtime: ${wsStatus}`}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 10px',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 600,
                backgroundColor: wsStatus === 'connected' ? '#ecfdf5' : '#fef2f2',
                color: wsStatus === 'connected' ? '#059669' : '#dc2626',
                border: `1px solid ${wsStatus === 'connected' ? '#a7f3d0' : '#fecaca'}`,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: wsStatus === 'connected' ? '#10b981' : '#ef4444',
                  boxShadow: wsStatus === 'connected' ? '0 0 8px #10b981' : 'none',
                }}
              />
              {wsStatus === 'connected' ? t('groupWorkspace.live') : t('groupWorkspace.offline')}
            </span>
          </Tooltip>

          {/* Refresh Button */}
          <Button
            size="sm"
            variant="secondary"
            icon={<RefreshCw size={14} className={isLoadingWorkspace ? 'animate-spin' : ''} />}
            onClick={() => refetchWorkspace()}
            title={t('groupWorkspace.refreshData')}
          >
            {t('groupWorkspace.refreshData')}
          </Button>

          {/* Add Group Modal Button */}
          <Button
            size="sm"
            variant="primary"
            icon={<Plus size={15} />}
            disabled={!canManage}
            onClick={() => openCreateModal()}
          >
            {t('groupWorkspace.createNewGroup')}
          </Button>
          </div>
        </div>
      </div>

      {workspace?.deadlineStatus === 'CANCELLED' && <DeadlineStateNotice status={workspace.deadlineStatus as DeadlineStatus} />}
      {/* Main Workspace Layout (2 Columns: Unassigned Pool Left, Groups Canvas Right) */}
      {isLoadingWorkspace || isLoadingClasses || isLoadingDeadlines ? (
        <div className="card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <LoadingSpinner message={t('groupWorkspace.loading')} />
        </div>
      ) : isWorkspaceError ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <AlertTriangle size={36} color="#ef4444" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ color: '#1e293b', fontWeight: 600 }}>{t('groupWorkspace.loadErrorTitle')}</h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            {translateErrorMessage(workspaceError)}
          </p>
          <Button variant="secondary" onClick={() => refetchWorkspace()} style={{ marginTop: '1rem' }}>
            {t('groupWorkspace.retry')}
          </Button>
        </div>
      ) : (
        <fieldset disabled={!canManage} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="workspace-panels">
          {/* ======================================================== */}
          {/* COLUMN 1: UNASSIGNED STUDENTS POOL (LEFT)                */}
          {/* ======================================================== */}
          <div
            className={`card unassigned-pool ${isDragOverUnassigned ? 'drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setIsDragOverUnassigned(true);
            }}
            onDragLeave={() => setIsDragOverUnassigned(false)}
            onDrop={handleDropOnUnassigned}
          >
            {/* Pool Header */}
            <div className="workspace-pool-heading">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={18} color="#2563eb" />
                <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  {t('groupWorkspace.unassignedTitle')}
                </h2>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  backgroundColor: filteredUnassignedStudents.length > 0 ? '#eff6ff' : '#f1f5f9',
                  color: filteredUnassignedStudents.length > 0 ? '#2563eb' : '#64748b',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                }}
              >
                {t('groupWorkspace.unassignedCount', { count: filteredUnassignedStudents.length })}
              </span>
            </div>

            {/* Instruction Banner */}
            <div
              style={{
                fontSize: '0.75rem',
                color: '#64748b',
                backgroundColor: '#f8fafc',
                padding: '6px 10px',
                borderRadius: '6px',
                marginBottom: '0.75rem',
                border: '1px solid #f1f5f9',
              }}
            >
              {t('groupWorkspace.dragTip')}
            </div>

            {/* Search Input */}
            <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
              <Search
                size={14}
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
              />
              <input
                type="text"
                className="form-control"
                placeholder={t('groupWorkspace.searchPlaceholder')}
                style={{ paddingLeft: '32px', fontSize: '0.8125rem' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Major Filter Pills */}
            {availableMajors.length > 1 && (
              <div
                style={{
                  display: 'flex',
                  gap: '4px',
                  flexWrap: 'wrap',
                  marginBottom: '0.75rem',
                  paddingBottom: '0.5rem',
                  borderBottom: '1px solid #f1f5f9',
                }}
              >
                <button
                  type="button"
                  style={{
                    fontSize: '0.6875rem',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: '1px solid',
                    cursor: 'pointer',
                    fontWeight: 600,
                    backgroundColor: selectedMajorFilter === 'ALL' ? '#2563eb' : '#f8fafc',
                    color: selectedMajorFilter === 'ALL' ? '#ffffff' : '#64748b',
                    borderColor: selectedMajorFilter === 'ALL' ? '#2563eb' : '#e2e8f0',
                  }}
                  onClick={() => setSelectedMajorFilter('ALL')}
                >
                  {t('groupWorkspace.all')}
                </button>
                {availableMajors.map((m) => (
                  <button
                    key={m}
                    type="button"
                    style={{
                      fontSize: '0.6875rem',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid',
                      cursor: 'pointer',
                      fontWeight: 600,
                      backgroundColor: selectedMajorFilter === m ? '#2563eb' : '#f8fafc',
                      color: selectedMajorFilter === m ? '#ffffff' : '#64748b',
                      borderColor: selectedMajorFilter === m ? '#2563eb' : '#e2e8f0',
                    }}
                    onClick={() => setSelectedMajorFilter(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}

            {/* Draggable Students List */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                paddingRight: '4px',
              }}
            >
              {filteredUnassignedStudents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8' }}>
                  <CheckCircle size={32} color="#10b981" style={{ margin: '0 auto 8px' }} />
                  <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155', margin: 0 }}>
                    {t('groupWorkspace.allAssignedTitle')}
                  </p>
                  <p style={{ fontSize: '0.75rem', marginTop: 4 }}>
                    {t('groupWorkspace.allAssignedDesc')}
                  </p>
                </div>
              ) : (
                filteredUnassignedStudents.map((student) => {
                  const quickAddMenu: MenuProps['items'] = (workspace?.groups || []).filter(g => canEditGroup(g) && g.memberCount < g.maxMembers).map((g) => ({
                    key: String(g.id),
                    label: t('groupWorkspace.quickAddTo', { name: g.name }),
                    onClick: () => addMemberMutation.mutate({ groupId: g.id, studentId: student.studentId }),
                  }));

                  return (
                    <div
                      key={student.studentId}
                      draggable={canManage}
                      onDragStart={(e) => handleDragStart(e, student, null)}
                      onDragEnd={handleDragEnd}
                      style={{
                        padding: '10px 12px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        cursor: 'grab',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                        transition: 'all 0.15s ease',
                        userSelect: 'none',
                      }}
                      className="draggable-student-card"
                    >
                      <div className="workspace-person">
                        <GripVertical size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            backgroundColor: 'var(--color-primary-light)',
                            color: 'var(--color-primary)',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {student.fullName ? student.fullName.charAt(0).toUpperCase() : 'S'}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '0.8125rem',
                              fontWeight: 600,
                              color: '#1e293b',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {student.fullName}
                          </div>
                          <div className="workspace-person-meta">
                            {student.rollNumber}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            backgroundColor: student.majorCode?.toUpperCase() === 'SE' ? '#eff6ff' : '#faf5ff',
                            color: student.majorCode?.toUpperCase() === 'SE' ? '#2563eb' : '#9333ea',
                            border: `1px solid ${student.majorCode?.toUpperCase() === 'SE' ? '#bfdbfe' : '#e9d5ff'}`,
                          }}
                        >
                          {student.majorCode || 'N/A'}
                        </span>

                        {workspace?.groups && workspace.groups.length > 0 && (
                          <Dropdown menu={{ items: quickAddMenu }} trigger={['click']}>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: '2px 4px', fontSize: '0.75rem', color: '#64748b' }}
                              title={t('groupWorkspace.quickAdd')}
                            >
                              <Plus size={13} />
                            </button>
                          </Dropdown>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ======================================================== */}
          {/* COLUMN 2: GROUPS CANVAS & DROP ZONES (RIGHT)             */}
          {/* ======================================================== */}
          <div className="workspace-canvas">
            {/* Quick Drop Zone: Drag here to create a new group instantly */}
            <div
              className={`workspace-create-zone ${isDragOverQuickCreate ? 'is-drag-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!canManage || createGroupMutation.isPending) return;
                e.dataTransfer.dropEffect = 'move';
                setIsDragOverQuickCreate(true);
              }}
              onDragLeave={() => setIsDragOverQuickCreate(false)}
              onDrop={handleDropOnQuickCreate}
              role="button"
              tabIndex={canManage ? 0 : -1}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openCreateModal(); } }}
              aria-disabled={!canManage || createGroupMutation.isPending}
              onClick={() => { if (canManage) openCreateModal(); }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: isDragOverQuickCreate ? '#2563eb' : '#e2e8f0',
                  color: isDragOverQuickCreate ? '#ffffff' : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}
              >
                <Plus size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1e293b' }}>
                  {isDragOverQuickCreate
                    ? t('groupWorkspace.quickDropActive')
                    : t('groupWorkspace.quickDropIdle')}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {t('groupWorkspace.quickDropHint')}
                </div>
              </div>
            </div>

            {/* Groups Grid */}
            {workspace?.groups?.length === 0 ? (
              <div className="card" style={{ padding: '3.5rem 1.5rem', textAlign: 'center' }}>
                <Users size={48} color="#94a3b8" style={{ margin: '0 auto 1rem' }} />
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b' }}>
                  {t('groupWorkspace.emptyGroupsTitle')}
                </h3>
                <p style={{ color: '#64748b', fontSize: '0.875rem', maxWidth: '400px', margin: '0.25rem auto 1.5rem' }}>
                  {t('groupWorkspace.emptyGroupsDesc')}
                </p>
                <Button variant="primary" icon={<Plus size={16} />} disabled={!canManage}
            onClick={() => openCreateModal()}>
                  {t('groupWorkspace.createFirstGroup')}
                </Button>
              </div>
            ) : (
              <div className="workspace-group-grid">
                {workspace?.groups?.map((group) => {
                  const isDragOverThis = dragOverGroupId === group.id;
                  const isRulesExpanded = !!expandedRulesGroupIds[group.id];
                  const memberCount = group.members?.length || 0;

                  return (
                    <div
                      key={group.id}
                      className={`card group-card-dropzone ${isDragOverThis ? 'drag-over-active' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDragOverGroupId(group.id);
                      }}
                      onDragLeave={() => setDragOverGroupId(null)}
                      onDrop={(e) => handleDropOnGroup(e, group.id)}
                      style={{
                        padding: '1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                        border: isDragOverThis
                          ? '2px solid #2563eb'
                          : '1px solid #e2e8f0',
                        boxShadow: isDragOverThis
                          ? '0 0 0 4px rgba(37, 99, 235, 0.15)'
                          : '0 1px 3px rgba(0,0,0,0.05)',
                        backgroundColor: isDragOverThis ? '#f0f7ff' : '#ffffff',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {/* Card Header */}
                      <div className="workspace-group-heading">
                        <div>
                          <div className="workspace-group-title">
                            <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                              {group.name}
                            </h3>
                            {renderStatusBadge(group.status)}
                          </div>
                          {group.rejectReason && (
                            <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: 4 }}>
                              {t('groupWorkspace.rejectionReason', { reason: group.rejectReason })}
                            </div>
                          )}
                        </div>

                        {/* Member count pill */}
                        <div
                          style={{
                            fontSize: '0.8125rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: memberCount >= minMembers && memberCount <= maxMembers ? '#ecfdf5' : '#fffbeb',
                            color: memberCount >= minMembers && memberCount <= maxMembers ? '#059669' : '#d97706',
                            border: `1px solid ${memberCount >= minMembers && memberCount <= maxMembers ? '#a7f3d0' : '#fde68a'}`,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {t('groupWorkspace.memberCount', { count: memberCount, max: maxMembers })}
                        </div>
                      </div>

                      {/* Drop Banner when dragging over */}
                      {isDragOverThis && (
                        <div
                          style={{
                            padding: '8px',
                            backgroundColor: '#2563eb',
                            color: '#ffffff',
                            borderRadius: '6px',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            textAlign: 'center',
                          }}
                        >
                          {t('groupWorkspace.dropToAdd', { name: group.name })}
                        </div>
                      )}

                      {/* Members List */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                          {t('groupWorkspace.groupMembers')}
                        </div>

                        {group.members && group.members.length > 0 ? (
                          group.members.map((member) => {
                            const isLeader = member.role === 'LEADER';
                            return (
                              <div
                                key={member.studentId}
                                className={`workspace-member ${isLeader ? 'is-leader' : ''}`}
                                draggable={canEditGroup(group)}
                                onDragStart={(e) => handleDragStart(e, member, group.id)}
                                onDragEnd={handleDragEnd}
                              >
                                <div className="workspace-person">
                                  <GripVertical size={13} color="#94a3b8" />
                                  {isLeader ? (
                                    <Tooltip title={t('groupWorkspace.leader')}>
                                      <Crown size={16} color="#eab308" style={{ flexShrink: 0 }} />
                                    </Tooltip>
                                  ) : (
                                    <div
                                      style={{
                                        width: 18,
                                        height: 18,
                                        borderRadius: '50%',
                                        backgroundColor: '#e2e8f0',
                                        color: '#475569',
                                        fontSize: '0.625rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                      }}
                                    >
                                      {member.fullName?.charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <div style={{ minWidth: 0 }}>
                                    <div
                                      style={{
                                        fontSize: '0.8125rem',
                                        fontWeight: isLeader ? 700 : 500,
                                        color: '#1e293b',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {member.fullName}
                                    </div>
                                    <div className="workspace-person-meta">
                                      {member.rollNumber} • {member.majorCode || t('groupReview.missing')}
                                    </div>
                                  </div>
                                </div>

                                <div className="workspace-member-actions">
                                  {!isLeader && (
                                    <Tooltip title={t('groupWorkspace.makeLeader')}>
                                      <button
                                        type="button"
                                        className="btn btn-ghost"
                                        disabled={!canEditGroup(group)}
                                        style={{ padding: '2px 4px', color: '#64748b' }}
                                        onClick={() =>
                                          setLeaderMutation.mutate({
                                            groupId: group.id,
                                            studentId: member.studentId,
                                          })
                                        }
                                      >
                                        <Crown size={14} />
                                      </button>
                                    </Tooltip>
                                  )}

                                  <Tooltip title={t('groupWorkspace.removeFromGroup')}>
                                    <button
                                      type="button"
                                      className="btn btn-ghost"
                                      disabled={!canEditGroup(group)}
                                      style={{ padding: '2px 4px', color: '#ef4444' }}
                                      onClick={() =>
                                        removeMemberMutation.mutate({
                                          groupId: group.id,
                                          studentId: member.studentId,
                                        })
                                      }
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </Tooltip>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div
                            style={{
                              padding: '1rem',
                              border: '1px dashed #cbd5e1',
                              borderRadius: '6px',
                              textAlign: 'center',
                              color: '#94a3b8',
                              fontSize: '0.75rem',
                            }}
                          >
                            {t('groupWorkspace.noMembersDragHint')}
                          </div>
                        )}
                      </div>

                      {/* Rule Evaluation Summary */}
                      <div className="workspace-rule-summary"
                        style={{
                          backgroundColor: '#f8fafc',
                          borderRadius: '6px',
                          padding: '8px 10px',
                          border: '1px solid #f1f5f9',
                          fontSize: '0.75rem',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            userSelect: 'none',
                          }}
                          onClick={() => toggleRules(group.id)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {group.allRulesPassed ? (
                              <CheckCircle size={14} color="#10b981" />
                            ) : (
                              <AlertTriangle size={14} color="#f59e0b" />
                            )}
                            <span style={{ fontWeight: 600, color: group.allRulesPassed ? '#059669' : '#d97706' }}>
                              {group.allRulesPassed
                                ? t('groupWorkspace.allRulesPassed')
                                : t('groupWorkspace.someRulesViolated')}
                            </span>
                          </div>
                          {isRulesExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </div>

                        {/* Expanded Rules Details */}
                        {isRulesExpanded && group.ruleEvaluations && (
                          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {group.ruleEvaluations.map((ev, idx) => (
                              <div
                                key={idx}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  color: ev.passed ? '#059669' : ev.hardRule ? '#dc2626' : '#d97706',
                                  fontSize: '0.6875rem',
                                }}
                              >
                                <span>{t(`studentGroup.rules.${ev.code}_${ev.passed ? 'passed' : 'failed'}`, { actual: ev.actualValue, target: ev.targetValue })}</span>
                                <span style={{ fontWeight: 600 }}>
                                  {ev.actualValue}/{ev.targetValue} {ev.passed ? '✓' : '✗'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Actions Toolbar */}
                      <div className="workspace-group-actions">
                        {/* Approval Actions */}
                        <div className="workspace-review-actions">
                          {group.status === 'PENDING' ? (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => acceptGroupMutation.mutate(group.id)}
                              loading={acceptGroupMutation.isPending}
                            >
                              {t('groupWorkspace.approve')}
                            </Button>
                          ) : group.status === 'ACCEPTED' && canUnlock ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => revokeGroupMutation.mutate(group.id)}
                              loading={revokeGroupMutation.isPending}
                            >
                              {t('groupLifecycle.unlock')}
                            </Button>
                          ) : null}
                          {canEditGroup(group) && <Button size="sm" variant="secondary" loading={submitReviewMutation.isPending} onClick={() => submitReviewMutation.mutate(group.id)}>{t('groupLifecycle.submit')}</Button>}

                          {group.status === 'PENDING' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              style={{ color: '#dc2626' }}
                              onClick={() => setRejectingGroupId(group.id)}
                            >
                              {t('groupWorkspace.reject')}
                            </Button>
                          )}
                        </div>

                        {/* Disband Button */}
                        <Button
                          size="sm"
                          variant="ghost"
                          style={{ color: '#ef4444' }}
                          icon={<Trash2 size={13} />}
                          disabled={!canEditGroup(group)}
                          onClick={() => confirmDisband(group)}
                          title={t('groupWorkspace.disband')}
                        >
                          {t('groupWorkspace.disband')}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        </fieldset>
      )}

      <p className="alert alert-info">{t('groupLifecycle.draftNotice')}</p>
      {/* Modal: Giảng viên Tạo & Phân Công Nhóm */}
      <LecturerGroupModal
        key={`${selectedClassId}-${selectedDeadlineId}-${initialStudentIds.join('-')}`}
        initialStudentIds={initialStudentIds}
        open={isCreateModalOpen && canManage}
        unassignedStudents={workspace?.unassignedStudents || []}
        rules={workspace?.rules || []}
        maxMembers={maxMembers}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={async (data) => {
          await createGroupMutation.mutateAsync(data);
        }}
        isLoading={createGroupMutation.isPending}
      />

      {/* Modal: Từ Chối Nhóm */}
      <RejectGroupModal
        open={rejectingGroupId !== null && canManage}
        groupId={rejectingGroupId}
        onClose={() => setRejectingGroupId(null)}
        onSubmit={async (groupId, reason) => {
          await groupApi.rejectGroup(selectedDeadlineId!, selectedClassId!, groupId, { reason });
          message.warning(t('groupWorkspace.messages.rejectSuccess'));
          invalidateCurrentWorkspace();
        }}
      />
    </div>
  );
};
