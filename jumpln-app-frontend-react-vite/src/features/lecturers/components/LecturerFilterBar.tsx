import React, { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import type { LecturerFilterParams } from '../types';

export interface LecturerFilterBarProps {
  filters: LecturerFilterParams;
  onChange: (newFilters: Partial<LecturerFilterParams>) => void;
  onReset: () => void;
}

export const LecturerFilterBar: React.FC<LecturerFilterBarProps> = ({
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
  }, [searchTerm]);

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'all') {
      onChange({ activated: undefined, page: 1 });
    } else if (val === 'active') {
      onChange({ activated: true, page: 1 });
    } else if (val === 'pending') {
      onChange({ activated: false, page: 1 });
    }
  };

  const getStatusValue = () => {
    if (filters.activated === true) return 'active';
    if (filters.activated === false) return 'pending';
    return 'all';
  };

  const hasActiveFilters = Boolean(searchTerm || filters.activated !== undefined);

  return (
    <div
      className="card"
      style={{
        padding: '1rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.75rem',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', flex: 1, minWidth: '280px' }}>
        {/* Search Input (Code & Email) */}
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-muted)',
            }}
          />
          <input
            type="text"
            className="input"
            style={{ paddingLeft: '2.25rem', width: '100%' }}
            placeholder="Tìm theo Mã Giảng viên / Mentor hoặc Email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Status Filter */}
        <div style={{ minWidth: '180px' }}>
          <select className="input" value={getStatusValue()} onChange={handleStatusChange}>
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đã kích hoạt</option>
            <option value="pending">Chờ kích hoạt</option>
          </select>
        </div>
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          onClick={() => {
            setSearchTerm('');
            onReset();
          }}
        >
          <X size={14} />
          Xóa bộ lọc
        </button>
      )}
    </div>
  );
};
