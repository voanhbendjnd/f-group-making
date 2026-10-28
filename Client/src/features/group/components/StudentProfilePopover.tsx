import React from 'react';
import { Popover, Tag, Avatar } from 'antd';
import { Quote, Mail, Crown, User, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface StudentProfilePopoverProps {
  student: {
    studentId?: number;
    fullName?: string | null;
    rollNumber?: string | null;
    memberCode?: string | null;
    majorCode?: string | null;
    majorName?: string | null;
    role?: 'LEADER' | 'MEMBER' | string;
    selfDescription?: string | null;
    email?: string | null;
    matchScore?: number;
    matchReasons?: string[];
  };
  children: React.ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'topLeft' | 'topRight';
}

const getMajorColor = (majorCode?: string | null) => {
  if (!majorCode) return 'default';
  const code = majorCode.toUpperCase().trim();
  switch (code) {
    case 'SE':
      return 'geekblue';
    case 'GD':
      return 'purple';
    case 'IA':
      return 'cyan';
    case 'IB':
      return 'orange';
    case 'MC':
      return 'magenta';
    case 'MKT':
      return 'volcano';
    default:
      return 'blue';
  }
};

export const StudentProfilePopover: React.FC<StudentProfilePopoverProps> = React.memo(({
  student,
  children,
  placement = 'top',
}) => {
  const { t } = useTranslation();

  const fullName = student.fullName || t('studentProfile.unavailable', 'N/A');
  const initial = fullName.charAt(0).toUpperCase();
  const isLeader = student.role === 'LEADER';

  const content = (
    <div style={{ maxWidth: 300, padding: '4px' }}>
      {/* Header with Avatar & Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <Avatar
          size={46}
          style={{
            backgroundColor: isLeader ? '#f59e0b' : 'var(--color-primary, #2563eb)',
            fontWeight: 700,
            fontSize: '1.1rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            flexShrink: 0,
          }}
        >
          {initial}
        </Avatar>
        <div style={{ overflow: 'hidden' }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: '0.95rem',
              color: 'var(--color-text-main, #0f172a)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {fullName}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            {student.rollNumber || ''} {student.memberCode ? `• ${student.memberCode}` : ''}
          </div>
        </div>
      </div>

      {/* Badges for Major & Role */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {student.majorCode && (
          <Tag color={getMajorColor(student.majorCode)} style={{ margin: 0, fontWeight: 600 }}>
            {student.majorCode}
            {student.majorName ? ` - ${student.majorName}` : ''}
          </Tag>
        )}
        {isLeader ? (
          <Tag
            color="gold"
            icon={<Crown size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
            style={{ margin: 0, fontWeight: 600 }}
          >
            {t('studentGroup.role.leader', 'Trưởng nhóm')}
          </Tag>
        ) : student.role === 'MEMBER' ? (
          <Tag
            color="default"
            icon={<User size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
            style={{ margin: 0 }}
          >
            {t('studentGroup.role.member', 'Thành viên')}
          </Tag>
        ) : null}
      </div>

      {/* Match Score & Reasons if available */}
      {typeof student.matchScore === 'number' && student.matchScore > 0 && (
        <div
          style={{
            marginBottom: 10,
            padding: '8px 10px',
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 6,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Sparkles size={13} />
              {t('studentGroup.recommendation.matchScore', 'Độ phù hợp: {{score}}%', { score: student.matchScore })}
            </span>
          </div>
          {student.matchReasons && student.matchReasons.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: '0.75rem', color: '#15803d' }}>
              {student.matchReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Self-Description / Bio Box */}
      <div
        style={{
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: '10px 12px',
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.75rem',
            fontWeight: 600,
            color: '#64748b',
            marginBottom: 4,
          }}
        >
          <Quote size={13} style={{ color: 'var(--color-primary, #2563eb)' }} />
          <span>{t('studentGroup.bio.title', 'Mô tả bản thân')}</span>
        </div>
        {student.selfDescription && student.selfDescription.trim() ? (
          <p
            style={{
              margin: 0,
              fontSize: '0.8125rem',
              color: '#334155',
              lineHeight: 1.5,
              whiteSpace: 'pre-line',
              wordBreak: 'break-word',
              fontStyle: 'italic',
            }}
          >
            "{student.selfDescription.trim()}"
          </p>
        ) : (
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
            {t('studentGroup.bio.emptyPlaceholder', 'Chưa cập nhật mô tả bản thân')}
          </span>
        )}
      </div>

      {/* Email Contact */}
      {student.email && (
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.75rem',
            color: '#64748b',
          }}
        >
          <Mail size={12} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {student.email}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <Popover
      content={content}
      placement={placement}
      trigger={['hover', 'click']}
      arrow={{ pointAtCenter: true }}
      overlayInnerStyle={{ padding: 12, borderRadius: 10 }}
    >
      <span style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
        {children}
      </span>
    </Popover>
  );
});
