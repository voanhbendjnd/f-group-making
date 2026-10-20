import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ParsedLecturerRow } from '../types';

export interface LecturerImportPreviewTableProps {
  rows: ParsedLecturerRow[];
  validCount: number;
  invalidCount: number;
}

export const LecturerImportPreviewTable: React.FC<LecturerImportPreviewTableProps> = ({
  rows,
  validCount,
  invalidCount,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'valid' | 'invalid'>('all');
  const [previewLimit, setPreviewLimit] = useState<number>(20);

  const filteredRows = rows.filter((row) => {
    if (filterType === 'valid') return row.isValid;
    if (filterType === 'invalid') return !row.isValid;
    return true;
  });

  const displayedRows = filteredRows.slice(0, previewLimit);
  const hasMore = filteredRows.length > previewLimit;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Metrics overview */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
        }}
      >
        <div className="card" style={{ padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-subtle)' }}>Tổng số dòng đọc được</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-main)' }}>
            {rows.length}
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: '1rem 1.25rem',
            backgroundColor: '#f0fdf4',
            borderColor: '#bbf7d0',
          }}
        >
          <div style={{ fontSize: '0.8125rem', color: '#166534' }}>Dữ liệu bình thường ổn (Hợp lệ)</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-success)' }}>
            {validCount}
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: '1rem 1.25rem',
            backgroundColor: invalidCount > 0 ? '#fef2f2' : '#f9fafb',
            borderColor: invalidCount > 0 ? '#fecaca' : '#e5e7eb',
          }}
        >
          <div style={{ fontSize: '0.8125rem', color: invalidCount > 0 ? '#991b1b' : 'var(--color-text-subtle)' }}>
            Dữ liệu lỗi / không ổn
          </div>
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: invalidCount > 0 ? 'var(--color-error)' : 'var(--color-text-muted)',
            }}
          >
            {invalidCount}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: '0.5rem',
        }}
      >
        <button
          type="button"
          className={`btn btn-sm ${filterType === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilterType('all')}
        >
          Tất cả ({rows.length})
        </button>
        <button
          type="button"
          className={`btn btn-sm ${filterType === 'valid' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilterType('valid')}
        >
          Hợp lệ ({validCount})
        </button>
        <button
          type="button"
          className={`btn btn-sm ${filterType === 'invalid' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilterType('invalid')}
        >
          Lỗi ({invalidCount})
        </button>
      </div>

      {/* Table */}
      <div className="table-container" style={{ overflowX: 'auto' }}>
        <table className="table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: '80px' }}>Dòng</th>
              <th style={{ width: '120px' }}>Trạng thái</th>
              <th>Mã Giảng viên / Mentor</th>
              <th>Email đăng nhập</th>
              <th>Ghi chú / Lỗi phát hiện</th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                  Không có dữ liệu trong mục này
                </td>
              </tr>
            ) : (
              displayedRows.map((row) => (
                <tr
                  key={row.rowNumber}
                  style={{
                    backgroundColor: row.isValid ? 'inherit' : 'rgba(239, 68, 68, 0.05)',
                  }}
                >
                  <td style={{ fontWeight: 600 }}>#{row.rowNumber}</td>
                  <td>
                    {row.isValid ? (
                      <span
                        className="badge badge-success"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <CheckCircle2 size={13} />
                        Ổn
                      </span>
                    ) : (
                      <span
                        className="badge badge-error"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <AlertTriangle size={13} />
                        Lỗi
                      </span>
                    )}
                  </td>
                  <td style={{ fontWeight: 600 }}>{row.code || <em style={{ color: 'var(--color-error)' }}>Trống</em>}</td>
                  <td>{row.email || <em style={{ color: 'var(--color-error)' }}>Trống</em>}</td>
                  <td>
                    {row.isValid ? (
                      <span style={{ color: 'var(--color-success)', fontSize: '0.8125rem' }}>Hợp lệ để import</span>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--color-error)', fontSize: '0.8125rem' }}>
                        {row.validationErrors.map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setPreviewLimit((prev) => prev + 50)}
          >
            Hiển thị thêm (đang xem {displayedRows.length} / {filteredRows.length})
          </button>
        </div>
      )}
    </div>
  );
};
