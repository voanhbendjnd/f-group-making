import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useTerm } from '@/app/providers/TermContext';
import { useUnsavedChanges } from '@/app/providers/NavigationGuard';
import { TermScope } from '@/features/terms/components/TermScope';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { Pagination } from '@/components/common/Pagination';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { LecturerFilterBar } from '@/features/lecturers/components/LecturerFilterBar';
import { LecturerTable } from '@/features/lecturers/components/LecturerTable';
import { CreateLecturerModal } from '@/features/lecturers/components/CreateLecturerModal';
import { lecturerApi } from '@/features/lecturers/api/lecturerApi';
import { getApiError } from '@/services/api/types';
import { useToast } from '@/app/providers/ToastContext';
import type { Lecturer, LecturerFilterParams } from '@/features/lecturers/types';
import { useListFilters } from '@/components/common/useListFilters';

export function LecturerListPage() {
  const { t } = useTranslation();
  const { isLocked, selectedTerm } = useTerm();
  const [params, setParams] = useSearchParams();
  const global = params.get('scope') === 'all';
  const [creating, setCreating] = useState(false);
  const client = useQueryClient();
  const { success } = useToast();
  const scope = <div className="admin-inline-filter">
    <label htmlFor="lecturer-scope">{t('terms.lecturerScope')}</label>
    <select id="lecturer-scope" className="form-control" disabled={isLocked} value={global ? 'all' : 'term'} onChange={event => {
      const next = new URLSearchParams(); if (event.target.value === 'all') next.set('scope', 'all'); setParams(next);
    }}><option value="term">{t('adminUx.lecturerTermScope', { term: selectedTerm?.name ?? '' })}</option><option value="all">{t('adminUx.allLecturers')}</option></select>
    <span className="form-hint">{t(global ? 'adminUx.globalScope' : 'adminUx.lecturerCreated')}</span>
  </div>;
  return <div>
    <PageHeader title={t('addLecturer.listTitle')} description={t('addLecturer.listDescription')}
      breadcrumbs={[{ label: t('breadcrumbs.admin'), href: '/admin/dashboard' }, { label: t('lecturer.role') }]}
      action={<div className="admin-inline-actions"><Button onClick={() => setCreating(true)}>{t('addLecturer.button')}</Button><Link className="btn btn-secondary" to="/admin/lecturers/import">{t('addLecturer.import')}</Link></div>} />
    {creating && <CreateLecturerModal onClose={() => setCreating(false)} onSuccess={() => {
      setCreating(false); setParams({ scope: 'all' });
      void client.invalidateQueries({ queryKey: ['lecturers'] });
      void client.invalidateQueries({ queryKey: ['admin-dashboard'] }); success(t('addLecturer.success'));
    }} />}
    <TermScope global={global}><LecturerListContent global={global} scope={scope} /></TermScope>
  </div>;
}

function LecturerListContent({ global, scope }: { global: boolean; scope: ReactNode }) {
  const { t } = useTranslation();
  const { selectedTermId, lockTermSelection } = useTerm();
  const termId = global ? undefined : selectedTermId!;
  const client = useQueryClient();
  const [filters, setFilters] = useListFilters<LecturerFilterParams>({ page: 1, size: 10, search: '' }, termId);
  const [selected, setSelected] = useState<Record<number, Lecturer>>({});
  const [targets, setTargets] = useState<{ kind: 'activate' | 'delete'; records: Lecturer[] } | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [unknown, setUnknown] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [cooldowns, setCooldowns] = useState<Record<number, number>>(() => {
    try { return JSON.parse(sessionStorage.getItem('lecturer_activation_cooldowns') || '{}'); } catch { return {}; }
  });
  useUnsavedChanges(false, pending);
  useEffect(() => { const interval = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval); }, []);
  const cooldown = (id: number) => Math.max(0, Math.ceil(((cooldowns[id] || 0) - now) / 1000));
  const query = useQuery({ queryKey: ['lecturers', termId ?? 'all', filters], queryFn: () => lecturerApi.getLecturers({ ...filters, termId }) });
  const lecturers = query.data?.result ?? [];
  const meta = query.data?.meta ?? { page: filters.page ?? 1, pageSize: filters.size ?? 10, total: 0, pages: 1 };
  const records = Object.values(selected);
  const eligible = (values: Lecturer[]) => values.filter(item => !item.activated && cooldown(item.userId) === 0);
  const toggle = (id: number) => setSelected(previous => {
    const next = { ...previous };
    if (next[id]) delete next[id]; else { const item = lecturers.find(value => value.userId === id); if (item) next[id] = item; }
    return next;
  });
  const selectPage = () => setSelected(previous => {
    const next = { ...previous }; const all = lecturers.every(item => previous[item.userId]);
    lecturers.forEach(item => { if (all) delete next[item.userId]; else next[item.userId] = item; }); return next;
  });
  const open = (kind: 'activate' | 'delete', values: Lecturer[]) => { setTargets({ kind, records: values }); setError(''); setUnknown(false); };
  const execute = async () => {
    if (!targets || busy.current || unknown) return;
    const values = targets.kind === 'activate' ? eligible(targets.records) : targets.records;
    if (!values.length) return;
    busy.current = true; setPending(true); setError('');
    const release = lockTermSelection();
    try {
      const ids = values.map(item => item.userId);
      if (targets.kind === 'activate') {
        const result = await lecturerApi.sendBatchActivation(ids, termId);
        const next = { ...cooldowns }; ids.forEach(id => { next[id] = Date.now() + 60000; });
        setCooldowns(next); try { sessionStorage.setItem('lecturer_activation_cooldowns', JSON.stringify(next)); } catch { /* optional storage */ }
        setNotice(t('terms.batchActivationAccepted', { count: result.totalProcessed }));
      } else {
        if (ids.length === 1 && global) await lecturerApi.deleteLecturer(ids[0]!);
        else await lecturerApi.deleteBatchLecturers(ids, termId);
        setNotice(t('adminUx.deleteCompleted', { count: ids.length }));
        setFilters(previous => ({ ...previous, page: Math.min(previous.page ?? 1, Math.max(1, Math.ceil(Math.max(0, meta.total - ids.length) / meta.pageSize))) }));
        void client.invalidateQueries({ queryKey: ['school-classes'] });
        void client.invalidateQueries({ queryKey: ['school-class'] });
      }
      setSelected({}); setTargets(null);
      void client.invalidateQueries({ queryKey: ['lecturers'] });
    } catch (value) {
      const apiError = getApiError(value);
      const uncertain = Boolean(apiError.outcomeUnknown || apiError.status === 0 || apiError.status >= 500);
      setUnknown(uncertain); setError(uncertain ? t('adminUx.unknownWrite') : apiError.message || t('errors.generalFailure'));
    } finally { release(); busy.current = false; setPending(false); }
  };
  return <div className="admin-list">
    <section className="card admin-list-toolbar">{scope}
      <LecturerFilterBar filters={filters} onChange={next => { setFilters(previous => ({ ...previous, ...next })); setSelected({}); }}
        onReset={() => { setFilters({ page: 1, size: 10, search: '' }); setSelected({}); }} />
    </section>
    {notice && <p className="alert alert-success" role="status">{notice}</p>}
    {records.length > 0 && <div className="admin-bulk-toolbar">
      <strong>{t('adminUx.selectedCount', { count: records.length })}</strong>
      <div className="admin-inline-actions"><Button variant="secondary" size="sm" onClick={() => setSelected({})} disabled={pending}>{t('bulkAction.clearSelection')}</Button>
        <Button size="sm" disabled={!eligible(records).length || pending} onClick={() => open('activate', records)}>{t('adminUx.sendLecturers', { count: eligible(records).length })}</Button>
        <Button variant="danger" size="sm" disabled={pending} onClick={() => open('delete', records)}>{t('adminUx.deleteAccounts', { count: records.length })}</Button>
      </div>
    </div>}
    {query.isPending ? <LoadingSpinner message={t('common.loading')} /> : query.isError ? <ErrorState message={t('errors.generalFailure')} onRetry={() => void query.refetch()} />
      : !lecturers.length ? <EmptyState title={t('adminUx.noLecturers')} description={t('adminUx.lecturerCreated')}
        actionText={t('students.clearFilters')} onAction={() => { setFilters({ page: 1, size: 10, search: '' }); setSelected({}); }} />
      : <section className="card"><LecturerTable lecturers={lecturers} selectedUserIds={records.map(item => item.userId)}
        onToggleSelect={toggle} onToggleSelectAll={selectPage} onSendActivation={item => open('activate', [item])}
        onDelete={item => open('delete', [item])} isSendingActivation={pending} getCooldown={cooldown} />
        <Pagination meta={meta} currentPage={filters.page} showingKey="adminUx.showingLecturers" onPageChange={page => setFilters(previous => ({ ...previous, page }))}
          onPageSizeChange={size => { setFilters(previous => ({ ...previous, size, page: 1 })); setSelected({}); }} />
      </section>}
    {targets && <ConfirmDialog open isDanger={targets.kind === 'delete'} isLoading={pending}
      confirmDisabled={unknown || (targets.kind === 'activate' && !eligible(targets.records).length)}
      title={t(targets.kind === 'delete' ? 'adminUx.deleteAccount' : 'adminUx.confirmLecturerActivation')}
      confirmText={t(targets.kind === 'delete' ? 'adminUx.deleteAccounts' : 'adminUx.sendLecturers', { count: targets.kind === 'delete' ? targets.records.length : eligible(targets.records).length })}
      onCancel={() => { if (!busy.current) setTargets(null); }} onConfirm={() => { if (!unknown) void execute(); }}
      message={<div>
        <p>{t(targets.kind === 'delete' ? 'adminUx.deleteScopeWarning' : 'adminUx.activationAccepted')}</p>
        <ul className="admin-recipient-preview">{targets.records.map(item => <li key={item.userId}>{item.code} · {item.email}{targets.kind === 'activate' && (item.activated || cooldown(item.userId) > 0) ? ` — ${t('adminUx.skipped')}` : ''}</li>)}</ul>
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        {unknown && <Button variant="secondary" onClick={() => { setTargets(null); void query.refetch(); }}>{t('adminUx.checkList')}</Button>}
      </div>} />}
  </div>;
}
