import React, { useState, useEffect } from 'react';
import { Search, X, RotateCcw } from 'lucide-react';
import type { LecturerFilterParams } from '../types';
import { useTranslation } from 'react-i18next';

export interface LecturerFilterBarProps {
  filters: LecturerFilterParams;
  onChange: (newFilters: Partial<LecturerFilterParams>) => void;
  onReset: () => void;
}

type StatusValue = 'all' | 'active' | 'pending';

const STATUS_OPTIONS: { value: StatusValue; label: string }[] = [
  { value: 'all', label: 'students.allActivationStatus' },
  { value: 'active', label: 'students.activated' },
  { value: 'pending', label: 'students.unactivated' },
];

/**
 * CSS đi kèm component (không phụ thuộc Tailwind hay class global).
 * Đổi màu nhấn ở biến --lf-accent nếu cần.
 */
const STYLES = `
.lf-root{
  --lf-accent:#4f6bed; --lf-accent-soft:#eef1fe; --lf-border:#e5e7eb;
  --lf-text:#111827; --lf-muted:#6b7280;
  display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px;
  padding:12px; background:#fff; border:1px solid var(--lf-border); border-radius:16px;
  box-shadow:0 1px 2px rgba(16,24,40,.05); font-family:inherit;
}
.lf-left{display:flex; flex-wrap:wrap; align-items:center; gap:12px; flex:1; min-width:280px}

/* Search */
.lf-search{position:relative; flex:1 1 280px}
.lf-search-icon{position:absolute; left:14px; top:50%; transform:translateY(-50%); width:16px; height:16px; color:#9ca3af; pointer-events:none; transition:color .15s}
.lf-input{
  box-sizing:border-box; width:100%; padding:10px 40px 10px 40px; font:500 14px/1.2 inherit; color:var(--lf-text);
  background:#f3f4f6; border:1px solid transparent; border-radius:12px;
  transition:background .15s, border-color .15s, box-shadow .15s;
}
.lf-input::placeholder{font-weight:400; color:#9ca3af}
.lf-input:hover{background:#eceef1}
.lf-input:focus{outline:none; background:#fff; border-color:var(--lf-accent); box-shadow:0 0 0 4px rgba(79,107,237,.15)}
.lf-search:focus-within .lf-search-icon{color:var(--lf-accent)}
.lf-clear{
  position:absolute; right:8px; top:50%; transform:translateY(-50%); display:flex; align-items:center; justify-content:center;
  width:24px; height:24px; padding:0; color:#6b7280; background:#e5e7eb; border:none; border-radius:50%; cursor:pointer;
  transition:background .15s, color .15s;
}
.lf-clear:hover{background:#d1d5db; color:#111827}
.lf-clear:focus-visible{outline:none; box-shadow:0 0 0 3px rgba(79,107,237,.25)}

/* Status segmented control */
.lf-segment{display:inline-flex; gap:2px; padding:4px; background:#f3f4f6; border-radius:12px}
.lf-seg-btn{
  padding:7px 14px; font:600 13px/1.2 inherit; color:var(--lf-muted); white-space:nowrap;
  background:transparent; border:none; border-radius:9px; cursor:pointer; transition:background .15s, color .15s, box-shadow .15s;
}
.lf-seg-btn:hover{color:var(--lf-text)}
.lf-seg-btn:focus-visible{outline:none; box-shadow:0 0 0 3px rgba(79,107,237,.25)}
.lf-seg-btn[aria-pressed="true"]{color:var(--lf-accent); background:#fff; box-shadow:0 1px 2px rgba(16,24,40,.12)}

/* Reset */
.lf-reset{
  display:inline-flex; align-items:center; gap:6px; padding:9px 14px; font:600 13px/1.2 inherit;
  color:#374151; background:#fff; border:1px solid var(--lf-border); border-radius:12px; cursor:pointer;
  transition:background .15s, border-color .15s, transform .1s;
}
.lf-reset:hover{background:#f9fafb; border-color:#d1d5db}
.lf-reset:active{transform:scale(.98)}
.lf-reset:focus-visible{outline:none; box-shadow:0 0 0 4px rgba(79,107,237,.2)}

@media (max-width:560px){
  .lf-segment{width:100%}
  .lf-seg-btn{flex:1; padding:7px 8px}
}
`;

export const LecturerFilterBar: React.FC<LecturerFilterBarProps> = ({
                                                                      filters,
                                                                      onChange,
                                                                      onReset,
                                                                    }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState(filters.search || '');
  const [externalSearch, setExternalSearch] = useState(filters.search || '');
  if (externalSearch !== (filters.search || '')) {
    setExternalSearch(filters.search || ''); setSearchTerm(filters.search || '');
  }

  // Debounce search update
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm !== (filters.search || '')) {
        onChange({ search: searchTerm, page: 1 });
      }
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const handleStatusChange = (val: StatusValue) => {
    if (val === 'all') {
      onChange({ activated: undefined, page: 1 });
    } else if (val === 'active') {
      onChange({ activated: true, page: 1 });
    } else if (val === 'pending') {
      onChange({ activated: false, page: 1 });
    }
  };

  const getStatusValue = (): StatusValue => {
    if (filters.activated === true) return 'active';
    if (filters.activated === false) return 'pending';
    return 'all';
  };

  const currentStatus = getStatusValue();
  const hasActiveFilters = Boolean(searchTerm || filters.activated !== undefined);

  return (
      <div className="lf-root">
        <style>{STYLES}</style>

        <div className="lf-left">
          {/* Search Input (Code & Email) */}
          <div className="lf-search">
            <Search className="lf-search-icon" />
            <input
                type="text"
                className="lf-input"
                placeholder={t('classAssignment.searchPlaceholder')}
                aria-label={t('classAssignment.search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onChange({ search: searchTerm.trim(), page: 1 }); } }}
            />
            {searchTerm && (
                <button
                    type="button"
                    className="lf-clear"
                    aria-label={t('students.clearSearchAria')}
                    onClick={() => setSearchTerm('')}
                >
                  <X size={14} />
                </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="lf-segment" role="group" aria-label={t('students.activationStatusLabel')}>
            {STATUS_OPTIONS.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    className="lf-seg-btn"
                    aria-pressed={currentStatus === opt.value}
                    onClick={() => handleStatusChange(opt.value)}
                >
                  {t(opt.label)}
                </button>
            ))}
          </div>
        </div>

        {hasActiveFilters && (
            <button
                type="button"
                className="lf-reset"
                onClick={() => {
                  setSearchTerm('');
                  onReset();
                }}
            >
              <RotateCcw size={14} />
              {t('students.clearFilters')}
            </button>
        )}
      </div>
  );
};
