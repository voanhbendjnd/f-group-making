import React, { useMemo, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  LockKeyhole,
  MoreHorizontal,
  AlertTriangle,
  Sparkles,
  Plus,
  GripVertical,
} from 'lucide-react';
import { Dropdown } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { groupCode } from '../utils/groupSequence';
import { Button } from '@/components/common/Button';
import { groupApi } from '../api/groupApi';
import type { GroupDTO, GroupMemberDTO, WorkspaceDTO } from '../types/groupTypes';
import { BoardStudentCard } from './BoardStudentCard';
import { StudentProfilePopover } from './StudentProfilePopover';

interface Props {
  deadlineId?: number | null;
  classId?: number | null;
  group: GroupDTO;
  getTargets: () => GroupDTO[];
  pending?: boolean;
  editable: boolean;
  canManage: boolean;
  canUnlock: boolean;
  isSelected: boolean;
  onToggleSelect: (groupId: number, checked: boolean) => void;
  onDragStart: (event: DragEvent<HTMLElement>, student: GroupMemberDTO, sourceId: number | null) => void;
  onDragOverColumn: (event: DragEvent<HTMLElement>, groupId: number) => void;
  onDropColumn: (event: DragEvent<HTMLElement>, groupId: number) => void;
  onMoveStudent: (studentId: number, sourceId: number | null, targetId: number) => void;
  onRemoveMember: (groupId: number, studentId: number) => void;
  onSetGroupLeader: (groupId: number, studentId: number) => void;
  onAddGroupMember: (groupId: number, studentId: number) => void;
  onSubmitGroup: (groupId: number) => void;
  onApproveGroup: (groupId: number) => void;
  onRejectGroup: (groupId: number) => void;
  onUnlockGroup: (group: GroupDTO) => void;
  onDisbandGroup: (group: GroupDTO) => void;
}

/** Chỉ mount khi bật "Gợi ý": query + danh sách unassigned nằm ở đây, không làm cột re-render. */
const RecommendationPanel = React.memo(function RecommendationPanel({
  deadlineId,
  classId,
  groupId,
  onDragStart,
  onAdd,
}: {
  deadlineId?: number | null;
  classId?: number | null;
  groupId: number;
  onDragStart: Props['onDragStart'];
  onAdd: (groupId: number, studentId: number) => void;
}) {
  const { t } = useTranslation();

  const { data: recommendations = [], isLoading } = useQuery({
    queryKey: ['recommended-students-group', deadlineId, classId, groupId],
    queryFn: ({ signal }) =>
      deadlineId && classId && groupApi.getRecommendedStudents
        ? groupApi.getRecommendedStudents(deadlineId, classId, groupId, signal)
        : Promise.resolve([]),
    enabled: !!deadlineId && !!classId,
    staleTime: 10000,
  });

  const { data: unassigned = [] } = useQuery<WorkspaceDTO, Error, GroupMemberDTO[]>({
    queryKey: ['group-workspace', deadlineId, classId],
    // This observer shares the board's query. Keep its fetch function valid:
    // React Query may use these options for an explicit cache invalidation.
    queryFn: ({ signal }) => groupApi.getWorkspace(deadlineId!, classId!, signal),
    enabled: false,
    select: (d) => d.unassignedStudents,
  });

  const available = useMemo(() => {
    const ids = new Set(unassigned.map((s) => s.studentId));
    return recommendations.filter((s) => ids.has(s.studentId));
  }, [recommendations, unassigned]);

  return (
    <div className="board-column-recommendations" data-board-scroll>
      {isLoading ? (
        <div className="board-recs-loading">{t('common.loading', 'Đang tải gợi ý...')}</div>
      ) : available.length === 0 ? (
        <div className="board-recs-empty">{t('groupBoard.noSuggestions', 'Không có sinh viên phù hợp')}</div>
      ) : (
        available.map((student) => (
          <div
            key={student.studentId}
            className="board-student draggable-student-card board-rec-student"
            draggable
            onDragStart={(event) => onDragStart(event, student, null)}
          >
            <GripVertical size={14} className="board-grip" aria-hidden="true" />
            <StudentProfilePopover student={student} placement="top">
              <div className="board-student-identity" style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <strong title={student.fullName}>{student.fullName}</strong>
                  {typeof student.matchScore === 'number' && student.matchScore > 0 && (
                    <span className="board-rec-badge">{student.matchScore}%</span>
                  )}
                </div>
                <span>{student.rollNumber}</span>
              </div>
            </StudentProfilePopover>
            <span className="board-major">{student.majorCode || t('groupReview.missing')}</span>
            <button
              type="button"
              className="board-icon-button board-rec-add-btn"
              title={t('groupBoard.quickAddMember', 'Thêm nhanh vào nhóm')}
              onClick={() => onAdd(groupId, student.studentId)}
            >
              <Plus size={15} />
            </button>
          </div>
        ))
      )}
    </div>
  );
});

export const GroupBoardColumn = React.memo(function GroupBoardColumn({
  deadlineId,
  classId,
  group,
  getTargets,
  pending,
  editable,
  canManage,
  canUnlock,
  isSelected,
  onToggleSelect,
  onDragStart,
  onDragOverColumn,
  onDropColumn,
  onMoveStudent,
  onRemoveMember,
  onSetGroupLeader,
  onAddGroupMember,
  onSubmitGroup,
  onApproveGroup,
  onRejectGroup,
  onUnlockGroup,
  onDisbandGroup,
}: Props) {
  const { t } = useTranslation();
  const [details, setDetails] = useState(false);
  const [showRecs, setShowRecs] = useState(false);
  const code = groupCode(group);

  const menuItems = useMemo(
    () => [{ key: 'disband', danger: true, label: t('groupWorkspace.disband'), onClick: () => onDisbandGroup(group) }],
    [t, group, onDisbandGroup]
  );

  return (
    <section
      className={`group-board-column group-card-dropzone ${isSelected ? 'is-selected' : ''}`}
      data-group-id={group.id}
      aria-label={group.name}
      onDragOver={(e) => onDragOverColumn(e, group.id)}
      onDrop={(e) => onDropColumn(e, group.id)}
    >
      <header className="board-column-header">
        <div className="board-column-title">
          {canManage && (
            <input
              type="checkbox"
              className="board-group-select-checkbox"
              checked={isSelected}
              disabled={pending}
              onChange={(e) => onToggleSelect(group.id, e.target.checked)}
              title={t('groupWorkspace.selectToDisband')}
              aria-label={t('groupWorkspace.selectGroup', { name: group.name })}
            />
          )}
          {code && <span className="board-group-code">{code}</span>}
          <h2>{group.name}</h2>
          <span className="board-member-count">
            {group.memberCount}
            {group.maxMembers < 2147483647 ? `/${group.maxMembers}` : ''}
          </span>
          {editable && (
            <Dropdown trigger={['click']} menu={{ items: menuItems }}>
              <button
                className="board-icon-button"
                type="button"
                disabled={pending}
                aria-label={t('groupBoard.groupActions', { name: group.name })}
              >
                <MoreHorizontal size={18} />
              </button>
            </Dropdown>
          )}
        </div>
        <span
          className={`badge ${
            group.status === 'ACCEPTED'
              ? 'badge-success'
              : group.status === 'PENDING'
              ? 'badge-info'
              : 'badge-neutral'
          }`}
        >
          {t(`groupReview.statuses.${group.status}`)}
        </span>
        {group.status === 'ACCEPTED' && (
          <p className="board-lock-hint">
            <LockKeyhole size={13} />
            {t('groupBoard.locked')}
          </p>
        )}
      </header>

      {editable && group.memberCount < group.maxMembers && (
        <div className="board-column-recommendation-bar">
          <button
            type="button"
            className={`board-suggest-toggle-btn ${showRecs ? 'is-active' : ''}`}
            onClick={() => setShowRecs((prev) => !prev)}
            aria-expanded={showRecs}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Sparkles size={13} className="sparkle-icon" />
              <span>{t('groupBoard.suggestMembers', 'Gợi ý thành viên')}</span>
            </span>
            <span className="toggle-chevron">{showRecs ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</span>
          </button>
          {showRecs && (
            <RecommendationPanel
              deadlineId={deadlineId}
              classId={classId}
              groupId={group.id}
              onDragStart={onDragStart}
              onAdd={onAddGroupMember}
            />
          )}
        </div>
      )}

      <div className="board-column-students" data-board-scroll>
        {group.members.map((student) => (
          <BoardStudentCard
            key={student.studentId}
            student={student}
            sourceId={group.id}
            getTargets={getTargets}
            editable={editable}
            onDragStart={onDragStart}
            onMove={onMoveStudent}
            onRemove={onRemoveMember}
            onSetLeader={onSetGroupLeader}
          />
        ))}
        {editable && <p className="board-drop-hint">{t('groupBoard.dropHere')}</p>}
      </div>

      <footer className="board-column-footer">
        <button
          type="button"
          className={`board-rule-toggle ${group.allRulesPassed ? 'is-valid' : ''}`}
          aria-expanded={details}
          onClick={() => setDetails((v) => !v)}
        >
          {group.allRulesPassed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          <span>
            {t(group.allRulesPassed ? 'groupWorkspace.allRulesPassed' : 'groupWorkspace.someRulesViolated')}
          </span>
          {details ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {details && (
          <div className="board-rule-details">
            {group.rejectReason && <p>{group.rejectReason}</p>}
            {group.ruleEvaluations.filter((rule) => rule.code !== 'MAX_MAJORS_PER_GROUP').map((rule) => (
              <div key={rule.code}>
                <span>{t(`rules.codes.${rule.code}`)}</span>
                <strong className={rule.passed ? 'is-valid' : 'is-invalid'}>
                  {rule.actualValue} / {rule.targetValue}
                </strong>
              </div>
            ))}
          </div>
        )}
        <div className="board-column-actions">
          {editable && (
            <Button size="sm" disabled={pending} onClick={() => onSubmitGroup(group.id)}>
              {t('groupLifecycle.submit')}
            </Button>
          )}
          {canManage && group.status === 'PENDING' && (
            <>
              <Button size="sm" disabled={pending} onClick={() => onApproveGroup(group.id)}>
                {t('groupWorkspace.approve')}
              </Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => onRejectGroup(group.id)}>
                {t('groupWorkspace.reject')}
              </Button>
            </>
          )}
          {canUnlock && group.status === 'ACCEPTED' && (
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => onUnlockGroup(group)}>
              {t('groupLifecycle.unlock')}
            </Button>
          )}
        </div>
      </footer>
    </section>
  );
});
