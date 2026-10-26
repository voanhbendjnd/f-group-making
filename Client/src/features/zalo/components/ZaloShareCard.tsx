import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Skeleton, Tag } from 'antd';
import { Check, Copy, ExternalLink, GraduationCap, QrCode, Smartphone, Sparkles, UserCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/app/providers/ToastContext';
import { zaloApi, isZaloInvite, type ZaloShare } from '../api/zaloApi';
import '../zalo.css';

export function ZaloQr({ share }: { share: ZaloShare }) {
  const { t } = useTranslation();
  const [image, setImage] = useState<{ key: string; url: string; failed: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${share.id}-${share.version}-${attempt}`;

  useEffect(() => {
    if (!share.hasQr) return;
    const controller = new AbortController();
    let objectUrl = '';
    zaloApi.qr(share.id, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setImage({ key: requestKey, url: objectUrl, failed: false });
    }).catch(() => {
      if (!controller.signal.aborted) setImage({ key: requestKey, url: '', failed: true });
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [share.id, share.hasQr, requestKey]);

  const current = image?.key === requestKey ? image : null;
  if (!share.hasQr) {
    return (
      <div className="zalo-qr-placeholder">
        <QrCode aria-hidden="true" size={38} />
        <span>{t('zalo.noQr')}</span>
      </div>
    );
  }
  if (current?.failed) {
    return (
      <div role="alert" className="zalo-qr-placeholder">
        <p>{t('zalo.qrFailed')}</p>
        <Button size="small" onClick={() => setAttempt(value => value + 1)}>{t('zalo.retry')}</Button>
      </div>
    );
  }
  if (!current?.url) return <Skeleton.Image active aria-label={t('zalo.loadingQr')} />;
  return <img className="zalo-qr-image" src={current.url} alt={t('zalo.qrAlt', { title: share.title })} />;
}

export function ZaloShareCard({ share, preview = false }: { share: ZaloShare; preview?: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const safe = isZaloInvite(share.inviteUrl);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(share.inviteUrl);
      setCopied(true);
      toast.success(t('zalo.copied'));
    } catch {
      toast.error(t('zalo.copyFailed'));
    }
  };

  const isClass = share.scope === 'CLASS';

  return (
    <article className="zalo-share-card">
      <div className="zalo-card-heading">
        <div className="zalo-card-avatar" aria-hidden="true">
          {isClass ? <GraduationCap size={22} /> : <UserCheck size={22} />}
        </div>
        <div className="zalo-card-meta">
          <div className="zalo-card-tags">
            <Tag color={isClass ? 'blue' : 'purple'} className="zalo-tag">
              {t(isClass ? 'zalo.classScope' : 'zalo.lecturerScope')}
            </Tag>
            {share.termName && (
              <Tag className="zalo-tag">
                {share.termName}
              </Tag>
            )}
          </div>
          <h3>{share.title}</h3>
          <div className="zalo-card-subtitle">
            <span>{isClass ? share.className : share.lecturerName}</span>
            {share.termName && <span>· {share.termName}</span>}
          </div>
        </div>
      </div>

      <div className="zalo-card-content">
        <div className="zalo-qr-container">
          <div className={`zalo-qr${share.hasQr ? '' : ' zalo-qr-empty'}`}>
            <ZaloQr share={share} />
          </div>
          {share.hasQr && (
            <div className="zalo-scan-prompt">
              <Smartphone size={13} aria-hidden="true" />
              <span>{t('zalo.scanHint')}</span>
            </div>
          )}
        </div>

        <div className="zalo-share-copy">
          {share.description ? (
            <div className="zalo-description-quote">
              <p className="zalo-description">{share.description}</p>
            </div>
          ) : (
            <p className="zalo-helper">{t('zalo.scanHint')}</p>
          )}

          {safe ? (
            <>
              <div className="zalo-link-wrapper">
                <span className="zalo-link-icon"><ExternalLink size={14} aria-hidden="true" /></span>
                <a className="zalo-invite-link" href={share.inviteUrl} target="_blank" rel="noopener noreferrer">
                  {share.inviteUrl}
                </a>
              </div>

              <div className="zalo-action-row">
                <Button
                  type="primary"
                  className="zalo-btn-primary"
                  href={share.inviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  icon={<ExternalLink size={15} />}
                >
                  {t('zalo.join')}
                </Button>
                <Button
                  className="zalo-btn-secondary"
                  icon={copied ? <Check size={15} color="#16a34a" /> : <Copy size={15} />}
                  onClick={() => void copy()}
                >
                  {t('zalo.copy')}
                </Button>
              </div>
            </>
          ) : (
            <Alert type="warning" title={t('zalo.invalidLink')} />
          )}

          {preview && (
            <div className="zalo-preview-badge">
              <Sparkles size={13} aria-hidden="true" />
              <span>{t('zalo.studentPreview')}</span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function ZaloEmpty({ scope }: { scope: 'CLASS' | 'LECTURER' }) {
  const { t } = useTranslation();
  return (
    <div className="zalo-empty">
      <div className="zalo-empty-icon" aria-hidden="true">
        {scope === 'CLASS' ? <GraduationCap size={26} /> : <UserCheck size={26} />}
      </div>
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={t(scope === 'CLASS' ? 'zalo.emptyClass' : 'zalo.emptyLecturer')}
      />
      <p className="zalo-empty-hint">
        {scope === 'CLASS'
          ? 'Nhóm Zalo riêng của lớp học sẽ xuất hiện tại đây khi giảng viên chia sẻ.'
          : 'Nhóm Zalo chung của giảng viên sẽ xuất hiện tại đây khi được cấu hình.'}
      </p>
    </div>
  );
}
