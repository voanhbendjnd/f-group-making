import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Segmented, Skeleton } from 'antd';
import { GraduationCap, RefreshCw, UserCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/providers/AuthContext';
import { zaloApi } from '../api/zaloApi';
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
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 30000,
    refetchOnWindowFocus: 'always'
  });

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
    <section className="zalo-student-panel" aria-label={t('zalo.title')}>
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
          onClick={() => void query.refetch()}
        >
          {t('zalo.refresh')}
        </Button>
      </div>

      {query.isPending || query.isFetching ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : query.isError ? (
        <Alert
          type="error"
          showIcon
          title={t('zalo.loadFailed')}
          action={<Button onClick={() => void query.refetch()}>{t('zalo.retry')}</Button>}
        />
      ) : (
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
                    <ZaloShareCard key={`${share.id}-${share.version}`} share={share} />
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
