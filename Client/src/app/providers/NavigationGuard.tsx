import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

interface Draft { dirty: boolean; busy: boolean }
interface Guard {
  register: (id: string, draft: Draft) => () => void;
  requestLeave: (action: () => void, cancel?: () => void) => void;
}
const Context = createContext<Guard | null>(null);
const immediate: Guard['requestLeave'] = action => action();

function RouteGuard({ blocked, requestLeave }: { blocked: () => boolean; requestLeave: Guard['requestLeave'] }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    !['/login', '/unauthorized'].includes(nextLocation.pathname) && blocked()
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => {
    if (blocker.state === 'blocked') requestLeave(() => blocker.proceed(), () => blocker.reset());
  }, [blocker, requestLeave]);
  return null;
}

/** Drafts stay in memory; navigation and term changes share the same confirmation. */
export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const records = useRef(new Map<string, Draft>());
  const [pending, setPending] = useState<{ action: () => void; cancel?: () => void; busy: boolean } | null>(null);
  const blocked = useCallback(() => [...records.current.values()].some(draft => draft.dirty || draft.busy), []);
  const register = useCallback((id: string, draft: Draft) => {
    records.current.set(id, draft);
    return () => { records.current.delete(id); };
  }, []);
  const requestLeave = useCallback<Guard['requestLeave']>((action, cancel) => {
    if (!blocked()) { action(); return; }
    setPending({ action, cancel, busy: [...records.current.values()].some(draft => draft.busy) });
  }, [blocked]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (blocked()) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [blocked]);
  const cancel = () => { pending?.cancel?.(); setPending(null); };
  return <Context.Provider value={{ register, requestLeave }}>
    {dataRouter && <RouteGuard blocked={blocked} requestLeave={requestLeave} />}
    {children}
    {pending && <ConfirmDialog open title={t(pending.busy ? 'adminUx.busyTitle' : 'adminUx.unsavedTitle')}
      message={t(pending.busy ? 'adminUx.busyMessage' : 'adminUx.unsavedMessage')}
      confirmText={t(pending.busy ? 'adminUx.stay' : 'adminUx.discard')} cancelText={t('adminUx.stay')}
      onCancel={cancel} onConfirm={() => { if (pending.busy) cancel(); else { const action = pending.action; setPending(null); action(); } }} />}
  </Context.Provider>;
}

export function useNavigationGuard() {
  return useContext(Context)?.requestLeave ?? immediate;
}

export function useUnsavedChanges(dirty: boolean, busy = false) {
  const guard = useContext(Context);
  const id = useId();
  const register = guard?.register;
  useEffect(() => register?.(id, { dirty, busy }), [id, register, dirty, busy]);
  const request = guard?.requestLeave ?? immediate;
  return (action: () => void) => { if (dirty || busy) request(action); else action(); };
}
