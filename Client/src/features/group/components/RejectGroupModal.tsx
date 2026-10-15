import React, { useState } from 'react';
import { Modal, Form, Input, Button } from 'antd';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface RejectGroupModalProps {
  open: boolean;
  groupId: number | null;
  onClose: () => void;
  onSubmit: (groupId: number, reason: string) => Promise<void>;
  isLoading?: boolean;
}

export const RejectGroupModal: React.FC<RejectGroupModalProps> = ({
  open,
  groupId,
  onClose,
  onSubmit,
  isLoading,
}) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const handleFinish = async (values: { reason: string }) => {
    if (!groupId) return;
    try {
      setSubmitting(true);
      await onSubmit(groupId, values.reason.trim());
      form.resetFields();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.125rem', color: '#dc2626' }}>
          <AlertCircle size={20} />
          <span>{t('groupWorkspace.rejectModal.title')}</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
    >
      <p style={{ color: 'var(--color-text-muted, #64748b)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
        {t('groupWorkspace.rejectModal.description')}
      </p>

      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="reason"
          label={t('groupWorkspace.rejectModal.reasonLabel')}
          rules={[
            { required: true, message: t('groupWorkspace.rejectModal.reasonRequired') },
            { min: 5, message: t('groupWorkspace.rejectModal.reasonMin') },
          ]}
        >
          <Input.TextArea
            rows={4}
            placeholder={t('groupWorkspace.rejectModal.reasonPlaceholder')}
          />
        </Form.Item>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1.5rem' }}>
          <Button onClick={onClose} disabled={submitting || isLoading}>
            {t('groupWorkspace.rejectModal.cancel')}
          </Button>
          <Button danger type="primary" htmlType="submit" loading={submitting || isLoading}>
            {t('groupWorkspace.rejectModal.confirm')}
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

