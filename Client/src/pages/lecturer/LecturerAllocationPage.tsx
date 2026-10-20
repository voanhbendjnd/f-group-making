import { useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, ConfigProvider, Empty, Input, Modal, Pagination, Skeleton, Tabs, Tag } from 'antd';
import viVN from 'antd/locale/vi_VN';
import enUS from 'antd/locale/en_US';
import { ArrowLeft, ArrowRight, BookOpen, Eye, Layers, RefreshCw, ShieldCheck, Sparkles, Target, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/providers/AuthContext';
import { useTerm } from '@/app/providers/TermContext';
import { TermScope } from '@/features/terms/components/TermScope';
import { PageHeader } from '@/components/common/PageHeader';
import { classApi } from '@/features/classes/api/classApi';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import { positiveId } from '@/features/group/navigation';
import { useAllocationFlow } from '@/features/allocation/hooks/useAllocationFlow';
import { AllocationGroups, AllocationReasons } from '@/features/allocation/components/AllocationGroups';
import { AllocationReport } from '@/features/allocation/components/AllocationReport';
import { AllocationPlanHistory } from '@/features/allocation/components/AllocationPlanHistory';
import { allocationErrorKey } from '@/features/allocation/utils';
import './LecturerAllocationPage.css';

export function LecturerAllocationPage() {
  const { selectedTermId } = useTerm();
  const { i18n } = useTranslation();
  return <ConfigProvider locale={i18n.language.startsWith('vi') ? viVN : enUS}><TermScope><AllocationClassSelection key={selectedTermId} /></TermScope></ConfigProvider>;
}
function AllocationClassSelection() {
  const { t } = useTranslation(); const { user, isAdmin } = useAuth(); const { selectedTermId, isLocked } = useTerm();
  const [params] = useSearchParams(); const route = useParams(); const navigate = useNavigate();
  const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const requestedClass = positiveId(route.classId ?? null);
  const classes = useQuery({ queryKey: ['my-school-classes', user?.id, selectedTermId, 'allocation'], retry: false,
    queryFn: async ({ signal }) => {
      const first = await classApi.getMyClasses({ termId: selectedTermId!, size: 50 }, signal);
      const result = [...first.result];
      for (let page = 2; page <= first.meta.pages; page++) result.push(...(await classApi.getMyClasses({ termId: selectedTermId!, size: 50, page }, signal)).result);
      return result.filter(value => value.termId === selectedTermId && (isAdmin || value.lecturerId === user?.id));
    } });
  const selected = classes.data?.find(value => value.id === requestedClass);
  const filtered = classes.data?.filter(value => value.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) ?? [];
  // Preserve old bookmarked query URLs while using the new list/detail routes.
  const legacyClass = positiveId(params.get('classId'));
  if (!route.classId && legacyClass && (!params.has('termId') || positiveId(params.get('termId')) === selectedTermId))
    return <Navigate replace to={`/lecturer/automatic-allocation/${legacyClass}`} />;
  return <div className="allocation-page">
    {route.classId && <Button className="allocation-back" disabled={isLocked} icon={<ArrowLeft size={16} />} onClick={() => navigate('/lecturer/automatic-allocation')}>{t('allocation.backToClasses')}</Button>}
    <PageHeader title={t('allocation.title')} description={t('allocation.description')} />
    {route.classId && <ol className="allocation-steps" aria-label={t('allocation.howItWorks')}>
      {[Eye, Target, Layers, ShieldCheck].map((Icon, index) => <li key={index}><span className="allocation-step-icon"><Icon size={20} aria-hidden="true" /></span>
        <div><strong>{t(`allocation.steps.${index}.title`)}</strong><p>{t(`allocation.steps.${index}.description`)}</p></div></li>)}
    </ol>}
    {!route.classId && <section className="allocation-class-search"><div><h2>{t('allocation.classList')}</h2><p className="allocation-muted">{t('allocation.classHint')}</p></div>
      <Input.Search aria-label={t('allocation.searchClasses')} placeholder={t('allocation.searchClasses')} value={search} allowClear onChange={event => { setSearch(event.target.value); setPage(1); }} />
    </section>}
    {classes.isError && <AllocationError error={classes.error} retry={() => void classes.refetch()} />}
    {classes.isPending ? <Skeleton active /> : !classes.isError && (route.classId
      ? selected ? <AllocationSession key={selected.id} classId={selected.id} /> : <Empty description={t('allocation.classUnavailable')} />
      : filtered.length ? <><div className="allocation-class-grid">{filtered.slice((page - 1) * 9, page * 9).map(value => <article className="allocation-panel allocation-class-card" key={value.id}>
        <div className="allocation-class-icon"><BookOpen size={24} aria-hidden="true" /></div><h3>{value.name}</h3>
        <div className="allocation-tags"><Tag>{value.termName || t('allocation.missing')}</Tag><span className="allocation-muted"><Users size={14} aria-hidden="true" /> {t('allocation.members', { count: value.studentCount })}</span></div>
        <Button type="primary" disabled={isLocked} icon={<ArrowRight size={16} />} onClick={() => navigate(`/lecturer/automatic-allocation/${value.id}`)}>{t('allocation.openClass')}</Button>
      </article>)}</div><Pagination current={page} pageSize={9} total={filtered.length} showSizeChanger={false} onChange={setPage} /></>
      : <Empty description={t('allocation.noClasses')} />)}
  </div>;
}
function AllocationSession({ classId }: { classId: number }) {
  const { t } = useTranslation(); const { user } = useAuth(); const { selectedTermId } = useTerm();
  const session = useQuery({ queryKey: ['allocation-sessions', user?.id, classId, selectedTermId], retry: false, refetchInterval: 30000,
    queryFn: async ({ signal }) => {
      const first = await deadlineApi.getDeadlines({ termId: selectedTermId!, size: 50 }, signal);
      const values = [...first.result];
      for (let page = 2; page <= first.meta.pages; page++) values.push(...(await deadlineApi.getDeadlines({ page, termId: selectedTermId!, size: 50 }, signal)).result);
      const matches = values.filter(value => value.schoolClassIds.includes(classId));
      if (matches.length > 1) throw { status: 409, message: '', errorKey: 'allocationMultipleSessions' };
      return matches[0]?.id ?? null;
    } });
  if (session.isPending) return <Skeleton active />;
  if (session.isError) return <AllocationError error={session.error} retry={() => void session.refetch()} />;
  if (!session.data) return <Empty description={t('allocation.noSession')} />;
  return <AllocationWorkspace key={`${classId}:${session.data}`} classId={classId} deadlineId={session.data} />;
}
export function AllocationError({ error, retry }: { error: unknown; retry?: () => void }) {
  const { t } = useTranslation();
  return <Alert type="error" showIcon title={t(`allocation.errors.${allocationErrorKey(error)}`, { defaultValue: t('allocation.errors.other') })}
    action={retry && <Button onClick={retry}>{t('allocation.retry')}</Button>} />;
}
function AllocationWorkspace({ classId, deadlineId }: { classId: number; deadlineId: number }) {
  const { t } = useTranslation(); const flow = useAllocationFlow(classId, deadlineId);
  const [confirming, setConfirming] = useState(false);
  const data = flow.overview.data; const setup = flow.setup.data;
  const report = flow.preview?.report;
  if (flow.overview.isPending) return <Skeleton active />;
  if (flow.overview.isError || !data) return <AllocationError error={flow.overview.error} retry={() => void flow.refresh()} />;
  const metrics = [
    ['totalStudents', data.summary.totalStudents], ['totalGroups', data.summary.totalGroups], ['valid', data.summary.validGroups],
    ['invalid', data.summary.invalidGroups], ['unassigned', data.summary.unassignedStudents], ['protected', data.summary.protectedGroups],
  ] as const;
  const confirm = async () => { await flow.confirmApply(); setConfirming(false); };
  return <>
    <section className="allocation-panel">
      <div className="allocation-heading"><div><h2>{data.scope.className}</h2><p>{data.scope.deadlineName} · {t(`allocation.deadlineStatus.${data.scope.deadlineStatus}`, { defaultValue: t('allocation.missing') })}</p></div>
        <div className="allocation-actions"><Button icon={<RefreshCw size={16} />} loading={flow.overview.isFetching} onClick={() => void flow.refresh()}>{t('allocation.refresh')}</Button>
          <Button type="primary" icon={<Sparkles size={16} />} disabled={!!flow.attempt || flow.applying} onClick={() => flow.start()}>{t('allocation.autoAllocate')}</Button></div>
      </div>
      <div className="allocation-metrics">{metrics.map(([label, value]) => <div key={label}><span>{t(`allocation.${label}`)}</span><strong>{value}</strong></div>)}</div>
      <div className="allocation-tags">{data.rules.filter(rule => rule.status).map(rule => <Tag key={rule.code}>{t(`classRules.names.${rule.code}`, { defaultValue: t(`allocation.ruleNames.${rule.code}`) })}: {rule.value}</Tag>)}</div>
      <AllocationReasons reasons={data.warnings} />
    </section>
    {flow.applied && <Alert type="success" showIcon title={t('allocation.runSuccess', { id: flow.applied.runId, count: flow.applied.approvedGroupIds.length })} />}
    {flow.attempt && <Alert type={flow.applying ? 'info' : 'warning'} showIcon title={t(flow.applying ? 'allocation.applying' : 'allocation.unknownTitle')} description={t(flow.applying ? 'allocation.waitForApply' : 'allocation.unknownHint')}
      action={<Button loading={flow.applying} onClick={() => void flow.confirmApply()}>{t('allocation.retrySameRequest')}</Button>} />}
    {flow.applyError !== null && <AllocationError error={flow.applyError} />}
    {flow.configuring && <section className="allocation-panel allocation-setup" aria-label={t('allocation.setup')}>
      <div className="allocation-heading"><div><h2>{t('allocation.setup')}</h2><p>{t('allocation.preliminaryHint')}</p></div><Tag>{t('allocation.previewOnly')}</Tag></div>
      {flow.setup.isPending ? <Skeleton active /> : flow.setup.isError ? <AllocationError error={flow.setup.error} retry={() => void flow.setup.refetch()} /> : setup && <>
        <div className="allocation-setup-grid">
          <div className="allocation-range"><span>{t('allocation.range')}</span><strong>{setup.range.minimum <= setup.range.maximum ? `${setup.range.minimum}–${setup.range.maximum}` : t('allocation.noRange')}</strong>
            <small>{t('allocation.protectedCount', { count: setup.range.protectedGroups })}</small></div>
          <div className="allocation-suggestion"><strong>{setup.suggestion.status === 'FEASIBLE' && setup.suggestion.suggestedCount !== null ? t('allocation.suggested', { count: setup.suggestion.suggestedCount }) : t('allocation.noSuggestion')}</strong>
            <AllocationReasons reasons={setup.suggestion.reasons} /></div>
          <div><label htmlFor="allocation-target">{t('allocation.target')}</label>
            <Input id="allocation-target" aria-label={t('allocation.target')} inputMode="numeric" pattern="[0-9]*" value={flow.target}
              disabled={!!flow.attempt || flow.applying || setup.range.minimum > setup.range.maximum} status={flow.target && flow.parsedTarget === null ? 'error' : undefined}
              aria-invalid={!!flow.target && flow.parsedTarget === null} aria-describedby="allocation-target-help"
              onChange={event => flow.changeTarget(event.target.value)} />
            <small id="allocation-target-help" className="allocation-block">{t(flow.target && flow.parsedTarget === null ? 'allocation.invalidTarget' : 'allocation.targetHint', { min: setup.range.minimum, max: setup.range.maximum })}</small>
            <Button type="primary" className="allocation-confirm-target" disabled={flow.parsedTarget === null || !!flow.attempt || flow.applying || flow.previewLoading} loading={flow.previewLoading} onClick={() => void flow.confirmTarget()}>{t('allocation.confirmTarget')}</Button>
          </div>
        </div>
        <AllocationReasons reasons={[...setup.range.reasons, ...setup.warnings]} />
        <p className="allocation-muted">{t('allocation.balanceHint')}</p>
        <p className="allocation-muted">{t('allocation.searchLimits', { nodes: setup.limits.maximumSearchNodes, depth: setup.limits.maximumSearchDepth })}</p>
        {flow.previewLoading && <div role="status" aria-label={t('allocation.calculating')}><Skeleton active /><p>{t('allocation.calculating')}</p></div>}
        {flow.previewError !== null && <AllocationError error={flow.previewError} retry={flow.autoAgain} />}
        {flow.preview && <div className="allocation-preview" aria-label={t('allocation.previewData')}>
          <div className="allocation-heading"><div><h2>{t('allocation.previewData')}</h2><p>{t('allocation.planSavedHint')}</p></div>
            <Tag color={flow.preview.result.status === 'FEASIBLE' ? 'success' : 'warning'}>{t(`allocation.status.${flow.preview.result.status}`)}</Tag></div>
          <AllocationReasons reasons={flow.preview.result.warnings} />
          {flow.preview.sameAsPreviousPlan && <Alert type="info" title={t('allocation.samePlan')} />}
          {flow.stale && <Alert type="warning" title={t('allocation.errors.allocationPreviewStale')} />}
          {flow.savedPlan && <Alert type={flow.savedPlan.status === 'INVALID' ? 'warning' : 'info'} title={t(`allocation.planStatuses.${flow.savedPlan.status}`)} />}
          {flow.preview.result.status === 'FEASIBLE' && <>
            <AllocationGroups groups={flow.preview.groups} proposed={flow.savedPlan?.status !== 'APPLIED'} />
            {report && <><h3>{t('allocation.beforeAfter')}</h3><AllocationReport report={report} /></>}
          </>}
          <div className="allocation-actions allocation-preview-actions">
            <Button disabled={!!flow.attempt || flow.applying || flow.previewLoading} onClick={flow.autoAgain}>{t('allocation.autoAgain')}</Button>
            <Button type="primary" disabled={!flow.canApply} loading={flow.applying} onClick={() => setConfirming(true)}>{t('allocation.apply')}</Button>
          </div>
        </div>}
      </>}
    </section>}
    <Tabs items={[
      { key: 'current', label: t('allocation.currentData'), children: <section className="allocation-panel"><div className="allocation-heading"><div><h2>{t('allocation.currentData')}</h2><p>{t('allocation.scoreHint')}</p></div></div><AllocationGroups groups={data.groups} /></section> },
      { key: 'history', label: t('allocation.randomHistory'), children: <AllocationPlanHistory classId={classId} deadlineId={deadlineId} disabled={flow.applying || !!flow.attempt}
        onSelect={flow.restorePlan} onApply={detail => { flow.restorePlan(detail); setConfirming(true); }} /> },
    ]} />
    <Modal open={confirming} title={t('allocation.confirmTitle')} okText={t('allocation.confirmApply')} cancelText={t('allocation.cancel')}
      confirmLoading={flow.applying} okButtonProps={{ disabled: !flow.canApply }} cancelButtonProps={{ disabled: flow.applying }}
      closable={!flow.applying} mask={{ closable: !flow.applying }} keyboard={!flow.applying} onCancel={() => { if (!flow.applying) setConfirming(false); }} onOk={() => void confirm()}>
      <Alert type="warning" showIcon title={t('allocation.noUndo')} />
      {report && <dl className="allocation-confirm-list">{[
        [t('allocation.target'), flow.preview?.result.targetGroupCount], [t('allocation.kept'), report.keptGroupIds.length],
        [t('allocation.disbanded'), report.disbandedGroupIds.length], [t('allocation.movementsLabel'), report.movements.length],
        [t('allocation.leaderChangesLabel'), report.leaderChanges.length], [t('allocation.autoApproved'), report.keptGroupIds.length - report.protectedGroupIds.length],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    </Modal>
  </>;
}
