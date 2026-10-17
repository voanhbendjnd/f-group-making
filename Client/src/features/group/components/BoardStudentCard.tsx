import type { DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropdown, type MenuProps } from 'antd';
import { Crown, GripVertical, MoreHorizontal } from 'lucide-react';
import type { GroupDTO, GroupMemberDTO } from '../types/groupTypes';
import { StudentProfilePopover } from './StudentProfilePopover';

interface Props {
  student: GroupMemberDTO;
  source: GroupDTO | null;
  targets: GroupDTO[];
  editable: boolean;
  pending: boolean;
  dragging: boolean;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onMove: (targetId: number) => void;
  onRemove?: () => void;
  onSetLeader?: () => void;
}

export function BoardStudentCard({ student, source, targets, editable, pending, dragging,
  onDragStart, onDragEnd, onMove, onRemove, onSetLeader }: Props) {
  const { t } = useTranslation();
  const items: MenuProps['items'] = [];
  if (source && student.role !== 'LEADER' && onSetLeader) {
    items.push({ key: 'leader', label: t('groupWorkspace.makeLeader'), onClick: onSetLeader });
  }
  items.push({ key: 'move', label: t('groupBoard.moveTo'), children: targets.length ? targets.map(group => ({
    key: String(group.id), label: group.name, disabled: group.memberCount >= group.maxMembers,
    onClick: () => onMove(group.id),
  })) : [{ key: 'none', label: t('groupBoard.noTargets'), disabled: true }] });
  if (source && onRemove) items.push({ key: 'remove', label: t('groupWorkspace.removeFromGroup'), onClick: onRemove });
  return <div className={`board-student draggable-student-card ${dragging ? 'is-dragging' : ''}`}
    data-student-id={student.studentId} draggable={editable && !pending}
    onDragStart={onDragStart} onDragEnd={onDragEnd}>
    <GripVertical size={15} className="board-grip" aria-hidden="true" />
    <StudentProfilePopover student={student} placement="top">
      <div className="board-student-identity" style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <strong title={student.fullName}>{student.fullName}</strong>
          {typeof student.matchScore === 'number' && student.matchScore > 0 && (
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                color: '#15803d',
                backgroundColor: '#dcfce7',
                borderRadius: 4,
                padding: '0 4px',
                lineHeight: '16px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              ✨ {student.matchScore}%
            </span>
          )}
        </div>
        <span>{student.rollNumber}</span>
      </div>
    </StudentProfilePopover>
    {source && student.role === 'LEADER' && <Crown size={15} className="board-leader" aria-label={t('groupWorkspace.leader')} />}
    <span className="board-major">{student.majorCode || t('groupReview.missing')}</span>
    {editable && <Dropdown trigger={['click']} menu={{ items, style: { maxHeight: 320, overflowY: 'auto' } }}>
      <button type="button" className="board-icon-button" disabled={pending}
        aria-label={t('groupBoard.studentActions', { name: student.fullName })}>
        <MoreHorizontal size={17} />
      </button>
    </Dropdown>}
  </div>;
}
