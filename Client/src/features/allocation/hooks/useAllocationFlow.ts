import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/providers/AuthContext';
import { useTerm } from '@/app/providers/TermContext';
import { useToast } from '@/app/providers/ToastContext';
import { useRealtime } from '@/app/providers/realtimeContext';
import { useTranslation } from 'react-i18next';
import { syncDeadlineQueries } from '@/features/deadline/realtime';
import { allocationApi } from '../api/allocationApi';
import { allocationErrorKey, newRequestKey, newSeed, persistAttempt, readAttempt, validTarget, type ApplyAttempt } from '../utils';
import type { ApplyResult, Preview } from '../types';

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
  const [revision, setRevision] = useState(0); const generation = useRef(0); const controller = useRef<AbortController | null>(null);
  const previous = useRef<{ seed?: number; fingerprint?: string }>({});
  const [now, setNow] = useState(() => Date.now());
  const overview = useQuery({ queryKey: [...key, 'overview'], queryFn: ({ signal }) => allocationApi.overview(deadlineId, classId, signal), retry: false });
  const setup = useQuery({ queryKey: [...key, 'setup'], enabled: configuring,
    queryFn: ({ signal }) => allocationApi.setup(deadlineId, classId, signal), retry: false });
  const suggested = setup.data?.suggestion;
  const target = rawTarget ?? (suggested?.status === 'FEASIBLE' && suggested.suggestedCount !== null ? String(suggested.suggestedCount) : '');
  const parsedTarget = validTarget(target, setup.data?.range);
  useEffect(() => {
    if (!configuring || parsedTarget === null || attempt || applied) return;
    const ticket = ++generation.current; const abort = new AbortController(); controller.current = abort;
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true); setPreviewError(null);
      try {
        const response = await allocationApi.preview(deadlineId, classId, { targetGroupCount: parsedTarget,
          seed: newSeed(previous.current.seed), previousPlanFingerprint: previous.current.fingerprint }, abort.signal);
        if (!abort.signal.aborted && generation.current === ticket) {
          setNow(Date.now()); setPreview(response); previous.current = { seed: response.result.seed, fingerprint: response.planFingerprint ?? undefined };
        }
      } catch (error) { if (!abort.signal.aborted && generation.current === ticket) setPreviewError(error); }
      finally { if (!abort.signal.aborted && generation.current === ticket) setPreviewLoading(false); }
    }, 450);
    return () => { window.clearTimeout(timer); abort.abort(); };
  }, [configuring, parsedTarget, target, revision, attempt, applied, classId, deadlineId]);
  useEffect(() => {
    if (!preview?.expiresAt || applied) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [preview?.expiresAt, applied]);
  useEffect(() => {
    const listener = (event: { deadlineId: number; schoolClassId?: number }) => {
      if (event.deadlineId === deadlineId && (!event.schoolClassId || event.schoolClassId === classId))
        void client.invalidateQueries({ queryKey: ['allocation'] });
    };
    const offGroups = subscribe(`/topic/classes/${classId}/deadlines/${deadlineId}/groups`, listener);
    const offDeadline = subscribe(`/topic/classes/${classId}/deadlines`, listener);
    return () => { offGroups(); offDeadline(); };
  }, [subscribe, client, classId, deadlineId]);
  const resetPreview = () => {
    generation.current++; controller.current?.abort(); setPreview(null); setPreviewError(null); setPreviewLoading(false); setApplyError(null);
  };
  const changeTarget = (value: string) => {
    if (busy.current || attemptRef.current || !/^\d*$/.test(value)) return;
    resetPreview(); setRawTarget(value);
  };
  const autoAgain = () => {
    if (busy.current || attemptRef.current) return;
    resetPreview(); setRevision(value => value + 1);
  };
  const secondsLeft = preview?.expiresAt ? Math.max(0, Math.ceil((Date.parse(preview.expiresAt) - now) / 1000)) : 0;
  const stale = !!preview && !!overview.data && preview.snapshotFingerprint !== overview.data.snapshotFingerprint;
  const canApply = preview?.result.status === 'FEASIBLE' && !!preview.previewId && secondsLeft > 0 && !stale
    && overview.isSuccess && !overview.isFetching && setup.isSuccess && !setup.isFetching
    && !previewLoading && !previewError && !applying && !attempt && !applied && parsedTarget === preview.result.targetGroupCount;
  const saveAttempt = (value: ApplyAttempt | null) => { attemptRef.current = value; setAttempt(value); persistAttempt(storageKey, value); };
  const confirmApply = async () => {
    if (busy.current) return;
    if (!attemptRef.current && (!canApply || !preview?.previewId)) return;
    const request = attemptRef.current ?? { previewId: preview!.previewId!, key: newRequestKey(), target: preview!.result.targetGroupCount };
    busy.current = true; setApplying(true); setApplyError(null); saveAttempt(request);
    const unlock = lockTermSelection();
    try {
      const result = await allocationApi.apply(deadlineId, classId, request.previewId, request.key);
      saveAttempt(null); setApplied(result); setPreview(null); setConfiguring(false); toast.success(t('allocation.saved'));
      // A refresh failure cannot turn a committed Apply into a reported failure.
      void Promise.allSettled([client.invalidateQueries({ queryKey: ['allocation'] }), syncDeadlineQueries(client)]);
    } catch (error) {
      setApplyError(error);
      const code = allocationErrorKey(error);
      if (code !== 'unknown' && code !== 'allocationBusy') { saveAttempt(null); setPreview(null); }
      // Unknown/busy retains the SAME key and reference, including after page refresh.
    } finally { unlock(); busy.current = false; setApplying(false); }
  };
  const visiblePreview = preview?.result.targetGroupCount === parsedTarget ? preview : null;
  return { overview, setup, configuring, setConfiguring, target, changeTarget, parsedTarget, preview: visiblePreview, previewLoading, previewError,
    applyError, applying, applied, attempt, secondsLeft, stale, canApply, autoAgain, confirmApply,
    start: () => { if (!attemptRef.current && !busy.current) { setApplied(null); setConfiguring(true); } },
    refresh: () => client.invalidateQueries({ queryKey: key }) };
}
