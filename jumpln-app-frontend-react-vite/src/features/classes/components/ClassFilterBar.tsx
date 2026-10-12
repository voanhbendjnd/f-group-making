import React, { useState, useEffect } from 'react';
import { Search, X, RotateCcw } from 'lucide-react';
import type { SchoolClassFilterParams } from '../types';

export interface ClassFilterBarProps {
  filters: SchoolClassFilterParams;
  onChange: (newFilters: Partial<SchoolClassFilterParams>) => void;
  onReset: () => void;
}

const STYLES = `
.cf-root{
  --cf-accent:#4f6bed; --cf-accent-soft:#eef1fe; --cf-border:#e5e7eb;
  --cf-text:#111827; --cf-muted:#6b7280;
  display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px;
  padding:12px; background:#fff; border:1px solid var(--cf-border); border-radius:16px;
  box-shadow:0 1px 2px rgba(16,24,40,.05); font-family:inherit;
}
.cf-left{display:flex; flex-wrap:wrap; align-items:center; gap:12px; flex:1; min-width:280px}

/* Search */
.cf-search{position:relative; flex:1 1 280px}
.cf-search-icon{position:absolute; left:14px; top:50%; transform:translateY(-50%); width:16px; height:16px; color:#9ca3af; pointer-events:none; transition:color .15s}
.cf-input{
  box-sizing:border-box; width:100%; padding:10px 40px 10px 40px; font:500 14px/1.2 inherit; color:var(--cf-text);
  background:#f3f4f6; border:1px solid transparent; border-radius:12px;
  transition:background .15s, border-color .15s, box-shadow .15s;
}
.cf-input::placeholder{font-weight:400; color:#9ca3af}
.cf-input:hover{background:#eceef1}
.cf-input:focus{outline:none; background:#fff; border-color:var(--cf-accent); box-shadow:0 0 0 4px rgba(79,107,237,.15)}
.cf-search:focus-within .cf-search-icon{color:var(--cf-accent)}
.cf-clear{
  position:absolute; right:8px; top:50%; transform:translateY(-50%); display:flex; align-items:center; justify-content:center;
  width:24px; height:24px; padding:0; color:#6b7280; background:#e5e7eb; border:none; border-radius:50%; cursor:pointer;
  transition:background .15s, color .15s;
}
.cf-clear:hover{background:#d1d5db; color:#111827}
.cf-clear:focus-visible{outline:none; box-shadow:0 0 0 3px rgba(79,107,237,.25)}

/* Reset */
.cf-reset{
  display:inline-flex; align-items:center; gap:6px; padding:9px 14px; font:600 13px/1.2 inherit;
  color:#374151; background:#fff; border:1px solid var(--cf-border); border-radius:12px; cursor:pointer;
  transition:background .15s, border-color .15s, transform .1s;
}
.cf-reset:hover{background:#f9fafb; border-color:#d1d5db}
.cf-reset:active{transform:scale(.98)}
.cf-reset:focus-visible{outline:none; box-shadow:0 0 0 4px rgba(79,107,237,.2)}
`;

export const ClassFilterBar: React.FC<ClassFilterBarProps> = ({
  filters,
  onChange,
  onReset,
}) => {
  const [searchTerm, setSearchTerm] = useState(filters.search || '');

  // Debounce search update
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm !== (filters.search || '')) {
        onChange({ search: searchTerm, page: 1 });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm, filters.search, onChange]);

  const hasActiveFilters = Boolean(searchTerm);

  return (
    <div className="cf-root">
      <style>{STYLES}</style>

      <div className="cf-left">
        {/* Search Input (Class Name, Lecturer Code/Name) */}
        <div className="cf-search">
          <Search className="cf-search-icon" />
          <input
            type="text"
            className="cf-input"
            placeholder="Tìm theo tên lớp (vd: EXE101_G01), giảng viên..."
            aria-label="Tìm kiếm lớp học"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              className="cf-clear"
              aria-label="Xóa nội dung tìm kiếm"
              onClick={() => setSearchTerm('')}
            >
              <X size={14} />
            </button>
          )}
        </div>

      </div>

      {hasActiveFilters && (
        <button
          type="button"
          className="cf-reset"
          onClick={() => {
            setSearchTerm('');
            onReset();
          }}
        >
          <RotateCcw size={14} />
          Xóa bộ lọc
        </button>
      )}
    </div>
  );
};
