import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useTerm } from '@/app/providers/TermContext';
import { CalendarDays, ChevronDown, Plus, Check, Info } from 'lucide-react';
import { termApi } from '../api/termApi';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { useToast } from '@/app/providers/ToastContext';

interface TermSelectProps {
  compact?: boolean;
  disabled?: boolean;
  allowCreate?: boolean;
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

/* Term filter uses the existing F-Team design tokens. The menu is portalled. */
.ts-root{--ts-accent:var(--color-primary);--ts-accent-soft:var(--color-primary-light);--ts-accent-soft-hover:var(--color-primary-border);--ts-border:var(--color-border);--ts-text:var(--color-text-main);--ts-muted:var(--color-text-muted);--ts-danger:var(--color-error);--ts-ok:var(--color-success);background:var(--color-surface);box-shadow:var(--shadow-xs)}
.ts-label{color:var(--color-text-muted);min-width:0}
.ts-badge{margin-left:auto;gap:4px;padding:3px 7px;color:var(--color-success);background:var(--color-success-bg);font-size:11px}
.ts-dot::before,.ts-dot::after{background:var(--color-success)}
.ts-select{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:42px;text-align:left;font-family:inherit;font-size:14px;font-weight:600;line-height:1.4;padding:10px 12px;background:var(--color-surface-muted);border-color:var(--color-border);border-radius:var(--radius-md)}
.ts-select:hover:not(:disabled){background:var(--color-surface-hover);border-color:var(--color-border-hover)}
.ts-select:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px;box-shadow:none}
.ts-select:focus{border-color:var(--color-border-focus);background:var(--color-surface);box-shadow:none}
.ts-chevron{position:static;transform:none;flex-shrink:0;color:var(--color-text-subtle);transition:transform var(--transition-fast)}
.ts-chevron.is-open{transform:rotate(180deg)}
.ts-compact{display:flex;flex-direction:column;align-items:stretch;width:100%;padding:8px;border-radius:var(--radius-md)}
.ts-compact .ts-label{padding:0;margin-bottom:6px;font-size:12px;gap:6px}
.ts-compact .ts-label > span:nth-child(2){min-width:0;white-space:normal;line-height:1.4}
.ts-compact .ts-label-icon{width:26px;height:26px;border-radius:var(--radius-sm);flex-shrink:0}
.ts-compact .ts-select-wrap{min-width:0}
.ts-menu{z-index:101;overflow-y:auto;overscroll-behavior:contain;padding:4px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);box-shadow:var(--shadow-lg);font-family:var(--font-family)}
.ts-option{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:40px;padding:9px 10px;border-radius:var(--radius-sm);font-size:14px;font-weight:500;color:var(--color-text-main);cursor:pointer}
.ts-option.is-active{background:var(--color-surface-muted);outline:1px solid var(--color-border);outline-offset:-1px}
.ts-option[aria-selected="true"]{background:var(--color-primary-light);color:var(--color-primary);font-weight:600}
.ts-option[aria-selected="true"].is-active{outline-color:var(--color-primary-border)}
.ts-option-current{margin-left:8px;font-size:11px;font-weight:500;color:var(--color-success)}
`;

export const TermSelect: React.FC<TermSelectProps> = ({
                                                        compact = false,
                                                        disabled = false,
                                                        allowCreate = !compact,
                                                      }) => {
  const { success, error: toastError } = useToast();
  const { t } = useTranslation();
  const { terms, currentTerm, selectedTermId, selectedTerm, selectTerm: onSelectTerm, isLoading,
    isError, isLocked, refreshTerms, lockTermSelection } = useTerm();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selectDisabled = disabled || isLoading || isError || isLocked || terms.length === 0;

  const openMenu = (last = false) => {
    if (selectDisabled || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 16;
    const above = rect.top - 16;
    const opensAbove = below < 160 && above > below;
    const width = Math.min(rect.width, window.innerWidth - 16);
    setMenuStyle({
      position: 'fixed', width,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      ...(opensAbove ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      maxHeight: Math.min(280, Math.max(48, opensAbove ? above : below)),
    });
    const selectedIndex = terms.findIndex((term) => term.id === selectedTermId);
    setActiveIndex(last ? terms.length - 1 : Math.max(0, selectedIndex));
    setIsMenuOpen(true);
  };

  if (selectDisabled && isMenuOpen) setIsMenuOpen(false);

  useEffect(() => {
    if (!isMenuOpen) return;
    const closeOutside = (event: Event) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setIsMenuOpen(false);
    };
    const closeOnLayoutChange = (event: Event) => {
      if (event.type !== 'scroll' || !menuRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    window.addEventListener('resize', closeOnLayoutChange);
    document.addEventListener('scroll', closeOnLayoutChange, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
      window.removeEventListener('resize', closeOnLayoutChange);
      document.removeEventListener('scroll', closeOnLayoutChange, true);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (isMenuOpen) menuRef.current?.children[activeIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, isMenuOpen]);

  const handleSelectTerm = (termId: number) => {
    if (selectDisabled) return;
    onSelectTerm(termId);
    setIsMenuOpen(false);
    triggerRef.current?.focus();
  };

  const handleSelectKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Tab') { setIsMenuOpen(false); return; }
    if (event.key === 'Escape') { event.preventDefault(); setIsMenuOpen(false); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isMenuOpen) openMenu(event.key === 'ArrowUp');
      else setActiveIndex((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + terms.length) % terms.length);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      if (!isMenuOpen) openMenu();
      setActiveIndex(event.key === 'Home' ? 0 : terms.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isMenuOpen && terms[activeIndex]) handleSelectTerm(terms[activeIndex].id);
      else openMenu();
    } else if (isMenuOpen && event.key.length === 1) {
      const index = terms.findIndex((term) => term.name.toLowerCase().startsWith(event.key.toLowerCase()));
      if (index >= 0) { event.preventDefault(); setActiveIndex(index); }
    }
  };

  // Modal create term state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [newTermName, setNewTermName] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

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
    if (isCreating || isLocked) return;
    const cleanName = newTermName.trim().toUpperCase();

    if (!cleanName) {
      setFormError(t('adminUx.termRequired'));
      return;
    }

    if (!TERM_REGEX.test(cleanName)) {
      setFormError(t('adminUx.termInvalid'));
      return;
    }

    const unlock = lockTermSelection();
    try {
      setIsCreating(true);
      setFormError(null);
      const created = await termApi.createTerm({ name: cleanName });
      success(t('adminUx.termCreated', { name: created.name }));
      setIsModalOpen(false);

      // Refresh terms list and select newly created term
      const updated = await refreshTerms();
      if (updated.isError) toastError(t('terms.loadError'));
      else {
        unlock();
        onSelectTerm(created.id);
      }
    } catch (err: any) {
      const msg = err?.message || t('errors.generalFailure');
      setFormError(msg);
    } finally {
      setIsCreating(false);
      unlock();
    }
  };

  return (
      <div className={`ts-root${compact ? ' ts-compact' : ''}`}>
        <style>{STYLES}</style>
        <div className="ts-label">
        <span className="ts-label-icon">
          <CalendarDays size={16} />
        </span>
          <span>{t('terms.label')}</span>
          {currentTerm && <span className="ts-badge" title={`${t('terms.current')}: ${currentTerm.name}`}>
            <span className="ts-dot" aria-hidden="true" />
            {t('terms.current')}{selectedTermId !== currentTerm.id ? ` · ${currentTerm.name}` : ''}
          </span>}
        </div>

        <div className="ts-select-wrap">
          <button
              ref={triggerRef}
              type="button"
              role="combobox"
              className="ts-select"
              aria-label={t('terms.label')}
              aria-haspopup="listbox"
              aria-expanded={isMenuOpen}
              aria-controls={isMenuOpen ? listId : undefined}
              aria-activedescendant={isMenuOpen ? `${listId}-option-${activeIndex}` : undefined}
              disabled={selectDisabled}
              onClick={() => isMenuOpen ? setIsMenuOpen(false) : openMenu()}
              onKeyDown={handleSelectKeyDown}
          >
            <span>{isLoading ? t('terms.loading') : selectedTerm?.name ?? (terms.length === 0 ? t('terms.empty') : t('terms.selectRequired'))}</span>
            <ChevronDown size={16} className={isMenuOpen ? 'ts-chevron is-open' : 'ts-chevron'} aria-hidden="true" />
          </button>
          {isMenuOpen && createPortal(
            <div ref={menuRef} id={listId} role="listbox" aria-label={t('terms.label')} className="ts-menu" style={menuStyle}>
              {terms.map((term, index) => (
                <div
                    key={term.id}
                    id={`${listId}-option-${index}`}
                    role="option"
                    aria-selected={term.id === selectedTermId}
                    className={`ts-option${index === activeIndex ? ' is-active' : ''}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelectTerm(term.id)}
                >
                  <span>{term.name}{term.id === currentTerm?.id && <span className="ts-option-current">{t('terms.current')}</span>}</span>
                  {term.id === selectedTermId && <Check size={16} aria-hidden="true" />}
                </div>
              ))}
            </div>, document.body,
          )}
        </div>

        {isLocked && <p role="status" className="ts-hint">{t('terms.busy')}</p>}
        {isError && <div role="alert" className="ts-error">{t('terms.loadError')}{' '}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void refreshTerms()}>{t('common.retry')}</button>
        </div>}
        {allowCreate && <span className="ts-sep" />}

        {allowCreate && <button
            type="button"
            className="ts-add"
            onClick={handleOpenModal}
            disabled={disabled || isLocked || isLoading || isError}
            title={t('adminUx.createTerm')}
        >
          <Plus size={16} />
          <span>{t('adminUx.createTerm')}</span>
        </button>}

        <Modal
            open={isModalOpen}
            onClose={() => {
              if (!isCreating) setIsModalOpen(false);
            }}
            title={t('adminUx.createTerm')}
            maxWidth="480px"
        >
          <form onSubmit={handleCreateTerm} className="ts-form">
            <div>
              <p className="ts-field-title">{t('adminUx.termSeason')}</p>
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
                        <span className="ts-season-range">{t(`adminUx.season${s.code}`)}</span>
                      </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="term-name" className="ts-field-title" style={{ display: 'block' }}>
                {t('adminUx.termName')} <span style={{ color: '#ef4444' }}>*</span>
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
                    placeholder="SP27 / SU27 / FALL27"
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
                  {t('adminUx.termHelp')}
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
                {t('common.cancel')}
              </Button>
              <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={isCreating}
                  disabled={!newTermName.trim()}
              >
                {t('adminUx.createTerm')}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
  );
};
