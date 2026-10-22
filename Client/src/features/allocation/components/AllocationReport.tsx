import { Collapse, Table, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { memo } from 'react';
import type { AllocationReportData } from '../types';
import { AllocationRules, ScoreValue } from './AllocationGroups';

export const AllocationReport = memo(function AllocationReport({ report }: { report: AllocationReportData }) {
  const { t } = useTranslation();
  return <div className="allocation-report">
    <div className="allocation-metrics allocation-report-metrics">{[
      [t('allocation.totalGroups'), `${report.groupsBefore} → ${report.groupsAfter}`],
      [t('allocation.unassigned'), `${report.unassignedBefore} → ${report.unassignedAfter}`],
      [t('allocation.totalStudents'), `${report.studentsBefore} → ${report.studentsAfter}`],
      [t('allocation.allocated'), report.movements.filter(value => value.previouslyUnassigned).length],
    ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className="allocation-tags"><Tag>{t('allocation.keptCount', { count: report.keptGroupIds.length })}</Tag>
      <Tag color="blue">{t('allocation.createdCount', { count: report.createdGroupKeys?.length ?? report.createdGroupIds.length })}</Tag>
      <Tag color="warning">{t('allocation.disbandCount', { count: report.disbandedGroupIds.length })}</Tag>
      <Tag>{t('allocation.protectedCount', { count: report.protectedGroupIds.length })}</Tag></div>
    <Collapse items={[
      { key: 'movements', label: t('allocation.movements', { count: report.movements.length }), children:
        <Table size="small" rowKey="studentId" pagination={{ pageSize: 8, showSizeChanger: false }} scroll={{ x: 520 }} dataSource={report.movements} columns={[
          { title: t('allocation.student'), render: (_, row) => <><strong>{row.fullName}</strong><small className="allocation-block">{row.rollNumber}</small></> },
          { title: t('allocation.before'), render: (_, row) => row.previouslyUnassigned || row.fromGroupId === null ? t('allocation.unassigned') : row.fromGroupName || t('allocation.missing') },
          { title: t('allocation.after'), dataIndex: 'toGroupName' },
        ]} /> },
      { key: 'leaders', label: t('allocation.leaderChanges', { count: report.leaderChanges.length }), children:
        <ul className="allocation-reasons">{report.leaderChanges.map(change => <li key={change.planGroupKey ?? change.groupId}>
          <strong>{report.groupChanges.find(group => change.planGroupKey ? group.planGroupKey === change.planGroupKey || `group:${group.groupId}` === change.planGroupKey : group.groupId === change.groupId)?.name || t('allocation.missing')}</strong>: {change.previousLeaderName || t('allocation.missing')} → {change.leaderName || t('allocation.missing')}
        </li>)}</ul> },
      { key: 'groups', label: t('allocation.beforeAfter'), children:
        <Table size="small" rowKey={row => row.planGroupKey ?? String(row.groupId)} pagination={false} scroll={{ x: 520 }} dataSource={report.groupChanges} expandable={{ expandedRowRender: row => <div className="allocation-comparison">
          <div><h4>{t('allocation.before')}</h4><AllocationRules rules={row.rulesBefore} /></div>
          <div><h4>{t('allocation.after')}</h4>{row.disbanded ? <p>{t('allocation.disbanded')}</p> : <AllocationRules rules={row.rulesAfter} />}</div>
        </div> }} columns={[
          { title: t('allocation.group'), dataIndex: 'name' },
          { title: t('allocation.change'), render: (_, row) => <Tag color={row.disbanded ? 'warning' : 'blue'}>{t(row.protectedGroup ? 'allocation.protected' : row.newGroup ? 'allocation.newGroup' : row.disbanded ? 'allocation.disbanded' : 'allocation.kept')}</Tag> },
          { title: t('allocation.scoreBefore'), render: (_, row) => <ScoreValue score={row.scoreBefore} /> },
          { title: t('allocation.scoreAfter'), render: (_, row) => <ScoreValue score={row.scoreAfter} /> },
        ]} /> },
    ]} />
  </div>;
});
