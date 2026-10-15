import React, { useState, useMemo } from 'react';
import { Modal, Form, Input, Select, Button, Alert } from 'antd';
import { UserPlus } from 'lucide-react';
import type { GroupMemberDTO, GroupingRuleDTO } from '../types/groupTypes';

interface LecturerGroupModalProps {
  open: boolean;
  unassignedStudents: GroupMemberDTO[];
  rules?: GroupingRuleDTO[];
  maxMembers: number;
  onClose: () => void;
  onSubmit: (data: { name: string; studentIds: number[]; overrideReason?: string }) => Promise<void>;
  isLoading?: boolean;
}

export const LecturerGroupModal: React.FC<LecturerGroupModalProps> = ({
  open,
  unassignedStudents,
  maxMembers,
  onClose,
  onSubmit,
  isLoading,
}) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const selectedStudentIds = Form.useWatch('studentIds', form) || [];

  // Compute stats on currently selected students
  const selectedStudents = useMemo(() => {
    return unassignedStudents.filter((s) => selectedStudentIds.includes(s.studentId));
  }, [unassignedStudents, selectedStudentIds]);

  const distinctMajorsCount = useMemo(() => {
    return new Set(selectedStudents.map((s) => s.majorCode).filter(Boolean)).size;
  }, [selectedStudents]);

  const seCount = useMemo(() => {
    return selectedStudents.filter((s) => s.majorCode?.toUpperCase() === 'SE').length;
  }, [selectedStudents]);

  // Check rule warnings
  const warnings = useMemo(() => {
    const list: string[] = [];
    if (selectedStudents.length > 0 && selectedStudents.length > maxMembers) {
      list.push(`Số lượng chọn (${selectedStudents.length}) vượt quá mức tối đa (${maxMembers}).`);
    }
    return list;
  }, [selectedStudents, maxMembers]);

  const handleFinish = async (values: { name: string; studentIds: number[]; overrideReason?: string }) => {
    try {
      setSubmitting(true);
      await onSubmit({
        name: values.name.trim(),
        studentIds: values.studentIds,
        overrideReason: values.overrideReason?.trim(),
      });
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
          <UserPlus size={20} color="var(--color-primary, #2563eb)" />
          <span>Giảng Viên Tạo & Phân Công Nhóm Trực Tiếp</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      destroyOnClose
    >
      <p style={{ color: 'var(--color-text-muted, #64748b)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
        Nhóm do Giảng viên tạo sẽ được duyệt thẳng sang trạng thái <strong>ACCEPTED</strong>. Sinh viên đầu tiên trong danh sách được chọn sẽ mặc định là Trưởng nhóm.
      </p>

      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="name"
          label="Tên Nhóm"
          rules={[
            { required: true, message: 'Vui lòng nhập tên nhóm' },
            { min: 2, message: 'Tên nhóm phải có ít nhất 2 ký tự' },
            { max: 100, message: 'Tên nhóm tối đa 100 ký tự' },
          ]}
        >
          <Input placeholder="Ví dụ: Nhóm Xếp Bởi GV 01..." />
        </Form.Item>

        <Form.Item
          name="studentIds"
          label={`Chọn sinh viên chưa có nhóm (${selectedStudents.length}/${maxMembers})`}
          rules={[{ required: true, message: 'Vui lòng chọn ít nhất 1 sinh viên' }]}
        >
          <Select
            mode="multiple"
            placeholder="Chọn các sinh viên từ danh sách chưa có nhóm..."
            style={{ width: '100%' }}
            optionFilterProp="label"
            options={unassignedStudents.map((s) => ({
              value: s.studentId,
              label: `${s.fullName} (${s.rollNumber}) - ${s.majorCode || 'N/A'}`,
            }))}
          />
        </Form.Item>

        {/* Selected preview tags */}
        {selectedStudents.length > 0 && (
          <div
            style={{
              padding: '0.75rem',
              backgroundColor: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              marginBottom: '1rem',
              fontSize: '0.8125rem',
            }}
          >
            <div>
              <strong>Thành viên:</strong> {selectedStudents.length} • <strong>Chuyên ngành:</strong>{' '}
              {distinctMajorsCount} • <strong>Sinh viên SE:</strong> {seCount}
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <Alert
            message="Cảnh báo điều kiện nhóm"
            description={warnings.join(' ')}
            type="warning"
            showIcon
            style={{ marginBottom: '1rem' }}
          />
        )}

        <Form.Item
          name="overrideReason"
          label="Lý do ngoại lệ / Bỏ qua quy tắc (Nếu có)"
          tooltip="Nếu nhóm không thỏa mãn một số Soft Rules của lớp, giảng viên cần ghi rõ lý do để lưu vết audit."
        >
          <Input.TextArea
            rows={3}
            placeholder="Ghi rõ lý do đặc cách phân công hoặc lý do bỏ qua điều kiện chuyên ngành..."
          />
        </Form.Item>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1.5rem' }}>
          <Button onClick={onClose} disabled={submitting || isLoading}>
            Hủy
          </Button>
          <Button type="primary" htmlType="submit" loading={submitting || isLoading} size="large">
            Tạo & Phê Duyệt Nhóm
          </Button>
        </div>
      </Form>
    </Modal>
  );
};
