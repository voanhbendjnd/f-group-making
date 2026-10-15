import React, { useState, useMemo } from 'react';
import { Modal, Form, Input, Select, Button, Alert } from 'antd';
import { UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      list.push(
        t('groupWorkspace.createModal.warningExceed', {
          count: selectedStudents.length,
          max: maxMembers,
        })
      );
    }
    return list;
  }, [selectedStudents, maxMembers, t]);

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
          <span>{t('groupWorkspace.createModal.title')}</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      destroyOnClose
    >
      <p style={{ color: 'var(--color-text-muted, #64748b)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
        {t('groupWorkspace.createModal.description')}
      </p>

      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="name"
          label={t('groupWorkspace.createModal.nameLabel')}
          rules={[
            { required: true, message: t('groupWorkspace.createModal.nameRequired') },
            { min: 2, message: t('groupWorkspace.createModal.nameMin') },
            { max: 100, message: t('groupWorkspace.createModal.nameMax') },
          ]}
        >
          <Input placeholder={t('groupWorkspace.createModal.namePlaceholder')} />
        </Form.Item>

        <Form.Item
          name="studentIds"
          label={t('groupWorkspace.createModal.studentsLabel', {
            count: selectedStudents.length,
            max: maxMembers,
          })}
          rules={[{ required: true, message: t('groupWorkspace.createModal.studentsRequired') }]}
        >
          <Select
            mode="multiple"
            placeholder={t('groupWorkspace.createModal.studentsPlaceholder')}
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
              <strong>{t('groupWorkspace.createModal.members')}:</strong> {selectedStudents.length} •{' '}
              <strong>{t('groupWorkspace.createModal.majors')}:</strong> {distinctMajorsCount} •{' '}
              <strong>{t('groupWorkspace.createModal.seStudents')}:</strong> {seCount}
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <Alert
            message={t('groupWorkspace.createModal.warningTitle')}
            description={warnings.join(' ')}
            type="warning"
            showIcon
            style={{ marginBottom: '1rem' }}
          />
        )}

        <Form.Item
          name="overrideReason"
          label={t('groupWorkspace.createModal.overrideLabel')}
          tooltip={t('groupWorkspace.createModal.overrideTooltip')}
        >
          <Input.TextArea
            rows={3}
            placeholder={t('groupWorkspace.createModal.overridePlaceholder')}
          />
        </Form.Item>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1.5rem' }}>
          <Button onClick={onClose} disabled={submitting || isLoading}>
            {t('groupWorkspace.createModal.cancel')}
          </Button>
          <Button type="primary" htmlType="submit" loading={submitting || isLoading} size="large">
            {t('groupWorkspace.createModal.submit')}
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

