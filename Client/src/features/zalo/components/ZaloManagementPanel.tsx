import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, Modal, Skeleton, Space, Tag, Upload } from 'antd';
import type { UploadProps } from 'antd';
import { GraduationCap, ImagePlus, Info, Pencil, RefreshCw, Save, Trash2, UserCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/providers/AuthContext';
import { useTerm } from '@/app/providers/TermContext';
import { useToast } from '@/app/providers/ToastContext';
import { zaloError } from '../api/zaloErrors';
import { zaloApi, isZaloInvite, type ZaloShare, type ZaloWrite, type ZaloTarget } from '../api/zaloApi';
import { ZaloShareCard, ZaloQr, ZaloEmpty } from './ZaloShareCard';

export function ZaloManagementPanel({ target }: { target: ZaloTarget }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const client = useQueryClient();
  const { lockTermSelection } = useTerm();
  const key = ['zalo-management', user?.id, target];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => zaloApi.management(target, signal),
    retry: false,
    gcTime: 0
  });

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);
  const share = query.data ?? undefined;

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: key });
    await client.invalidateQueries({ queryKey: ['zalo-mine'] });
  };

  const remove = async () => {
    if (!share || busy.current) return;
    busy.current = true;
    setDeleting(true);
    setError(null);
    const unlock = lockTermSelection();
    try {
      await zaloApi.remove(target, share);
      toast.success(t('zalo.deleted'));
      await refresh();
    } catch (err) {
      setError(err);
    } finally {
      busy.current = false;
      setDeleting(false);
      unlock();
    }
  };

  const isClass = target.scope === 'CLASS';

  return (
    <section className="zalo-management">
      <div className="zalo-panel-hero">
        <div className="zalo-hero-content">
          <div className="zalo-hero-icon" aria-hidden="true">
            {isClass ? <GraduationCap size={26} /> : <UserCheck size={26} />}
          </div>
          <div>
            <div className="zalo-hero-title-group">
              <h2>{t('zalo.title')}</h2>
              <span className="zalo-badge-official">
                {t(isClass ? 'zalo.classScope' : 'zalo.lecturerScope')}
              </span>
            </div>
            <p>{t('zalo.manageDescription')}</p>
          </div>
        </div>
        <Button
          className="zalo-refresh-button"
          icon={<RefreshCw size={14} className={query.isFetching ? 'animate-spin' : ''} />}
          disabled={editing || deleting}
          loading={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {t('zalo.refresh')}
        </Button>
      </div>

      <Alert
        type="info"
        showIcon
        icon={<Info size={18} />}
        title={t(isClass ? 'zalo.classVisibility' : 'zalo.lecturerVisibility')}
      />

      {query.isPending ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : query.isError && !query.data ? (
        <Alert
          type="error"
          showIcon
          title={zaloError(query.error, t)}
          action={<Button onClick={() => void query.refetch()}>{t('zalo.retry')}</Button>}
        />
      ) : (
        <>
          {error != null && <Alert type="error" showIcon title={zaloError(error, t)} />}
          {editing ? (
            <ZaloEditor
              target={target}
              share={share}
              onCancel={() => setEditing(false)}
              onSaved={async () => {
                await refresh();
                setEditing(false);
              }}
            />
          ) : (
            <>
              {share ? <ZaloShareCard share={share} preview /> : <ZaloEmpty scope={target.scope} />}
              <div className="zalo-actions">
                <Button
                  type="primary"
                  className="zalo-btn-primary"
                  icon={<Pencil size={15} />}
                  disabled={deleting}
                  onClick={() => setEditing(true)}
                >
                  {t(share ? 'zalo.edit' : 'zalo.create')}
                </Button>
                {share && (
                  <Button
                    danger
                    icon={<Trash2 size={15} />}
                    loading={deleting}
                    onClick={() =>
                      Modal.confirm({
                        title: t('zalo.deleteTitle'),
                        content: t('zalo.deleteDescription'),
                        okText: t('zalo.delete'),
                        cancelText: t('zalo.cancel'),
                        okButtonProps: { danger: true },
                        onOk: remove
                      })
                    }
                  >
                    {t('zalo.delete')}
                  </Button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function ZaloEditor({
  target,
  share: currentShare,
  onSaved,
  onCancel
}: {
  target: ZaloTarget;
  share?: ZaloShare;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { lockTermSelection } = useTerm();
  const [share] = useState(currentShare);
  const [file, setFile] = useState<File | null>(null);
  const [removeQr, setRemoveQr] = useState(false);
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [fileError, setFileError] = useState('');
  const busy = useRef(false);
  const [form] = Form.useForm<{ title: string; inviteUrl: string; description: string }>();
  const values = Form.useWatch([], form);

  const beforeUpload: UploadProps['beforeUpload'] = selected => {
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) ||
      !/\.(png|jpe?g|webp)$/i.test(selected.name)
    ) {
      setFileError('zaloImageType');
      return Upload.LIST_IGNORE;
    }
    if (!selected.size || selected.size > 5 * 1024 * 1024) {
      setFileError('zaloImageSize');
      return Upload.LIST_IGNORE;
    }
    setFileError('');
    setFile(selected);
    setRemoveQr(false);
    return false;
  };

  const submit = async (input: { title: string; inviteUrl: string; description?: string }) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    const unlock = lockTermSelection();
    try {
      const data: ZaloWrite = {
        scope: target.scope,
        title: input.title.trim(),
        inviteUrl: input.inviteUrl.trim(),
        description: input.description?.trim() || '',
        version: share?.version ?? null,
        removeQr
      };
      await zaloApi.save(target, data, file);
      toast.success(t('zalo.saved'));
      await onSaved();
    } catch (err) {
      setError(err);
    } finally {
      busy.current = false;
      setPending(false);
      unlock();
    }
  };

  const isClass = target.scope === 'CLASS';

  return (
    <div className="zalo-editor">
      <div className="zalo-editor-header">
        <div className="zalo-editor-title">
          <Pencil size={18} />
          <span>{t(share ? 'zalo.edit' : 'zalo.create')}</span>
        </div>
        <Tag color={isClass ? 'blue' : 'purple'} className="zalo-tag">
          {t(isClass ? 'zalo.classScope' : 'zalo.lecturerScope')}
        </Tag>
      </div>

      <Form
        form={form}
        layout="vertical"
        disabled={pending}
        initialValues={{
          title: share?.title ?? '',
          inviteUrl: share?.inviteUrl ?? '',
          description: share?.description ?? ''
        }}
        onFinish={submit}
      >
        <Form.Item
          label={t('zalo.name')}
          name="title"
          rules={[
            { required: true, whitespace: true, message: t('zalo.required') },
            { max: 100, message: t('zalo.titleLimit') }
          ]}
        >
          <Input maxLength={100} placeholder={t('zalo.namePlaceholder')} />
        </Form.Item>

        <Form.Item
          label={t('zalo.link')}
          name="inviteUrl"
          rules={[
            { required: true, message: t('zalo.required') },
            {
              validator: (_, value: string) =>
                !value || isZaloInvite(value)
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('zalo.invalidLink')))
            }
          ]}
        >
          <Input maxLength={512} placeholder="https://zalo.me/g/..." />
        </Form.Item>

        <Form.Item
          label={t('zalo.description')}
          name="description"
          rules={[{ max: 500, message: t('zalo.descriptionLimit') }]}
        >
          <Input.TextArea rows={3} maxLength={500} showCount placeholder={t('zalo.descriptionPlaceholder')} />
        </Form.Item>

        <Form.Item
          label={t('zalo.qrLabel')}
          help={fileError ? t(`zalo.errors.${fileError}`) : t('zalo.fileHint')}
          validateStatus={fileError ? 'error' : undefined}
        >
          <Upload
            accept=".png,.jpg,.jpeg,.webp"
            maxCount={1}
            beforeUpload={beforeUpload}
            disabled={pending}
            fileList={file ? [{ uid: 'qr', name: file.name, originFileObj: file as never }] : []}
            onRemove={() => {
              setFile(null);
              return true;
            }}
          >
            <Button icon={<ImagePlus size={16} />} disabled={pending}>
              {t('zalo.chooseQr')}
            </Button>
          </Upload>

          {share?.hasQr && !file && !removeQr && (
            <div className="zalo-existing-qr">
              <ZaloQr share={share} />
              <Button danger onClick={() => setRemoveQr(true)}>
                {t('zalo.removeQr')}
              </Button>
            </div>
          )}

          {removeQr && (
            <Space style={{ marginTop: 8 }}>
              <span>{t('zalo.qrWillRemove')}</span>
              <Button type="link" onClick={() => setRemoveQr(false)}>
                {t('zalo.undoRemove')}
              </Button>
            </Space>
          )}
        </Form.Item>

        {error != null && <Alert role="alert" type="error" showIcon title={zaloError(error, t)} style={{ marginBottom: 16 }} />}

        <div className="zalo-actions">
          <Button onClick={onCancel} disabled={pending}>
            {t('zalo.cancel')}
          </Button>
          <Button onClick={() => setPreview(true)} disabled={pending}>
            {t('zalo.preview')}
          </Button>
          <Button
            type="primary"
            className="zalo-btn-primary"
            htmlType="submit"
            icon={<Save size={15} />}
            loading={pending}
          >
            {t('zalo.save')}
          </Button>
        </div>
      </Form>

      <Modal
        open={preview}
        title={t('zalo.preview')}
        footer={null}
        onCancel={() => setPreview(false)}
        width={680}
      >
        <div className="zalo-draft-preview">
          <Tag color={isClass ? 'blue' : 'purple'} className="zalo-tag">
            {t(isClass ? 'zalo.classScope' : 'zalo.lecturerScope')}
          </Tag>
          <h3>{values?.title || t('zalo.name')}</h3>
          {values?.description && (
            <div className="zalo-description-quote">
              <p className="zalo-description">{values.description}</p>
            </div>
          )}
          <div className="zalo-qr-container" style={{ alignSelf: 'flex-start' }}>
            <div className="zalo-qr">
              {file ? (
                <LocalQr file={file} />
              ) : share && !removeQr ? (
                <ZaloQr share={share} />
              ) : (
                <div className="zalo-qr-placeholder">
                  <span>{t('zalo.noQr')}</span>
                </div>
              )}
            </div>
          </div>
          <p className="zalo-helper">{t('zalo.scanHint')}</p>
          <div className="zalo-link-wrapper">
            <span className="zalo-invite-link">{values?.inviteUrl || 'https://zalo.me/g/...'}</span>
          </div>
          <Alert type="info" title={t('zalo.unsavedPreview')} />
        </div>
      </Modal>
    </div>
  );
}

function LocalQr({ file }: { file: File }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setUrl(reader.result);
    };
    reader.readAsDataURL(file);
    return () => {
      reader.onload = null;
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
  }, [file]);
  return url ? <img src={url} className="zalo-qr-image" alt={t('zalo.localQrAlt')} /> : null;
}
