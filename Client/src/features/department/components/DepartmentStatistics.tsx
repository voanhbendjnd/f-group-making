import { useTranslation } from 'react-i18next';
import { BookOpen, CheckCircle2, Clock, GraduationCap, Layers, Users, UserCheck, UserRound } from 'lucide-react';
import type { DepartmentStatistics as Statistics } from '../types';

export function DepartmentStatistics({ statistics, classes, lecturers }: { statistics: Statistics; classes?: number; lecturers?: number }) {
  const { t } = useTranslation();
  const metrics = classes === undefined ? [
    ['students', statistics.students, Users], ['activated', statistics.activatedStudents, UserCheck],
    ['grouped', statistics.groupedStudents, CheckCircle2], ['unassignedStudents', statistics.unassignedStudents, UserRound],
    ['groups', statistics.groups, Layers], ['pending', statistics.pendingGroups, Clock],
  ] as const : [
    ['classes', classes, BookOpen], ['lecturers', lecturers ?? 0, GraduationCap], ['students', statistics.students, Users],
    ['groups', statistics.groups, Layers], ['pending', statistics.pendingGroups, Clock], ['unassignedStudents', statistics.unassignedStudents, UserRound],
  ] as const;
  return <div className="department-metrics">{metrics.map(([key, value, Icon]) => <article className="card department-metric" key={key}>
    <span className={`department-metric-icon department-accent-${key}`} aria-hidden="true"><Icon size={22} /></span>
    <h2>{t(`departmentOverview.${key}`)}</h2><strong>{value.toLocaleString()}</strong>
  </article>)}</div>;
}

export function DepartmentProgress({ statistics }: { statistics: Statistics }) {
  const { t } = useTranslation();
  const percent = statistics.students ? Math.round(statistics.groupedStudents * 100 / statistics.students) : 0;
  const statuses = [
    ['OPEN', statistics.openGroups], ['PENDING', statistics.pendingGroups],
    ['ACCEPTED', statistics.acceptedGroups], ['REVOKED', statistics.revokedGroups],
  ] as const;
  return <div className="department-chart-grid">
    <section className="card department-panel"><h2>{t('departmentOverview.groupingProgress')}</h2>
      <div className="department-enrollment"><div className="department-ring" role="img" aria-label={t('departmentOverview.progressAria', { percent })}
        style={{ background: `conic-gradient(#6366f1 ${Math.max(0, Math.min(100, percent))}%, #e8edf8 0)` }}>
        <div><strong>{percent}%</strong><span>{t('departmentOverview.grouped')}</span></div>
      </div><dl><div><dt>{t('departmentOverview.grouped')}</dt><dd>{statistics.groupedStudents.toLocaleString()}</dd></div>
        <div><dt>{t('departmentOverview.unassignedStudents')}</dt><dd>{statistics.unassignedStudents.toLocaleString()}</dd></div></dl></div>
    </section>
    <section className="card department-panel"><h2>{t('departmentOverview.groupStatuses')}</h2>
      <div className="department-statuses">{statuses.map(([status, value]) => <div key={status}>
        <div><span>{t(`groupReview.statuses.${status}`)}</span><strong>{value.toLocaleString()}</strong></div>
        <progress className={`department-status-${status}`} max={Math.max(1, statistics.groups)} value={value}
          aria-label={t(`groupReview.statuses.${status}`)} />
      </div>)}</div>
    </section>
  </div>;
}
