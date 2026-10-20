import React, { useState, useEffect } from 'react';
import { Button, Modal, Input, message, Popconfirm, Tag, Tooltip } from 'antd';
import { Edit3, Trash2, PlusCircle, Quote, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { profileApi } from '@/features/students/api/profileApi';

const { TextArea } = Input;

interface StudentBioCardProps {
  initialBio?: string | null;
  onBioUpdated?: (newBio: string | null) => void;
}

const QUICK_TAGS = [
  '#Frontend',
  '#Backend',
  '#Fullstack',
  '#UIUX',
  '#Tester',
  '#BusinessAnalyst',
  '#Leader',
  '#DevOps',
];

export const StudentBioCard: React.FC<StudentBioCardProps> = ({ initialBio, onBioUpdated }) => {
  const { t } = useTranslation();
  const [bio, setBio] = useState<string>(initialBio || '');
  const [modalOpen, setModalOpen] = useState(false);
  const [draftBio, setDraftBio] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setBio(initialBio || '');
  }, [initialBio]);

  const handleOpenEdit = () => {
    setDraftBio(bio);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const trimmed = draftBio.trim();
    if (trimmed.length > 500) {
      message.error(t('studentGroup.bio.tooLong', 'Mô tả tối đa 500 ký tự'));
      return;
    }
    setLoading(true);
    try {
      if (trimmed === '') {
        await profileApi.deleteBio();
        setBio('');
        if (onBioUpdated) onBioUpdated(null);
        message.success(t('studentGroup.bio.deletedSuccess', 'Đã xóa mô tả bản thân'));
      } else {
        const res = await profileApi.updateBio(trimmed);
        setBio(res.bio);
        if (onBioUpdated) onBioUpdated(res.bio);
        message.success(t('studentGroup.bio.updatedSuccess', 'Đã lưu mô tả bản thân thành công'));
      }
      setModalOpen(false);
    } catch (err) {
      console.error(err);
      message.error(t('studentGroup.bio.updateError', 'Không thể cập nhật mô tả. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await profileApi.deleteBio();
      setBio('');
      if (onBioUpdated) onBioUpdated(null);
      message.success(t('studentGroup.bio.deletedSuccess', 'Đã xóa mô tả bản thân'));
    } catch (err) {
      console.error(err);
      message.error(t('studentGroup.bio.deleteError', 'Không thể xóa mô tả. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  };

  const handleAppendTag = (tag: string) => {
    if (draftBio.includes(tag)) return;
    setDraftBio((prev) => (prev ? `${prev.trim()} ${tag}` : tag));
  };

  const hasBio = Boolean(bio && bio.trim());

  return (
    <>
      <div
        style={{
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: '14px 16px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                backgroundColor: '#eff6ff',
                color: 'var(--color-primary, #2563eb)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Quote size={15} />
            </div>
            <div>
              <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0f172a' }}>
                {t('studentGroup.bio.cardTitle', 'Mô tả tìm nhóm của bạn')}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: 8 }}>
                {t('studentGroup.bio.cardSubtitle', '(Người khác hover vào tên bạn sẽ thấy mô tả này)')}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {hasBio ? (
              <>
                <Tooltip title={t('common.edit', 'Chỉnh sửa')}>
                  <Button
                    size="small"
                    type="text"
                    icon={<Edit3 size={14} color="#2563eb" />}
                    onClick={handleOpenEdit}
                  />
                </Tooltip>
                <Popconfirm
                  title={t('studentGroup.bio.deleteConfirmTitle', 'Xóa mô tả bản thân?')}
                  description={t('studentGroup.bio.deleteConfirmDesc', 'Bạn có chắc muốn xóa mô tả này không?')}
                  onConfirm={handleDelete}
                  okText={t('common.confirm', 'Xác nhận')}
                  cancelText={t('common.cancel', 'Hủy')}
                  okButtonProps={{ danger: true }}
                >
                  <Tooltip title={t('common.delete', 'Xóa')}>
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<Trash2 size={14} />}
                      loading={loading}
                    />
                  </Tooltip>
                </Popconfirm>
              </>
            ) : (
              <Button
                type="primary"
                size="small"
                icon={<PlusCircle size={14} />}
                onClick={handleOpenEdit}
                style={{ borderRadius: 6, fontSize: '0.75rem' }}
              >
                {t('studentGroup.bio.addBtn', 'Thêm mô tả')}
              </Button>
            )}
          </div>
        </div>

        {hasBio ? (
          <div
            style={{
              fontSize: '0.8125rem',
              color: '#334155',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '8px 12px',
              fontStyle: 'italic',
              whiteSpace: 'pre-line',
              wordBreak: 'break-word',
            }}
          >
            "{bio}"
          </div>
        ) : (
          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            {t(
              'studentGroup.bio.bannerHint',
              'Hãy viết vài dòng giới thiệu về thế mạnh kỹ năng và vai trò bạn hướng tới để các nhóm dễ dàng liên hệ và đề xuất bạn!'
            )}
          </div>
        )}
      </div>

      {/* Edit Bio Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} color="var(--color-primary, #2563eb)" />
            <span>{t('studentGroup.bio.modalTitle', 'Cập nhật mô tả tìm nhóm')}</span>
          </div>
        }
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={loading}
        okText={t('common.save', 'Lưu mô tả')}
        cancelText={t('common.cancel', 'Hủy')}
        centered
        destroyOnClose
      >
        <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: 12 }}>
          {t(
            'studentGroup.bio.modalHelp',
            'Giới thiệu ngắn gọn các kỹ năng, công nghệ bạn thành thạo, vai trò mong muốn hoặc định hướng làm việc trong nhóm (tối đa 500 ký tự).'
          )}
        </p>

        <div style={{ marginBottom: 10 }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginRight: 6 }}>
            {t('studentGroup.bio.quickTags', 'Gợi ý tags:')}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {QUICK_TAGS.map((tag) => (
              <Tag
                key={tag}
                onClick={() => handleAppendTag(tag)}
                style={{
                  cursor: 'pointer',
                  borderRadius: 4,
                  fontSize: '0.75rem',
                  borderColor: '#cbd5e1',
                }}
              >
                + {tag}
              </Tag>
            ))}
          </div>
        </div>

        <TextArea
          rows={4}
          value={draftBio}
          onChange={(e) => setDraftBio(e.target.value)}
          placeholder={t(
            'studentGroup.bio.modalPlaceholder',
            'Ví dụ: Em mạnh về React/TypeScript & Tailwind. Có kinh nghiệm làm UI/UX và muốn thử sức vai trò Frontend/Leader...'
          )}
          maxLength={500}
          showCount
          autoFocus
        />
      </Modal>
    </>
  );
};
