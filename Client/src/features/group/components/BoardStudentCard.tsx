import React, { useMemo, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropdown, type MenuProps } from 'antd';
import { Crown, GripVertical, MoreHorizontal } from 'lucide-react';
import type { GroupDTO, GroupMemberDTO } from '../types/groupTypes';
import { StudentProfilePopover } from './StudentProfilePopover';

interface Props {
  student: GroupMemberDTO;
  sourceId: number | null;
  getTargets: () => GroupDTO[];
  editable: boolean;
  onDragStart: (event: DragEvent<HTMLDivElement>, student: GroupMemberDTO, sourceId: number | null) => void;
  onMove: (studentId: number, sourceId: number | null, targetId: number) => void;
  onRemove?: (groupId: number, studentId: number) => void;
  onSetLeader?: (groupId: number, studentId: number) => void;
}

export const BoardStudentCard = React.memo(function BoardStudentCard({
  student,
  sourceId,
  getTargets,
  editable,
  onDragStart,
  onMove,
  onRemove,
  onSetLeader,
}: Props) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const inGroup = sourceId !== null;

  // Chỉ build menu khi người dùng mở; đóng thì không tốn gì
  const items = useMemo<MenuProps['items']>(() => {
    if (!menuOpen) return [];
    const targets = getTargets().filter((g) => g.id !== sourceId);
    const list: NonNullable<MenuProps['items']> = [];
    if (inGroup && student.role !== 'LEADER' && onSetLeader) {
      list.push({
        key: 'leader',
        label: t('groupWorkspace.makeLeader'),
        onClick: () => onSetLeader(sourceId!, student.studentId),
      });
    }
    list.push({
      key: 'move',
      label: t('groupBoard.moveTo'),
      children: targets.length
        ? targets.map((group) => ({
            key: String(group.id),
            label: group.name,
            disabled: group.memberCount >= group.maxMembers,
            onClick: () => onMove(student.studentId, sourceId, group.id),
          }))
        : [{ key: 'none', label: t('groupBoard.noTargets'), disabled: true }],
    });
    if (inGroup && onRemove) {
      list.push({
        key: 'remove',
        label: t('groupWorkspace.removeFromGroup'),
        onClick: () => onRemove(sourceId!, student.studentId),
      });
    }
    return list;
  }, [menuOpen, getTargets, sourceId, inGroup, student.role, student.studentId, onSetLeader, onMove, onRemove, t]);

  return (
    <div
      className="board-student draggable-student-card"
      data-student-id={student.studentId}
      draggable={editable}
      onDragStart={(event) => onDragStart(event, student, sourceId)}
    >
      <GripVertical size={15} className="board-grip" aria-hidden="true" />
      <StudentProfilePopover student={student} placement="top">
        <div className="board-student-identity" style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <strong title={student.fullName}>{student.fullName}</strong>
            {typeof student.matchScore === 'number' && student.matchScore > 0 && (
              <span className="board-rec-badge">✨ {student.matchScore}%</span>
            )}
          </div>
          <span>{student.rollNumber}</span>
        </div>
      </StudentProfilePopover>
      {inGroup && student.role === 'LEADER' && (
        <Crown size={15} className="board-leader" aria-label={t('groupWorkspace.leader')} />
      )}
      <span className="board-major">{student.majorCode || t('groupReview.missing')}</span>
      {editable && (
        <Dropdown
          trigger={['click']}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          menu={{ items, style: { maxHeight: 320, overflowY: 'auto' } }}
        >
          <button
            type="button"
            className="board-icon-button"
            aria-label={t('groupBoard.studentActions', { name: student.fullName })}
          >
            <MoreHorizontal size={17} />
          </button>
        </Dropdown>
      )}
    </div>
  );
});
