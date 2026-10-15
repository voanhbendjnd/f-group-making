import React, { useState } from 'react';
import { Modal, Form, Input, Button } from 'antd';
import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CreateGroupModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
  isLoading?: boolean;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  open,
  onClose,
  onSubmit,
  isLoading,
}) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const handleFinish = async (values: { name: string }) => {
    try {
      setSubmitting(true);
      await onSubmit(values.name.trim());
      form.resetFields();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.125rem' }}>
          <Users size={20} color="var(--color-primary, #2563eb)" />
          <span>{t('studentGroup.createModal.title')}</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      width="min(92vw, 520px)"
    >
      <p style={{ color: 'var(--color-text-muted, #64748b)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
        {t('studentGroup.createModal.description')}
      </p>

      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="name"
          label={t('studentGroup.createModal.nameLabel')}
          rules={[
            { required: true, message: t('studentGroup.createModal.nameRequired') },
            { min: 2, message: t('studentGroup.createModal.nameMin') },
            { max: 100, message: t('studentGroup.createModal.nameMax') },
          ]}
        >
          <Input placeholder={t('studentGroup.createModal.namePlaceholder')} size="large" autoFocus />
        </Form.Item>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1.5rem' }}>
          <Button onClick={onClose} disabled={submitting || isLoading}>
            {t('studentGroup.createModal.cancel')}
          </Button>
          <Button type="primary" htmlType="submit" loading={submitting || isLoading} size="large">
            {t('studentGroup.createModal.submit')}
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

