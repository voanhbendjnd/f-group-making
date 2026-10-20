import React, { useState } from 'react';
import { Drawer, Input, Tag, Empty, Button } from 'antd';
import { Search, Users, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GroupMemberDTO } from '../types/groupTypes';
import { StudentProfilePopover } from './StudentProfilePopover';

interface UnassignedStudentsDrawerProps {
  open: boolean;
  students: GroupMemberDTO[];
  onClose: () => void;
  isLecturer?: boolean;
  onOpenLecturerCreate?: () => void;
}

export const UnassignedStudentsDrawer: React.FC<UnassignedStudentsDrawerProps> = ({
  open,
  students,
  onClose,
  isLecturer,
  onOpenLecturerCreate,
}) => {
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState('');

  const filtered = students.filter((s) => {
    const q = keyword.toLowerCase().trim();
    if (!q) return true;
    return (
      s.fullName.toLowerCase().includes(q) ||
      s.rollNumber.toLowerCase().includes(q) ||
      (s.majorCode && s.majorCode.toLowerCase().includes(q))
    );
  });

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={18} color="var(--color-primary, #2563eb)" />
          <span>{t('studentGroup.unassignedDrawer.title', { count: students.length })}</span>
        </div>
      }
      placement="right"
      width="min(100vw, 400px)"
      onClose={onClose}
      open={open}
      extra={
        isLecturer && onOpenLecturerCreate ? (
          <Button
            type="primary"
            size="small"
            icon={<UserPlus size={14} />}
            onClick={() => {
              onClose();
              onOpenLecturerCreate();
            }}
          >
            {t('studentGroup.unassignedDrawer.createForStudents')}
          </Button>
        ) : null
      }
    >
      <div style={{ marginBottom: '1rem' }}>
        <Input
          prefix={<Search size={16} color="#94a3b8" />}
          placeholder={t('studentGroup.unassignedDrawer.searchPlaceholder')}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          allowClear
        />
      </div>

      {filtered.length === 0 ? (
        <Empty description={t('studentGroup.unassignedDrawer.empty')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map((s) => (
            <StudentProfilePopover key={s.studentId} student={s} placement="left">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  width: '100%',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-main, #0f172a)' }}>
                    {s.fullName}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #64748b)' }}>
                    {s.rollNumber} • {s.memberCode}
                  </div>
                </div>
                <Tag color={s.majorCode === 'SE' ? 'geekblue' : 'purple'}>
                  {s.majorCode || 'N/A'}
                </Tag>
              </div>
            </StudentProfilePopover>
          ))}
        </div>
      )}
    </Drawer>
  );
};
