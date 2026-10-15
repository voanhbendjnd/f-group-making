import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, ChevronDown, LoaderCircle } from 'lucide-react';

interface Option { value: string; label: string; badge?: string }
interface Props {
  id: string; label: string; placeholder: string; options: Option[]; value: string;
  onChange: (value: string) => void; onBlur: () => void;
  disabled?: boolean; loading?: boolean; error?: string;
}

// Scoped to the student form. Follows the Sidebar TermSelect portal/listbox pattern.
export const StudentFormSelect = forwardRef<HTMLButtonElement, Props>(function StudentFormSelect(
  { id, label, placeholder, options, value, onChange, onBlur, disabled, loading, error }, ref,
) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({});
  const [portalTarget, setPortalTarget] = useState<Element>(document.body);
  const unavailable = disabled || loading || options.length === 0;
  const expanded = open && !unavailable;
  const selected = options.find((option) => option.value === value);

  function show(last = false) {
    if (unavailable || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    setPortalTarget(trigger.current.closest('[role="dialog"]') || document.body);
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const upward = below < 180 && above > below;
    const width = Math.min(rect.width, window.innerWidth - 24);
    setPosition({ position: 'fixed', width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      ...(upward ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      maxHeight: Math.min(240, Math.max(40, upward ? above : below)) });
    setActive(last ? options.length - 1 : Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  }
  function choose(index: number) {
    if (unavailable || !options[index]) return;
    onChange(options[index].value); setOpen(false); trigger.current?.focus();
  }
  useEffect(() => {
    if (!expanded) return;
    const outside = (event: Event) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const layout = (event: Event) => { if (!menu.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('scroll', layout, true);
    window.addEventListener('resize', layout);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('scroll', layout, true);
      window.removeEventListener('resize', layout);
    };
  }, [expanded]);
  useEffect(() => { if (expanded) menu.current?.children[active]?.scrollIntoView?.({ block: 'nearest' }); }, [expanded, active]);

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Tab') { setOpen(false); return; }
    if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!expanded) show(event.key === 'ArrowUp');
      else setActive((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); if (!expanded) show(); setActive(event.key === 'Home' ? 0 : options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); if (expanded) choose(active); else show();
    } else if (expanded && event.key.length === 1) {
      const index = options.findIndex((option) => option.label.toLowerCase().startsWith(event.key.toLowerCase()));
      if (index >= 0) { event.preventDefault(); setActive(index); }
    }
  }

  return <div className="form-group">
    <label id={`${id}-label`} htmlFor={id} className="form-label"><span>{label}<span className="required">*</span></span></label>
    <button ref={(element) => { trigger.current = element; if (typeof ref === 'function') ref(element); else if (ref) ref.current = element; }}
      id={id} type="button" role="combobox" className={`form-control student-form-select${error ? ' is-invalid' : ''}`}
      aria-labelledby={`${id}-label`} aria-required="true" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
      aria-expanded={expanded} aria-haspopup="listbox" aria-controls={expanded ? listId : undefined}
      aria-activedescendant={expanded ? `${listId}-${active}` : undefined} disabled={unavailable}
      onClick={() => expanded ? setOpen(false) : show()} onKeyDown={keyDown} onBlur={onBlur}>
      <span className={selected ? '' : 'student-form-placeholder'}>{selected?.label || placeholder}</span>
      {selected?.badge && <span className="student-form-badge">{selected.badge}</span>}
      {loading ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
    </button>
    {expanded && createPortal(<div ref={menu} id={listId} role="listbox" aria-labelledby={`${id}-label`} className="student-form-menu" style={position}>
      {options.map((option, index) => <div key={option.value} id={`${listId}-${index}`} role="option" aria-selected={option.value === value}
        className={`student-form-option${index === active ? ' is-active' : ''}`} onMouseEnter={() => setActive(index)}
        onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}>
        <span>{option.label}</span>{option.badge && <span className="student-form-badge">{option.badge}</span>}
        {option.value === value && <Check size={16} aria-hidden="true" />}
      </div>)}
    </div>, portalTarget)}
    {error && <div id={`${id}-error`} className="form-error"><AlertCircle size={14} aria-hidden="true" />{error}</div>}
  </div>;
});
