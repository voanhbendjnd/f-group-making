import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { majorApi } from '@/features/majors/api/majorApi';
import type { Major } from '@/features/majors/types';
import type { StudentFilterParams } from '../types';

interface Props {
  filters: StudentFilterParams;
  onFilterChange: (filters: StudentFilterParams) => void;
}

export function MajorSearchFilter({ filters, onFilterChange }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const externalInput = filters.majorLabel || filters.majorSearch || '';
  const [input, setInput] = useState(externalInput);
  const [lastExternalInput, setLastExternalInput] = useState(externalInput);
  const [debouncedText, setDebouncedText] = useState(input.trim());
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Adjust the draft when the parent applies a selection or resets its filters.
  if (lastExternalInput !== externalInput) {
    setLastExternalInput(externalInput);
    setInput(externalInput);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedText(input.trim());
      if (filters.majorId === undefined && input.trim() !== (filters.majorSearch || '')) {
        onFilterChange({ ...filters, majorSearch: input.trim(), majorLabel: undefined, page: 1 });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [input, filters, onFilterChange]);

  const { data, isFetching, isError } = useQuery({
    queryKey: ['majors', 'suggestions', debouncedText],
    queryFn: () => majorApi.getMajors({ search: debouncedText, page: 1, size: 10, sort: 'code,asc' }),
    enabled: focused && filters.majorId === undefined && input.trim() === debouncedText,
    staleTime: 10 * 60 * 1000,
  });
  const suggestions = input.trim() === debouncedText && !isError ? data?.result || [] : [];
  const expanded = focused && filters.majorId === undefined;

  function applyText(value: string) {
    onFilterChange({ ...filters, majorId: undefined, majorLabel: undefined, majorSearch: value.trim(), page: 1 });
  }

  function selectMajor(major: Major) {
    const label = `${major.code} — ${major.name}`;
    setInput(label);
    setFocused(false);
    setActiveIndex(-1);
    onFilterChange({ ...filters, majorId: major.id, majorLabel: label, majorSearch: undefined, page: 1 });
  }

  return <div style={{ position: 'relative' }}>
    <label className="form-label" htmlFor={id}>{t('students.majorLabel')}</label>
    <div style={{ display: 'flex', gap: '0.25rem' }}>
      <input id={id} className="form-control" role="combobox" autoComplete="off"
        placeholder={t('students.majorPlaceholder')} value={input}
        aria-expanded={expanded} aria-controls={expanded ? `${id}-list` : undefined}
        aria-autocomplete="list" aria-activedescendant={expanded && suggestions[activeIndex] ? `${id}-option-${suggestions[activeIndex].id}` : undefined}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onChange={(event) => {
          const value = event.target.value;
          setInput(value);
          setFocused(true);
          setActiveIndex(-1);
          // Editing a selection immediately removes its ID from the active filter.
          if (filters.majorId !== undefined) applyText(value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setFocused(true);
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActiveIndex((current) => suggestions.length ? (current === -1 ? (step > 0 ? 0 : suggestions.length - 1) : (current + step + suggestions.length) % suggestions.length) : -1);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (expanded && suggestions[activeIndex]) selectMajor(suggestions[activeIndex]);
            else { if (filters.majorId === undefined) applyText(input); setFocused(false); }
          } else if (event.key === 'Escape') {
            setFocused(false);
            setActiveIndex(-1);
          }
        }} />
      {input && <button type="button" className="btn btn-ghost btn-sm" aria-label={t('students.clearMajor')}
        onClick={() => { setInput(''); setFocused(false); setActiveIndex(-1); applyText(''); }}>×</button>}
    </div>
    {expanded && <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, background: 'var(--color-surface, white)',
      border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 12px #0002', maxHeight: 260, overflowY: 'auto' }}>
      <ul id={`${id}-list`} role="listbox" aria-label={t('students.majorSuggestions')} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {suggestions.map((major, index) => <li key={major.id} id={`${id}-option-${major.id}`} role="option"
          aria-selected={activeIndex === index} onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)} onClick={() => selectMajor(major)}
          style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', background: activeIndex === index ? 'var(--color-surface-muted)' : undefined }}>
          <strong>{major.code}</strong> — {major.name}
        </li>)}
      </ul>
      {isError ? <p role="status" style={{ padding: '0.75rem' }}>{t('students.majorSuggestionError')}</p>
        : isFetching || input.trim() !== debouncedText ? <p role="status" style={{ padding: '0.75rem' }}>{t('common.loading')}</p>
        : suggestions.length === 0 ? <p role="status" style={{ padding: '0.75rem' }}>{t('students.majorNoMatches')}</p> : null}
    </div>}
  </div>;
}
