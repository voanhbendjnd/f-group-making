import React, { useState } from 'react';
import { Modal, Form, Input, Button } from 'antd';
import { AlertCircle } from 'lucide-react';

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
          <span>Từ Chối Phê Duyệt Nhóm</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
    >
      <p style={{ color: 'var(--color-text-muted, #64748b)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
        Vui lòng nhập lý do từ chối để sinh viên hiểu rõ và tiến hành điều chỉnh nhóm:
      </p>

      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="reason"
          label="Lý do từ chối (Bắt buộc)"
          rules={[
            { required: true, message: 'Vui lòng nhập lý do từ chối' },
            { min: 5, message: 'Lý do phải có ít nhất 5 ký tự' },
          ]}
        >
          <Input.TextArea
            rows={4}
            placeholder="Ví dụ: Nhóm chưa đủ sinh viên chuyên ngành SE; Cần thêm 1 thành viên nữa theo quy chế..."
          />
        </Form.Item>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1.5rem' }}>
          <Button onClick={onClose} disabled={submitting || isLoading}>
            Hủy
          </Button>
          <Button danger type="primary" htmlType="submit" loading={submitting || isLoading}>
            Xác Nhận Từ Chối
          </Button>
        </div>
      </Form>
    </Modal>
  );
};
