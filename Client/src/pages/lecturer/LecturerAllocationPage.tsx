import { useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, ConfigProvider, Empty, Input, Modal, Pagination, Skeleton, Tabs, Tag, Tooltip } from 'antd';
import viVN from 'antd/locale/vi_VN';
import enUS from 'antd/locale/en_US';
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, CheckCircle2, ChevronDown, ClipboardCheck, ClipboardList, History, LockKeyhole, RefreshCw, ShieldCheck, Sparkles, Target, TriangleAlert, UserRound, Users, UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/providers/AuthContext';
import { useTerm } from '@/app/providers/TermContext';
import { TermScope } from '@/features/terms/components/TermScope';
import { classApi } from '@/features/classes/api/classApi';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import { positiveId } from '@/features/group/navigation';
import { useAllocationFlow } from '@/features/allocation/hooks/useAllocationFlow';
import { AllocationGroups, AllocationReasons } from '@/features/allocation/components/AllocationGroups';
import { AllocationReport } from '@/features/allocation/components/AllocationReport';
import { AllocationPlanHistory } from '@/features/allocation/components/AllocationPlanHistory';
import { AllocationApplyHistory } from '@/features/allocation/components/AllocationHistory';
import { AllocationIllustration } from '@/features/allocation/components/AllocationIllustration';
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
  const backAction = <Button className="allocation-back" disabled={isLocked} icon={<ArrowLeft size={16} />} onClick={() => navigate('/lecturer/automatic-allocation')}>{t('allocation.backToClasses')}</Button>;
  const stepIcons = [UsersRound, Target, ClipboardList, CheckCircle2];
  return <div className="allocation-page">
    {route.classId && (classes.isPending || classes.isError || !selected) && backAction}
    {!route.classId && <section className="allocation-welcome">
      <header className="allocation-hero allocation-list-hero">
        <div className="allocation-hero-copy"><span className="allocation-eyebrow">{t('allocation.title')}</span><h1>{t('allocation.heroTitle')}</h1><p>{t('allocation.heroDescription')}</p></div>
        <AllocationIllustration />
      </header>
      <section className="allocation-process" aria-label={t('allocation.howItWorks')}>
        <h2>{t('allocation.howItWorks')}</h2>
        <ol className="allocation-steps">{stepIcons.map((Icon, index) => <li key={index}>
          <span className="allocation-step-number" aria-hidden="true">{index + 1}</span>
          <span className="allocation-step-icon"><Icon size={23} aria-hidden="true" /></span>
          <div><strong>{t(`allocation.steps.${index}.title`)}</strong><p>{t(`allocation.steps.${index}.description`)}</p></div>
        </li>)}</ol>
      </section>
    </section>}
    {!route.classId && <section className="allocation-class-search"><div><h2>{t('allocation.classList')}</h2><p className="allocation-muted">{t('allocation.chooseClassHint')}</p></div>
      <Input.Search aria-label={t('allocation.searchClasses')} placeholder={t('allocation.searchClasses')} value={search} allowClear onChange={event => { setSearch(event.target.value); setPage(1); }} />
    </section>}
    {classes.isError && <AllocationError error={classes.error} retry={() => void classes.refetch()} />}
    {classes.isPending ? <Skeleton active /> : !classes.isError && (route.classId
      ? selected ? <AllocationSession key={selected.id} classId={selected.id} termName={selected.termName} backAction={backAction} /> : <Empty description={t('allocation.classUnavailable')} />
      : filtered.length ? <><div className="allocation-class-grid">{filtered.slice((page - 1) * 9, page * 9).map(value => <article className="allocation-panel allocation-class-card" key={value.id}>
        <div className="allocation-class-card-heading"><span className="allocation-class-icon"><BookOpen size={21} aria-hidden="true" /></span><Tag className="allocation-term-chip">{value.termName || t('allocation.missing')}</Tag></div>
        <h3>{value.name}</h3>
        <div className="allocation-class-enrollment"><Users size={16} aria-hidden="true" /><strong>{value.studentCount}</strong><span>{t('allocation.totalStudents')}</span></div>
        <Button type="primary" block disabled={isLocked} icon={<ArrowRight size={16} />} onClick={() => navigate(`/lecturer/automatic-allocation/${value.id}`)}>{t('allocation.openClass')}</Button>
      </article>)}</div><div className="allocation-pagination"><Pagination current={page} pageSize={9} total={filtered.length} showSizeChanger={false} onChange={setPage} /></div></>
      : <Empty description={t('allocation.noClasses')} />)}
  </div>;
}
function AllocationSession({ classId, termName, backAction }: { classId: number; termName: string | null; backAction: ReactNode }) {
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
  if (session.isPending) return <>{backAction}<Skeleton active /></>;
  if (session.isError) return <>{backAction}<AllocationError error={session.error} retry={() => void session.refetch()} /></>;
  if (!session.data) return <>{backAction}<Empty description={t('allocation.noSession')} /></>;
  return <AllocationWorkspace key={`${classId}:${session.data}`} classId={classId} deadlineId={session.data} termName={termName} backAction={backAction} />;
}
export function AllocationError({ error, retry }: { error: unknown; retry?: () => void }) {
  const { t } = useTranslation();
  return <Alert type="error" showIcon title={t(`allocation.errors.${allocationErrorKey(error)}`, { defaultValue: t('allocation.errors.other') })}
    action={retry && <Button onClick={retry}>{t('allocation.retry')}</Button>} />;
}
function AllocationWorkspace({ classId, deadlineId, termName, backAction }: { classId: number; deadlineId: number; termName: string | null; backAction: ReactNode }) {
  const { t } = useTranslation(); const flow = useAllocationFlow(classId, deadlineId);
  const [confirming, setConfirming] = useState(false);
  const data = flow.overview.data; const setup = flow.setup.data;
  const report = flow.preview?.report;
  if (flow.overview.isPending) return <>{backAction}<Skeleton active /></>;
  if (flow.overview.isError || !data) return <>{backAction}<AllocationError error={flow.overview.error} retry={() => void flow.refresh()} /></>;
  const metrics = [
    ['totalStudents', data.summary.totalStudents, Users, 'blue'], ['totalGroups', data.summary.totalGroups, UsersRound, 'green'], ['valid', data.summary.validGroups, ShieldCheck, 'info'],
    ['invalid', data.summary.invalidGroups, TriangleAlert, 'amber'], ['unassigned', data.summary.unassignedStudents, UserRound, 'rose'], ['protected', data.summary.protectedGroups, LockKeyhole, 'blue'],
  ] as const;
  const actionHint = flow.complete ? t('allocation.completedHint') : flow.applying ? t('allocation.waitForApply') : flow.attempt ? t('allocation.unknownHint') : undefined;
  const applyHint = flow.canApply ? undefined : actionHint || (flow.stale ? t('allocation.errors.allocationPreviewStale')
    : flow.savedPlan?.status === 'APPLIED' ? t('allocation.planStatuses.APPLIED') : flow.savedPlan?.invalidReason
      ? t(`allocation.errors.${flow.savedPlan.invalidReason}`, { defaultValue: t('allocation.errors.other') })
      : flow.preview?.result.status && flow.preview.result.status !== 'FEASIBLE' ? t(`allocation.status.${flow.preview.result.status}`) : t('allocation.readyToApplyHint'));
  const confirm = async () => { await flow.confirmApply(); setConfirming(false); };
  return <>
    <div className="allocation-detail-toolbar">{backAction}
        <div className="allocation-actions"><Button icon={<RefreshCw size={16} />} loading={flow.overview.isFetching} onClick={() => void flow.refresh()}>{t('allocation.refresh')}</Button>
          <Tooltip title={actionHint} trigger={['hover', 'focus']}><span className="allocation-action-hint" tabIndex={actionHint ? 0 : undefined}>
            <Button type="primary" icon={<Sparkles size={16} />} disabled={flow.complete || !!flow.attempt || flow.applying} aria-describedby={flow.complete ? 'allocation-complete' : undefined} onClick={() => flow.start()}>{t('allocation.autoAllocate')}</Button>
          </span></Tooltip></div>
    </div>
    <header className="allocation-hero allocation-detail-header">
      <div className="allocation-class-identity"><div className="allocation-class-title"><span className="allocation-hero-icon"><BookOpen size={29} aria-hidden="true" /></span>
        <div><span className="allocation-eyebrow">{t('allocation.title')}</span><h1>{data.scope.className}</h1></div></div>
        <div className="allocation-class-meta"><Tag className="allocation-term-chip">{termName || t('allocation.missing')}</Tag>
          <span><CalendarDays size={14} aria-hidden="true" />{data.scope.deadlineName}</span>
          <Tag color={data.scope.deadlineStatus === 'ACTIVE' ? 'success' : 'default'}>{t(`allocation.deadlineStatus.${data.scope.deadlineStatus}`, { defaultValue: t('allocation.missing') })}</Tag>
        </div><p className="allocation-muted">{t('allocation.detailHint')}</p>
      </div><AllocationIllustration />
    </header>
    <section className="allocation-overview" aria-label={t('allocation.overview')}>
      <dl className="allocation-overview-metrics">{metrics.map(([label, value, Icon, accent]) => <div key={label} className={`allocation-metric allocation-metric--${accent}`}><dt><Icon size={15} aria-hidden="true" />{t(`allocation.${label}`)}</dt><dd>{value}</dd><Icon className="allocation-metric-watermark" size={32} aria-hidden="true" /></div>)}</dl>
      <details className="allocation-rule-disclosure"><summary><span>{t('allocation.rules')} <small>{t('allocation.activeRules', { count: data.rules.filter(rule => rule.status).length })}</small></span><ChevronDown size={16} aria-hidden="true" /></summary>
        <div className="allocation-rule-chips">{data.rules.filter(rule => rule.status).map(rule => <Tag key={rule.code}>{t(`classRules.names.${rule.code}`, { defaultValue: t(`allocation.ruleNames.${rule.code}`) })}: <strong>{rule.value}</strong></Tag>)}</div>
      </details>
      <AllocationReasons reasons={data.warnings} />
    </section>
    {flow.complete && <div id="allocation-complete" className="allocation-completed" role="status"><CheckCircle2 size={18} aria-hidden="true" /><div><strong>{t('allocation.completed')}</strong><p>{t('allocation.completedHint')}</p></div></div>}
    {flow.acceptedWithUnassigned && <Alert type="warning" showIcon title={t('allocation.acceptedWithUnassigned')} />}
    {flow.applied && <Alert type="success" showIcon title={t('allocation.runSuccess', { id: flow.applied.runId, count: flow.applied.approvedGroupIds.length })} />}
    {flow.attempt && <Alert type={flow.applying ? 'info' : 'warning'} showIcon title={t(flow.applying ? 'allocation.applying' : 'allocation.unknownTitle')} description={t(flow.applying ? 'allocation.waitForApply' : 'allocation.unknownHint')}
      action={<Button loading={flow.applying} onClick={() => void flow.confirmApply()}>{t('allocation.retrySameRequest')}</Button>} />}
    {flow.applyError !== null && <AllocationError error={flow.applyError} />}
    {flow.configuring && <section className="allocation-workflow" aria-label={t('allocation.setup')}>
      <div className="allocation-heading"><div><h2>{t('allocation.setup')}</h2><p>{t('allocation.confirmTargetHint')}</p></div><Tag>{t('allocation.previewOnly')}</Tag></div>
      {flow.setup.isPending ? <Skeleton active /> : flow.setup.isError ? <AllocationError error={flow.setup.error} retry={() => void flow.setup.refetch()} /> : setup && <>
        <div className="allocation-panel allocation-setup">
        <div className="allocation-setup-grid">
          <div className="allocation-range"><span>{t('allocation.range')}</span><strong>{setup.range.minimum <= setup.range.maximum ? `${setup.range.minimum}–${setup.range.maximum}` : t('allocation.noRange')}</strong>
            <small>{t('allocation.protectedCount', { count: setup.range.protectedGroups })}</small></div>
          <div className="allocation-suggestion"><strong>{setup.suggestion.status === 'FEASIBLE' && setup.suggestion.suggestedCount !== null ? t('allocation.suggested', { count: setup.suggestion.suggestedCount }) : t('allocation.noSuggestion')}</strong>
            <details><summary>{t('allocation.suggestionDetails')}</summary><AllocationReasons reasons={setup.suggestion.reasons} /></details></div>
          <div><label htmlFor="allocation-target">{t('allocation.target')}</label>
            <Input id="allocation-target" aria-label={t('allocation.target')} inputMode="numeric" pattern="[0-9]*" value={flow.target}
              disabled={!!flow.attempt || flow.applying || setup.range.minimum > setup.range.maximum} status={flow.target && flow.parsedTarget === null ? 'error' : undefined}
              aria-invalid={!!flow.target && flow.parsedTarget === null} aria-describedby="allocation-target-help"
              onChange={event => flow.changeTarget(event.target.value)} />
            <small id="allocation-target-help" className="allocation-block">{t(flow.target && flow.parsedTarget === null ? 'allocation.invalidTarget' : 'allocation.targetHint', { min: setup.range.minimum, max: setup.range.maximum })}</small>
            <Tooltip title={actionHint || (flow.parsedTarget === null ? t('allocation.invalidTarget', { min: setup.range.minimum, max: setup.range.maximum }) : undefined)} trigger={['hover', 'focus']}><span className="allocation-action-hint allocation-confirm-target" tabIndex={actionHint || flow.parsedTarget === null ? 0 : undefined}>
              <Button type="primary" icon={<Target size={15} aria-hidden="true" />} disabled={flow.complete || flow.parsedTarget === null || !!flow.attempt || flow.applying || flow.previewLoading} loading={flow.previewLoading} onClick={() => void flow.confirmTarget()}>{t('allocation.confirmTarget')}</Button>
            </span></Tooltip>
          </div>
        </div>
        <AllocationReasons reasons={[...setup.range.reasons, ...setup.warnings]} />
        <div className="allocation-setup-notes"><p>{t('allocation.preliminaryHint')}</p><p>{t('allocation.balanceHint')}</p>
          <details><summary>{t('allocation.searchDetails')}</summary><p>{t('allocation.searchLimits', { nodes: setup.limits.maximumSearchNodes, depth: setup.limits.maximumSearchDepth })}</p></details>
        </div></div>
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
            <Button icon={<RefreshCw size={15} aria-hidden="true" />} disabled={flow.complete || !!flow.attempt || flow.applying || flow.previewLoading} onClick={flow.autoAgain}>{t('allocation.autoAgain')}</Button>
            <Tooltip title={applyHint} trigger={['hover', 'focus']}><span className="allocation-action-hint" tabIndex={applyHint ? 0 : undefined}><Button type="primary" icon={<CheckCircle2 size={15} aria-hidden="true" />} disabled={!flow.canApply} loading={flow.applying} onClick={() => setConfirming(true)}>{t('allocation.apply')}</Button></span></Tooltip>
          </div>
        </div>}
      </>}
    </section>}
    <Tabs className="allocation-content-nav" items={[
      { key: 'current', label: <span className="allocation-tab-label"><UsersRound size={16} aria-hidden="true" />{t('allocation.currentData')}</span>, children: <section className="allocation-panel allocation-current-panel"><div className="allocation-heading"><div><h2>{t('allocation.currentData')}</h2><p>{t('allocation.scoreHint')}</p></div></div><AllocationGroups groups={data.groups} /></section> },
      { key: 'history', label: <span className="allocation-tab-label"><History size={16} aria-hidden="true" />{t('allocation.randomHistory')}</span>, children: <AllocationPlanHistory classId={classId} deadlineId={deadlineId} disabled={flow.applying || !!flow.attempt}
        onSelect={flow.restorePlan} onApply={detail => { flow.restorePlan(detail); setConfirming(true); }} /> },
      { key: 'audit', label: <span className="allocation-tab-label"><ClipboardCheck size={16} aria-hidden="true" />{t('allocation.applyAudit')}</span>, children: <AllocationApplyHistory classId={classId} deadlineId={deadlineId} /> },
    ]} />
    <Modal className="allocation-confirm-modal" width={560} style={{ maxWidth: 'calc(100vw - 2rem)' }} open={confirming} title={t('allocation.confirmTitle')} okText={t('allocation.confirmApply')} cancelText={t('allocation.cancel')}
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
