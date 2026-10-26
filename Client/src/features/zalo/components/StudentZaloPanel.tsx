import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Segmented, Skeleton } from 'antd';
import { GraduationCap, RefreshCw, UserCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/providers/AuthContext';
import { zaloApi } from '../api/zaloApi';
import { isZaloAccessError } from '../api/zaloErrors';
import { ZaloShareCard, ZaloEmpty } from './ZaloShareCard';

export function StudentZaloPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const key = useMemo(() => ['zalo-mine', user?.id], [user?.id]);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => zaloApi.mine(signal),
    enabled: !!user,
    retry: false,
    // Match the 30-second fallback freshness window; the account QueryProvider clears on logout.
    staleTime: 30000,
    gcTime: 60000,
    refetchInterval: 30000,
    refetchOnWindowFocus: true
  });
  const showContent = query.data !== undefined && !(query.isError && isZaloAccessError(query.error));

  const hasClass = query.data?.some(share => share.scope === 'CLASS') ?? false;
  const hasLecturer = query.data?.some(share => share.scope === 'LECTURER') ?? false;

  const autoScope: 'CLASS' | 'LECTURER' = useMemo(() => {
    if (hasClass && hasLecturer) return 'CLASS';
    if (hasLecturer && !hasClass) return 'LECTURER';
    return 'CLASS';
  }, [hasClass, hasLecturer]);

  const [userScope, setUserScope] = useState<'CLASS' | 'LECTURER' | null>(null);
  const activeScope = userScope ?? autoScope;

  return (
    <section className="zalo-student-panel" aria-label={t('zalo.title')} aria-busy={query.isFetching}>
      <div className="zalo-student-toolbar">
        <Segmented<'CLASS' | 'LECTURER'>
          className="zalo-scope-segmented"
          value={activeScope}
          onChange={val => setUserScope(val)}
          options={[
            {
              value: 'CLASS',
              label: (
                <span className="zalo-segment-label">
                  <GraduationCap size={16} aria-hidden="true" />
                  <span>{t('zalo.classScope')}</span>
                  {hasClass && <span className="zalo-badge-dot" />}
                </span>
              )
            },
            {
              value: 'LECTURER',
              label: (
                <span className="zalo-segment-label">
                  <UserCheck size={16} aria-hidden="true" />
                  <span>{t('zalo.lecturerScope')}</span>
                  {hasLecturer && <span className="zalo-badge-dot" />}
                </span>
              )
            }
          ]}
        />
        <Button
          className="zalo-refresh-btn"
          icon={<RefreshCw size={14} className={query.isFetching ? 'animate-spin' : ''} />}
          loading={query.isFetching}
          onClick={() => void query.refetch({ cancelRefetch: false })}
        >
          {t('zalo.refresh')}
        </Button>
      </div>

      {query.isPending ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : null}
      {query.isError && (
        <Alert
          type="error"
          showIcon
          title={t('zalo.loadFailed')}
          action={<Button onClick={() => void query.refetch({ cancelRefetch: false })}>{t('zalo.retry')}</Button>}
        />
      )}
      {showContent && (
        <div className="zalo-single-card-view">
          {(['CLASS', 'LECTURER'] as const).map(scope => {
            const isCurrent = scope === activeScope;
            const items = query.data?.filter(share => share.scope === scope) ?? [];
            return (
              <div
                key={scope}
                style={{ display: isCurrent ? 'block' : 'none' }}
                className={`zalo-scope-pane ${isCurrent ? 'active' : ''}`}
              >
                {items.length > 0 ? (
                  items.map(share => (
                    <ZaloShareCard key={share.id} share={share} />
                  ))
                ) : (
                  <ZaloEmpty scope={scope} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
