import React, { useState } from 'react';
import { Modal, Radio, Button, Tag } from 'antd';
import { Crown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GroupMemberDTO } from '../types/groupTypes';

interface TransferLeaderModalProps {
  open: boolean;
  members: GroupMemberDTO[];
  currentLeaderId: number;
  onClose: () => void;
  onSubmit: (newLeaderId: number) => Promise<void>;
  isLoading?: boolean;
}

export const TransferLeaderModal: React.FC<TransferLeaderModalProps> = ({
  open,
  members,
  currentLeaderId,
  onClose,
  onSubmit,
  isLoading,
}) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const candidates = members.filter((m) => m.studentId !== currentLeaderId);

  const handleConfirm = async () => {
    if (!selectedId) return;
    try {
      setSubmitting(true);
      await onSubmit(selectedId);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.125rem' }}>
          <Crown size={20} color="#eab308" />
          <span>{t('studentGroup.transferModal.title')}</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      width="min(92vw, 500px)"
    >
      <p style={{ color: 'var(--color-text-muted, #64748b)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
        {t('studentGroup.transferModal.description')}
      </p>

      {candidates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '1rem', color: '#94a3b8' }}>
          {t('studentGroup.transferModal.noCandidates')}
        </div>
      ) : (
        <Radio.Group
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}
        >
          {candidates.map((m) => (
            <Radio
              key={m.studentId}
              value={m.studentId}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--color-border, #e2e8f0)',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginLeft: '6px', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.9375rem', color: 'var(--color-text-main)' }}>{m.fullName}</strong>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>({m.rollNumber})</span>
                <Tag color={m.majorCode === 'SE' ? 'blue' : 'purple'}>{m.majorCode || 'N/A'}</Tag>
              </div>
            </Radio>
          ))}
        </Radio.Group>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1.5rem' }}>
        <Button onClick={onClose} disabled={submitting || isLoading}>
          {t('studentGroup.transferModal.cancel')}
        </Button>
        <Button
          type="primary"
          onClick={handleConfirm}
          disabled={!selectedId || submitting || isLoading}
          loading={submitting || isLoading}
        >
          {t('studentGroup.transferModal.confirm')}
        </Button>
      </div>
    </Modal>
  );
};

