import { useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ChevronDown, ChevronUp, LockKeyhole, MoreHorizontal, AlertTriangle, Sparkles, Plus, GripVertical } from 'lucide-react';
import { Dropdown } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/common/Button';
import { groupApi } from '../api/groupApi';
import type { GroupDTO, GroupMemberDTO } from '../types/groupTypes';
import { BoardStudentCard } from './BoardStudentCard';
import { StudentProfilePopover } from './StudentProfilePopover';

interface Props {
  deadlineId?: number | null;
  classId?: number | null;
  group: GroupDTO;
  unassignedStudents: GroupMemberDTO[];
  targets: GroupDTO[];
  editable: boolean;
  canManage: boolean;
  canUnlock: boolean;
  pending: boolean;
  dragOver: boolean;
  draggedId: number | null;
  onDragStart: (event: DragEvent<HTMLDivElement>, student: GroupMemberDTO, sourceId: number | null) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onMove: (studentId: number, targetId: number) => void;
  onRemove: (studentId: number) => void;
  onSetLeader: (studentId: number) => void;
  onAddMember?: (studentId: number) => void;
  onSubmit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onUnlock: () => void;
  onDisband: () => void;
}

export function GroupBoardColumn(props: Props) {
  const { t } = useTranslation();
  const [details, setDetails] = useState(false);
  const [showRecs, setShowRecs] = useState(false);
  const { group, pending } = props;

  const { data: recommendations = [], isLoading: isRecsLoading } = useQuery({
    queryKey: ['recommended-students-group', props.deadlineId, props.classId, group.id],
    queryFn: ({ signal }) =>
      props.deadlineId && props.classId && groupApi.getRecommendedStudents
        ? groupApi.getRecommendedStudents(props.deadlineId, props.classId, group.id, signal)
        : Promise.resolve([]),
    enabled: showRecs && !!props.deadlineId && !!props.classId && props.editable,
    staleTime: 10000,
  });
  // Workspace updates (including optimistic moves) remove assigned students immediately,
  // even while a recommendation request is still returning an older snapshot.
  const unassignedIds = new Set(props.unassignedStudents.map(student => student.studentId));
  const availableRecommendations = recommendations.filter(student => unassignedIds.has(student.studentId));

  return (
    <section
      className={`group-board-column group-card-dropzone ${props.dragOver ? 'is-drag-over' : ''}`}
      data-group-id={group.id}
      aria-label={group.name}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
    >
      <header className="board-column-header">
        <div className="board-column-title">
          <h2>{group.name}</h2>
          <span className="board-member-count">
            {group.memberCount}
            {group.maxMembers < 2147483647 ? `/${group.maxMembers}` : ''}
          </span>
          {props.editable && (
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  {
                    key: 'disband',
                    danger: true,
                    label: t('groupWorkspace.disband'),
                    onClick: props.onDisband,
                  },
                ],
              }}
            >
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

      {/* Recommended students toggle for this group */}
      {props.editable && group.memberCount < group.maxMembers && (
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
            <div className="board-column-recommendations" data-board-scroll>
              {isRecsLoading ? (
                <div className="board-recs-loading">{t('common.loading', 'Đang tải gợi ý...')}</div>
              ) : availableRecommendations.length === 0 ? (
                <div className="board-recs-empty">{t('groupBoard.noSuggestions', 'Không có sinh viên phù hợp')}</div>
              ) : (
                availableRecommendations.map((student) => (
                  <div
                    key={student.studentId}
                    className={`board-student draggable-student-card board-rec-student ${
                      props.draggedId === student.studentId ? 'is-dragging' : ''
                    }`}
                    draggable={!pending}
                    onDragStart={(event) => props.onDragStart(event, student, null)}
                    onDragEnd={props.onDragEnd}
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
                    {props.onAddMember && (
                      <button
                        type="button"
                        className="board-icon-button board-rec-add-btn"
                        title={t('groupBoard.quickAddMember', 'Thêm nhanh vào nhóm')}
                        disabled={pending}
                        onClick={() => props.onAddMember!(student.studentId)}
                      >
                        <Plus size={15} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <div className="board-column-students" data-board-scroll>
        {group.members.map((student) => (
          <BoardStudentCard
            key={student.studentId}
            student={student}
            source={group}
            targets={props.targets.filter((target) => target.id !== group.id)}
            editable={props.editable}
            pending={pending}
            dragging={props.draggedId === student.studentId}
            onDragStart={(event) => props.onDragStart(event, student, group.id)}
            onDragEnd={props.onDragEnd}
            onMove={(targetId) => props.onMove(student.studentId, targetId)}
            onRemove={() => props.onRemove(student.studentId)}
            onSetLeader={() => props.onSetLeader(student.studentId)}
          />
        ))}
        {props.editable && <p className="board-drop-hint">{t('groupBoard.dropHere')}</p>}
      </div>

      <footer className="board-column-footer">
        <button
          type="button"
          className={`board-rule-toggle ${group.allRulesPassed ? 'is-valid' : ''}`}
          aria-expanded={details}
          onClick={() => setDetails((value) => !value)}
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
            {group.ruleEvaluations.map((rule) => (
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
          {props.editable && (
            <Button size="sm" disabled={pending} onClick={props.onSubmit}>
              {t('groupLifecycle.submit')}
            </Button>
          )}
          {props.canManage && group.status === 'PENDING' && (
            <>
              <Button size="sm" disabled={pending || !group.allRulesPassed} onClick={props.onApprove}>
                {t('groupWorkspace.approve')}
              </Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={props.onReject}>
                {t('groupWorkspace.reject')}
              </Button>
            </>
          )}
          {props.canUnlock && group.status === 'ACCEPTED' && (
            <Button size="sm" variant="secondary" disabled={pending} onClick={props.onUnlock}>
              {t('groupLifecycle.unlock')}
            </Button>
          )}
        </div>
      </footer>
    </section>
  );
}
