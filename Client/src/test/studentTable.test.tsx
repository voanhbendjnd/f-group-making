import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StudentTable } from '@/features/students/components/StudentTable';
import type { Student } from '@/features/students/types';
import i18n from '@/locales/i18n';

describe('StudentTable optimization for Admin', () => {
  const mockStudents: Student[] = [
    {
      userId: 1,
      rollNumber: 'SE10001',
      fullName: 'Nguyen Van A',
      email: 'a@fpt.edu.vn',
      memberCode: 'MEM001',
      majorId: 10,
      majorCode: 'SE',
      majorName: 'Software Engineering',
      schoolClassId: 5,
      className: 'EXE101_G08',
      groupName: 'EXE101_G08',
      activated: true,
      hasActivationKey: false,
      activationKeyExpiresAt: null,
      isKeyExpired: false,
      createdDate: '2026-01-01T00:00:00Z',
      lastModifiedDate: null,
    },
    {
      userId: 2,
      rollNumber: 'IA20002',
      fullName: 'Tran Thi B',
      email: 'b@fpt.edu.vn',
      memberCode: 'MEM002',
      majorId: null,
      majorCode: null,
      majorName: null,
      schoolClassId: null,
      className: null,
      groupName: null,
      activated: false,
      hasActivationKey: true,
      activationKeyExpiresAt: '2026-12-31T00:00:00Z',
      isKeyExpired: false,
      createdDate: '2026-01-02T00:00:00Z',
      lastModifiedDate: null,
    },
  ];

  it('removes Member Code column from table header and rows', () => {
    render(
      <StudentTable
        students={mockStudents}
        selectedUserIds={[]}
        onToggleSelect={vi.fn()}
        onToggleSelectAllPage={vi.fn()}
        onSendSingle={vi.fn()}
      />
    );

    // Header should not contain Member Code translation key text
    const colMemberCodeText = i18n.t('students.colMemberCode');
    expect(screen.queryByText(colMemberCodeText)).not.toBeInTheDocument();

    // Rows should not display memberCode values
    expect(screen.queryByText('MEM001')).not.toBeInTheDocument();
    expect(screen.queryByText('MEM002')).not.toBeInTheDocument();
  });

  it('displays only majorCode and hides majorName even when majorName is provided', () => {
    render(
      <StudentTable
        students={mockStudents}
        selectedUserIds={[]}
        onToggleSelect={vi.fn()}
        onToggleSelectAllPage={vi.fn()}
        onSendSingle={vi.fn()}
      />
    );

    // Displays majorCode
    expect(screen.getByText('SE')).toBeInTheDocument();
    // Does NOT display majorName
    expect(screen.queryByText(/Software Engineering/)).not.toBeInTheDocument();

    // Displays fallback 'N/A' when majorCode is null
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('displays className accurately and falls back to dash when class is missing', () => {
    render(
      <StudentTable
        students={mockStudents}
        selectedUserIds={[]}
        onToggleSelect={vi.fn()}
        onToggleSelectAllPage={vi.fn()}
        onSendSingle={vi.fn()}
      />
    );

    // Displays the class name
    expect(screen.getByText('EXE101_G08')).toBeInTheDocument();

    // For student without class, displays '—'
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('handles checkbox selection and single activation button clicks', () => {
    const onToggleSelect = vi.fn();
    const onSendSingle = vi.fn();

    render(
      <StudentTable
        students={mockStudents}
        selectedUserIds={[1]}
        onToggleSelect={onToggleSelect}
        onToggleSelectAllPage={vi.fn()}
        onSendSingle={onSendSingle}
      />
    );

    // Toggle select for student 2
    const checkboxes = screen.getAllByRole('checkbox');
    // checkbox 0 is header "select all", 1 is student 1, 2 is student 2
    fireEvent.click(checkboxes[2]);
    expect(onToggleSelect).toHaveBeenCalledWith(2);

    // Click send single activation key button for unactivated student
    const sendButton = screen.getByRole('button', { name: new RegExp(i18n.t('students.btnResend') + '|' + i18n.t('students.btnSend')) });
    fireEvent.click(sendButton);
    expect(onSendSingle).toHaveBeenCalledWith(mockStudents[1]);
  });
});
