import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/providers/AuthContext';
import { useTerm } from '@/app/providers/TermContext';
import { useToast } from '@/app/providers/ToastContext';
import { useRealtime } from '@/app/providers/realtimeContext';
import { useTranslation } from 'react-i18next';
import { syncDeadlineQueries } from '@/features/deadline/realtime';
import { allocationApi } from '../api/allocationApi';
import { allocationErrorKey, isAllocationComplete, newRequestKey, newSeed, persistAttempt, readAttempt, validTarget, type ApplyAttempt } from '../utils';
import type { ApplyResult, PlanDetail, PlanPage, Preview } from '../types';
import { useUnsavedChanges } from '@/app/providers/NavigationGuard';

export function useAllocationFlow(classId: number, deadlineId: number) {
  const { user } = useAuth(); const { selectedTermId, lockTermSelection } = useTerm();
  const client = useQueryClient(); const toast = useToast(); const { t } = useTranslation(); const { subscribe } = useRealtime();
  const key = ['allocation', user?.id, selectedTermId, classId, deadlineId];
  const storageKey = `allocation-apply:${user?.id}:${classId}:${deadlineId}`;
  const [attempt, setAttempt] = useState<ApplyAttempt | null>(() => readAttempt(storageKey));
  const attemptRef = useRef(attempt); const busy = useRef(false);
  const [configuring, setConfiguring] = useState(false); const [rawTarget, setRawTarget] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null); const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<unknown>(null); const [applyError, setApplyError] = useState<unknown>(null);
  const [applying, setApplying] = useState(false); const [applied, setApplied] = useState<ApplyResult | null>(null);
  useUnsavedChanges(false, applying);
  const generation = useRef(0); const controller = useRef<AbortController | null>(null);
  const calculating = useRef(false); const [confirmedTarget, setConfirmedTarget] = useState<number | null>(null);
  const [savedPlan, setSavedPlan] = useState<PlanDetail['summary'] | null>(null);
  const previous = useRef<{ seed?: number; fingerprint?: string }>({});
  const overview = useQuery({ queryKey: [...key, 'overview'], queryFn: ({ signal }) => allocationApi.overview(deadlineId, classId, signal), retry: false });
  const complete = isAllocationComplete(overview.data);
  const acceptedWithUnassigned = !!overview.data && overview.data.groups.length > 0 && overview.data.summary.unassignedStudents > 0
    && overview.data.groups.every(group => group.status === 'ACCEPTED');
  const setup = useQuery({ queryKey: [...key, 'setup'], enabled: configuring,
    queryFn: ({ signal }) => allocationApi.setup(deadlineId, classId, signal), retry: false });
  const suggested = setup.data?.suggestion;
  const target = rawTarget ?? (suggested?.status === 'FEASIBLE' && suggested.suggestedCount !== null ? String(suggested.suggestedCount) : '');
  const parsedTarget = validTarget(target, setup.data?.range);
  const generate = async () => {
    if (complete || !configuring || parsedTarget === null || attemptRef.current || busy.current || calculating.current) return;
    const ticket = ++generation.current; const abort = new AbortController(); controller.current = abort;
    calculating.current = true; setConfirmedTarget(parsedTarget); setSavedPlan(null); setApplied(null);
    setPreview(null); setPreviewLoading(true); setPreviewError(null); setApplyError(null);
    try {
      const response = await allocationApi.preview(deadlineId, classId, { targetGroupCount: parsedTarget,
        seed: newSeed(previous.current.seed), previousPlanFingerprint: previous.current.fingerprint }, abort.signal);
      if (!abort.signal.aborted && generation.current === ticket) {
        setPreview(response); previous.current = { seed: response.result.seed, fingerprint: response.planFingerprint ?? undefined };
        void client.invalidateQueries({ queryKey: [...key, 'plans'] });
      }
    } catch (error) { if (!abort.signal.aborted && generation.current === ticket) setPreviewError(error); }
    finally { if (generation.current === ticket) { calculating.current = false; setPreviewLoading(false); } }
  };
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const listener = (event: { deadlineId: number; schoolClassId?: number }) => {
      if (busy.current) return;
      if (event.deadlineId === deadlineId && (!event.schoolClassId || event.schoolClassId === classId)) {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (!busy.current) {
            void client.invalidateQueries({ queryKey: ['allocation'] });
          }
        }, 100);
      }
    };
    const offGroups = subscribe(`/topic/classes/${classId}/deadlines/${deadlineId}/groups`, listener);
    const offDeadline = subscribe(`/topic/classes/${classId}/deadlines`, listener);
    return () => {
      window.clearTimeout(timer);
      offGroups();
      offDeadline();
    };
  }, [subscribe, client, classId, deadlineId]);
  const resetPreview = () => {
    generation.current++; controller.current?.abort(); calculating.current = false;
    setPreview(null); setSavedPlan(null); setPreviewError(null); setPreviewLoading(false); setApplyError(null);
  };
  const changeTarget = (value: string) => {
    if (busy.current || attemptRef.current || !/^\d*$/.test(value)) return;
    resetPreview(); setRawTarget(value); setConfirmedTarget(null);
  };
  const autoAgain = () => {
    if (confirmedTarget !== parsedTarget) return;
    void generate();
  };
  const stale = !!preview && !!overview.data && preview.snapshotFingerprint !== overview.data.snapshotFingerprint;
  const canApply = !complete && preview?.result.status === 'FEASIBLE' && !!preview.previewId && !stale
    && overview.isSuccess && !overview.isFetching && setup.isSuccess && !setup.isFetching
    && !previewLoading && !previewError && !applying && !attempt && !applied && (!savedPlan || savedPlan.canApply)
    && parsedTarget === preview.result.targetGroupCount && confirmedTarget === parsedTarget;
  const saveAttempt = (value: ApplyAttempt | null) => { attemptRef.current = value; setAttempt(value); persistAttempt(storageKey, value); };
  const confirmApply = async () => {
    if (busy.current) return;
    if (!attemptRef.current && (!canApply || !preview?.previewId)) return;
    const request = attemptRef.current ?? { previewId: preview!.previewId!, key: newRequestKey(), target: preview!.result.targetGroupCount };
    busy.current = true; setApplying(true); setConfiguring(false); setApplyError(null); saveAttempt(request);
    const unlock = lockTermSelection();
    try {
      const result = await allocationApi.apply(deadlineId, classId, request.previewId, request.key);
      saveAttempt(null); setApplied(result); setPreview(null); toast.success(t('allocation.saved'));
      await Promise.allSettled([client.cancelQueries({ queryKey: [...key, 'plans'] })]);
      // Reflect the committed result immediately, even if the following history refresh fails.
      const markApplied = (summary: PlanDetail['summary']): PlanDetail['summary'] => summary.planId === result.previewId
        ? { ...summary, status: 'APPLIED', appliedAt: result.appliedAt, canApply: false, invalidReason: null } : summary;
      client.setQueriesData<PlanPage>({ queryKey: [...key, 'plans'], predicate: query => typeof query.queryKey[6] === 'number' },
        page => page && { ...page, result: page.result.map(markApplied) });
      client.setQueriesData<PlanDetail>({ queryKey: [...key, 'plans', 'detail', result.previewId] },
        detail => detail && { ...detail, summary: markApplied(detail.summary) });
      // A refresh failure cannot turn a committed Apply into a reported failure.
      void Promise.allSettled([syncDeadlineQueries(client)]);
      return result;
    } catch (error) {
      setApplyError(error);
      const code = allocationErrorKey(error);
      if (code !== 'unknown' && code !== 'allocationBusy') { saveAttempt(null); setPreview(null); }
      // Unknown/busy retains the SAME key and reference, including after page refresh.
    } finally { unlock(); busy.current = false; setApplying(false); }
  };
  const visiblePreview = savedPlan || preview?.result.targetGroupCount === parsedTarget ? preview : null;
  const restorePlan = (detail: PlanDetail) => {
    if (busy.current || attemptRef.current || detail.preview.scope.classId !== classId || detail.preview.scope.deadlineId !== deadlineId) return;
    resetPreview(); setApplied(null); setConfiguring(true); setRawTarget(String(detail.preview.result.targetGroupCount));
    setConfirmedTarget(detail.preview.result.targetGroupCount); setSavedPlan(detail.summary); setPreview(detail.preview);
    previous.current = { seed: detail.preview.result.seed, fingerprint: detail.preview.planFingerprint ?? undefined };
  };
  return { overview, setup, configuring, setConfiguring, target, changeTarget, parsedTarget, preview: visiblePreview, previewLoading, previewError,
    applyError, applying, applied, attempt, complete, acceptedWithUnassigned, stale, canApply, autoAgain, confirmApply, confirmTarget: generate, restorePlan, savedPlan,
    start: () => { if (!complete && !attemptRef.current && !busy.current) { setApplied(null); setConfiguring(true); } },
    refresh: () => client.invalidateQueries({ queryKey: key }) };
}
