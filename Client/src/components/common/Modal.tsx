import React, { useEffect, useLayoutEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

let openDialogs = 0;
let originalOverflow = '';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  description?: string;
  headerIcon?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = '560px',
  description,
  headerIcon,
}) => {
  const { t } = useTranslation();
  const titleId = useId();
  const root = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    if (openDialogs++ === 0) originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? [])]
      .filter(element => !element.closest('[hidden], [inert]') && element.tabIndex >= 0);
    if (!root.current?.contains(document.activeElement)) (focusable()[0] ?? root.current)?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== root.current || e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      } else if (e.key === 'Tab') {
        const elements = focusable();
        const first = elements[0], last = elements.at(-1);
        if (!first) { e.preventDefault(); root.current?.focus(); }
        else if (e.shiftKey && (document.activeElement === first || !root.current?.contains(document.activeElement))) {
          e.preventDefault(); last?.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !root.current?.contains(document.activeElement))) {
          e.preventDefault(); first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      if (--openDialogs === 0) document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={root}
      tabIndex={-1}
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="modal-card" style={{ maxWidth }}>
        <div className="modal-header">
          {headerIcon}
          {description ? <div>
          <h3 id={titleId} className="card-title">
            {title}
          </h3>
          <p className="modal-description">{description}</p>
          </div> : <h3 id={titleId} className="card-title">{title}</h3>}
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-subtle)',
              padding: '4px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label={t('common.closeModal')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">{children}</div>

        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
};
