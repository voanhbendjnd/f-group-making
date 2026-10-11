import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Users,
  Calendar,
  Search,
  X,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { classApi } from '@/features/classes/api/classApi';

export const ClassDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const classId = Number(id);

  const [searchStudent, setSearchStudent] = useState<string>('');

  // 1. Fetch Class Detail
  const {
    data: classDetail,
    isLoading: isClassLoading,
    isError: isClassError,
    error: classError,
    refetch: refetchClass,
  } = useQuery({
    queryKey: ['school-class', classId],
    queryFn: () => classApi.getClassById(classId),
    enabled: Boolean(classId && !isNaN(classId)),
  });

  // 2. Fetch Class Students
  const {
    data: students = [],
    isLoading: isStudentsLoading,
  } = useQuery({
    queryKey: ['school-class-students', classId],
    queryFn: () => classApi.getClassStudents(classId),
    enabled: Boolean(classId && !isNaN(classId)),
  });

  // Filter students by local search
  const filteredStudents = useMemo(() => {
    if (!searchStudent.trim()) return students;
    const q = searchStudent.trim().toLowerCase();
    return students.filter(
      (s) =>
        s.rollNumber?.toLowerCase().includes(q) ||
        s.fullName?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.memberCode?.toLowerCase().includes(q) ||
        s.majorCode?.toLowerCase().includes(q)
    );
  }, [students, searchStudent]);

  if (isClassLoading || isStudentsLoading) {
    return (
      <div className="card" style={{ padding: '4rem' }}>
        <LoadingSpinner message="Đang tải thông tin lớp học và danh sách sinh viên..." />
      </div>
    );
  }

  if (isClassError || !classDetail) {
    return (
      <div className="card" style={{ padding: '2rem' }}>
        <ErrorState
          message={(classError as any)?.message || 'Không tìm thấy thông tin lớp học.'}
          onRetry={() => refetchClass()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Lớp học: ${classDetail.name}`}
        description="Chi tiết lớp học và danh sách sinh viên thuộc lớp."
        breadcrumbs={[
          { label: 'Admin', href: '/admin/dashboard' },
          { label: 'Lớp học', href: '/admin/classes' },
          { label: classDetail.name },
        ]}
        action={
          <Button
            variant="secondary"
            size="sm"
            icon={<ArrowLeft size={16} />}
            onClick={() => navigate('/admin/classes')}
          >
            Quay lại danh sách lớp
          </Button>
        }
      />

      {/* Class Overview Card */}
      <div
        className="card"
        style={{
          padding: '1.5rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.25rem',
          background: 'linear-gradient(to right, #ffffff, #fbfcfe)',
        }}
      >
        {/* Tên lớp */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-subtle)', fontWeight: 600 }}>
            Tên lớp học
          </span>
          <span
            style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              color: 'var(--color-primary, #4f6bed)',
              letterSpacing: '-0.02em',
            }}
          >
            {classDetail.name}
          </span>
        </div>

        {/* Học kỳ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-subtle)', fontWeight: 600 }}>
            Học kỳ
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <Calendar size={18} style={{ color: '#64748b' }} />
            <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
              {classDetail.termName || 'Chưa thiết lập'}
            </span>
          </div>
        </div>

        {/* Giảng viên phụ trách */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-subtle)', fontWeight: 600 }}>
            Giảng viên phụ trách
          </span>
          {classDetail.lecturerCode ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    backgroundColor: '#eff6ff',
                    color: '#1d4ed8',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                >
                  {classDetail.lecturerCode}
                </span>
                {classDetail.lecturerName && (
                  <span style={{ fontWeight: 700, color: 'var(--color-text-main)' }}>
                    {classDetail.lecturerName}
                  </span>
                )}
              </div>
              {classDetail.lecturerEmail && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  {classDetail.lecturerEmail}
                </div>
              )}
            </div>
          ) : (
            <span style={{ fontStyle: 'italic', color: '#94a3b8' }}>Chưa phân công</span>
          )}
        </div>

        {/* Tổng sinh viên */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-subtle)', fontWeight: 600 }}>
            Sĩ số sinh viên
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <Users size={18} style={{ color: '#059669' }} />
            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669' }}>
              {students.length}
            </span>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>sinh viên</span>
          </div>
        </div>
      </div>

      {/* Student List in Class */}
      <div className="card">
        {/* Table header with search */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={18} style={{ color: 'var(--color-primary, #4f6bed)' }} />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
              Danh sách sinh viên trong lớp ({filteredStudents.length} / {students.length})
            </h3>
          </div>

          {/* Quick search input */}
          <div style={{ position: 'relative', width: '280px' }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9ca3af',
              }}
            />
            <input
              type="text"
              placeholder="Tìm theo MSSV, tên, email..."
              value={searchStudent}
              onChange={(e) => setSearchStudent(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 32px 8px 34px',
                fontSize: '0.875rem',
                borderRadius: '10px',
                border: '1px solid #e5e7eb',
                backgroundColor: '#f9fafb',
                outline: 'none',
              }}
            />
            {searchStudent && (
              <button
                type="button"
                onClick={() => setSearchStudent('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#9ca3af',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="table-container" style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: '60px' }}>STT</th>
                <th>MSSV</th>
                <th>Họ và tên</th>
                <th>Email</th>
                <th>Mã sinh viên</th>
                <th>Chuyên ngành</th>
                <th>Trạng thái tài khoản</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                    {searchStudent
                      ? 'Không tìm thấy sinh viên nào khớp với từ khóa tìm kiếm.'
                      : 'Lớp học này hiện chưa có sinh viên nào.'}
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student, idx) => (
                  <tr key={student.userId}>
                    <td style={{ color: 'var(--color-text-subtle)', fontWeight: 500 }}>
                      #{idx + 1}
                    </td>

                    {/* MSSV */}
                    <td>
                      <span
                        style={{
                          fontWeight: 700,
                          color: 'var(--color-primary, #4f6bed)',
                        }}
                      >
                        {student.rollNumber}
                      </span>
                    </td>

                    {/* Họ tên */}
                    <td style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>
                      {student.fullName}
                    </td>

                    {/* Email */}
                    <td style={{ color: 'var(--color-text-subtle)' }}>
                      {student.email}
                    </td>

                    {/* Member code */}
                    <td style={{ color: 'var(--color-text-subtle)' }}>
                      {student.memberCode || '—'}
                    </td>

                    {/* Ngành học */}
                    <td>
                      {student.majorCode ? (
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: '#f1f5f9',
                            color: '#334155',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                          }}
                        >
                          {student.majorCode}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>

                    {/* Trạng thái tài khoản */}
                    <td>
                      {student.activated ? (
                        <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={13} />
                          Đã kích hoạt
                        </span>
                      ) : (
                        <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={13} />
                          Chờ kích hoạt
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
