import React, { useState } from 'react';
import { Modal, Form, Input, Button } from 'antd';
import { Users } from 'lucide-react';

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
          <span>Tạo Nhóm Mới</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
    >
      <p style={{ color: 'var(--color-text-muted, #64748b)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
        Sau khi tạo, bạn sẽ tự động trở thành <strong>Trưởng nhóm (Leader)</strong>. Bạn có thể mời hoặc để các bạn khác tự tham gia.
      </p>

      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="name"
          label="Tên Nhóm"
          rules={[
            { required: true, message: 'Vui lòng nhập tên nhóm' },
            { min: 2, message: 'Tên nhóm phải có ít nhất 2 ký tự' },
            { max: 100, message: 'Tên nhóm không được vượt quá 100 ký tự' },
          ]}
        >
          <Input placeholder="Ví dụ: Nhóm Chiến Binh, Group Awesome, Team 01..." size="large" autoFocus />
        </Form.Item>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1.5rem' }}>
          <Button onClick={onClose} disabled={submitting || isLoading}>
            Hủy
          </Button>
          <Button type="primary" htmlType="submit" loading={submitting || isLoading} size="large">
            Xác Nhận Tạo
          </Button>
        </div>
      </Form>
    </Modal>
  );
};
