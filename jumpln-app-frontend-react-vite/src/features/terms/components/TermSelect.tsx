import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, Plus, Check, Info } from 'lucide-react';
import { termApi } from '../api/termApi';
import type { Term } from '../types';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { useToast } from '@/app/providers/ToastContext';

interface TermSelectProps {
  selectedTermId: number | null;
  onSelectTerm: (termId: number) => void;
  disabled?: boolean;
}

const SEASONS = [
  { code: 'SP', range: 'Tháng 1 – 4' },
  { code: 'SU', range: 'Tháng 5 – 8' },
  { code: 'FALL', range: 'Tháng 9 – 12' },
] as const;

const TERM_REGEX = /^(SP|SU|FALL)\d{2}$/;

/**
 * CSS đi kèm component (không phụ thuộc Tailwind) để giao diện luôn hiển thị đúng.
 * Đổi màu nhấn ở biến --ts-accent nếu cần.
 */
const STYLES = `
.ts-root{
  --ts-accent:#4f6bed; --ts-accent-soft:#eef1fe; --ts-accent-soft-hover:#e0e6fd;
  --ts-border:#e5e7eb; --ts-text:#111827; --ts-muted:#6b7280; --ts-danger:#dc2626; --ts-ok:#059669;
  display:inline-flex; flex-wrap:wrap; align-items:center; gap:8px; padding:6px;
  background:#fff; border:1px solid var(--ts-border); border-radius:16px;
  box-shadow:0 1px 2px rgba(16,24,40,.05); font-family:inherit;
}
.ts-label{display:flex; align-items:center; gap:10px; padding:0 4px 0 8px; font-size:14px; font-weight:500; color:#4b5563; white-space:nowrap}
.ts-label-icon{display:flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:10px; background:var(--ts-accent-soft); color:var(--ts-accent)}
.ts-select-wrap{position:relative; min-width:200px}
.ts-select{
  width:100%; appearance:none; -webkit-appearance:none; padding:10px 40px 10px 14px;
  font:600 14px/1.2 inherit; color:var(--ts-text); background:#f3f4f6; border:1px solid transparent;
  border-radius:12px; cursor:pointer; transition:background .15s, border-color .15s, box-shadow .15s;
}
.ts-select:hover:not(:disabled){background:#eceef1}
.ts-select:focus{outline:none; background:#fff; border-color:var(--ts-accent); box-shadow:0 0 0 4px rgba(79,107,237,.15)}
.ts-select:disabled{opacity:.6; cursor:not-allowed}
.ts-chevron{position:absolute; right:14px; top:50%; transform:translateY(-50%); width:16px; height:16px; color:#9ca3af; pointer-events:none}
.ts-badge{display:inline-flex; align-items:center; gap:6px; padding:4px 10px; font-size:12px; font-weight:600; color:#047857; background:#ecfdf5; border-radius:999px; white-space:nowrap}
.ts-dot{position:relative; display:inline-flex; width:6px; height:6px}
.ts-dot::before,.ts-dot::after{content:""; position:absolute; inset:0; border-radius:50%; background:#10b981}
.ts-dot::before{opacity:.6; animation:ts-ping 1.6s cubic-bezier(0,0,.2,1) infinite}
@keyframes ts-ping{75%,100%{transform:scale(2.4); opacity:0}}
@media (prefers-reduced-motion:reduce){.ts-dot::before{animation:none}}
.ts-sep{width:1px; height:24px; background:var(--ts-border)}
.ts-add{
  display:inline-flex; align-items:center; gap:6px; padding:10px 16px; font:600 14px/1.2 inherit;
  color:var(--ts-accent); background:var(--ts-accent-soft); border:none; border-radius:12px; cursor:pointer;
  transition:background .15s, transform .1s;
}
.ts-add:hover:not(:disabled){background:var(--ts-accent-soft-hover)}
.ts-add:active:not(:disabled){transform:scale(.98)}
.ts-add:focus-visible{outline:none; box-shadow:0 0 0 4px rgba(79,107,237,.25)}
.ts-add:disabled{opacity:.5; cursor:not-allowed}

/* Modal */
.ts-form{display:flex; flex-direction:column; gap:20px}
.ts-field-title{margin:0 0 8px; font-size:14px; font-weight:600; color:#374151}
.ts-seasons{display:grid; grid-template-columns:repeat(3,1fr); gap:8px}
.ts-season{
  position:relative; display:flex; flex-direction:column; align-items:flex-start; gap:2px; padding:12px 14px;
  text-align:left; background:#fff; border:1px solid var(--ts-border); border-radius:12px; cursor:pointer;
  font-family:inherit; transition:border-color .15s, background .15s, box-shadow .15s;
}
.ts-season:hover{border-color:#cbd5e1; background:#f9fafb}
.ts-season:focus-visible{outline:none; box-shadow:0 0 0 4px rgba(79,107,237,.2)}
.ts-season[aria-pressed="true"]{border-color:var(--ts-accent); background:var(--ts-accent-soft); box-shadow:0 0 0 1px var(--ts-accent)}
.ts-season-code{font-size:15px; font-weight:700; color:var(--ts-text)}
.ts-season[aria-pressed="true"] .ts-season-code{color:var(--ts-accent)}
.ts-season-range{font-size:12px; color:var(--ts-muted)}
.ts-season-check{position:absolute; top:10px; right:10px; width:14px; height:14px; color:var(--ts-accent)}
.ts-input-wrap{position:relative}
.ts-input{
  box-sizing:border-box; width:100%; padding:12px 44px 12px 16px; font:600 16px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  letter-spacing:.12em; text-transform:uppercase; color:var(--ts-text); background:#f3f4f6;
  border:1px solid transparent; border-radius:12px; transition:background .15s, border-color .15s, box-shadow .15s;
}
.ts-input::placeholder{font-family:inherit; font-weight:400; letter-spacing:normal; text-transform:none; color:#9ca3af}
.ts-input:focus{outline:none; background:#fff; border-color:var(--ts-accent); box-shadow:0 0 0 4px rgba(79,107,237,.15)}
.ts-input[aria-invalid="true"]{border-color:#f87171}
.ts-input[aria-invalid="true"]:focus{border-color:var(--ts-danger); box-shadow:0 0 0 4px rgba(220,38,38,.15)}
.ts-ok{position:absolute; right:12px; top:50%; transform:translateY(-50%); display:flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:50%; background:#d1fae5; color:var(--ts-ok)}
.ts-hint{display:flex; align-items:flex-start; gap:6px; margin:8px 0 0; font-size:12px; line-height:1.5; color:var(--ts-muted)}
.ts-hint svg{flex-shrink:0; width:14px; height:14px; margin-top:2px}
.ts-error{margin:8px 0 0; font-size:13px; color:var(--ts-danger)}
.ts-actions{display:flex; justify-content:flex-end; gap:8px; padding-top:16px; border-top:1px solid #f3f4f6}
@media (max-width:480px){.ts-seasons{grid-template-columns:1fr}}
`;

export const TermSelect: React.FC<TermSelectProps> = ({
                                                        selectedTermId,
                                                        onSelectTerm,
                                                        disabled = false,
                                                      }) => {
  const { success, error: toastError } = useToast();
  const [terms, setTerms] = useState<Term[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Modal create term state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [newTermName, setNewTermName] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchTerms = async () => {
    try {
      setIsLoading(true);
      const data = await termApi.getTerms(true);
      setTerms(data);

      // If no term selected yet, default to the current active term
      if (selectedTermId === null && data.length > 0) {
        const current = data.find((t) => t.isCurrent);
        onSelectTerm(current ? current.id : data[0].id);
      }
    } catch (err: any) {
      toastError(err?.response?.data?.message || 'Không thể tải danh sách học kỳ.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTerms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedTerm = useMemo(
      () => terms.find((t) => t.id === selectedTermId) ?? null,
      [terms, selectedTermId],
  );

  const handleOpenModal = () => {
    setNewTermName('');
    setFormError(null);
    setIsModalOpen(true);
  };

  // Quick-pick: choose a season, keep the year digits if already typed
  const handlePickSeason = (code: string) => {
    const digits = newTermName.replace(/\D/g, '').slice(0, 2);
    const yy =
        digits.length === 2
            ? digits
            : String((new Date().getFullYear() + 1) % 100).padStart(2, '0');
    setNewTermName(`${code}${yy}`);
    if (formError) setFormError(null);
  };

  const activeSeason = SEASONS.find((s) => newTermName.startsWith(s.code))?.code;
  const isValidName = TERM_REGEX.test(newTermName.trim().toUpperCase());

  const handleCreateTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newTermName.trim().toUpperCase();

    if (!cleanName) {
      setFormError('Vui lòng nhập tên học kỳ.');
      return;
    }

    if (!TERM_REGEX.test(cleanName)) {
      setFormError('Định dạng học kỳ không hợp lệ. Ví dụ: SP27, SU27, FALL27');
      return;
    }

    try {
      setIsCreating(true);
      setFormError(null);
      const created = await termApi.createTerm({ name: cleanName });
      success(`Đã tạo thành công học kỳ ${created.name}`);
      setIsModalOpen(false);

      // Refresh terms list and select newly created term
      const updatedList = await termApi.getTerms(true);
      setTerms(updatedList);
      onSelectTerm(created.id);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Tạo học kỳ thất bại. Vui lòng kiểm tra lại.';
      setFormError(msg);
    } finally {
      setIsCreating(false);
    }
  };

  return (
      <div className="ts-root">
        <style>{STYLES}</style>

        <div className="ts-label">
        <span className="ts-label-icon">
          <CalendarDays size={16} />
        </span>
          <span>Học kỳ áp dụng</span>
        </div>

        <div className="ts-select-wrap">
          <select
              className="ts-select"
              value={selectedTermId ?? ''}
              onChange={(e) => onSelectTerm(Number(e.target.value))}
              disabled={disabled || isLoading}
              aria-label="Chọn học kỳ"
          >
            {isLoading ? (
                <option value="">Đang tải học kỳ...</option>
            ) : terms.length === 0 ? (
                <option value="">Không có học kỳ khả dụng</option>
            ) : (
                terms.map((term) => (
                    <option key={term.id} value={term.id}>
                      {term.name}
                      {term.isCurrent ? ' (Hiện tại)' : ''}
                    </option>
                ))
            )}
          </select>
          <ChevronDown className="ts-chevron" />
        </div>

        {selectedTerm?.isCurrent && (
            <span className="ts-badge">
          <span className="ts-dot" />
          Đang diễn ra
        </span>
        )}

        <span className="ts-sep" />

        <button
            type="button"
            className="ts-add"
            onClick={handleOpenModal}
            disabled={disabled}
            title="Tạo học kỳ tương lai"
        >
          <Plus size={16} />
          <span>Tạo kỳ mới</span>
        </button>

        <Modal
            open={isModalOpen}
            onClose={() => {
              if (!isCreating) setIsModalOpen(false);
            }}
            title="Tạo học kỳ mới"
            maxWidth="480px"
        >
          <form onSubmit={handleCreateTerm} className="ts-form">
            <div>
              <p className="ts-field-title">Chọn kỳ</p>
              <div className="ts-seasons">
                {SEASONS.map((s) => {
                  const active = activeSeason === s.code;
                  return (
                      <button
                          key={s.code}
                          type="button"
                          className="ts-season"
                          aria-pressed={active}
                          onClick={() => handlePickSeason(s.code)}
                      >
                        {active && <Check className="ts-season-check" />}
                        <span className="ts-season-code">{s.code}</span>
                        <span className="ts-season-range">{s.range}</span>
                      </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="term-name" className="ts-field-title" style={{ display: 'block' }}>
                Tên học kỳ <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div className="ts-input-wrap">
                <input
                    id="term-name"
                    className="ts-input"
                    type="text"
                    value={newTermName}
                    onChange={(e) => {
                      setNewTermName(e.target.value.toUpperCase());
                      if (formError) setFormError(null);
                    }}
                    placeholder="VD: SP27 hoặc FALL27"
                    maxLength={10}
                    aria-invalid={!!formError}
                    autoFocus
                />
                {isValidName && (
                    <span className="ts-ok">
                  <Check size={14} />
                </span>
                )}
              </div>
              {formError ? (
                  <p role="alert" className="ts-error">
                    {formError}
                  </p>
              ) : (
                  <p className="ts-hint">
                    <Info />
                    <span>
                  Mỗi năm có 3 kỳ: SP (tháng 1–4), SU (tháng 5–8), FALL (tháng 9–12), theo sau là 2
                  số cuối của năm.
                </span>
                  </p>
              )}
            </div>

            <div className="ts-actions">
              <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isCreating}
              >
                Hủy
              </Button>
              <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={isCreating}
                  disabled={!newTermName.trim()}
              >
                Tạo học kỳ
              </Button>
            </div>
          </form>
        </Modal>
      </div>
  );
};