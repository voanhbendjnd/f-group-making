import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RoleRoute } from '@/app/router/RoleRoute';
import { PublicRoute } from '@/app/router/PublicRoute';
import { canAccessPath, getHomeRoute } from '@/features/auth/utils/roleRouting';

const state = vi.hoisted(() => ({ user: { authorities: ['ROLE_LECTURE'] }, isAuthenticated: true,
  isAdmin: false, isStudent: false, isLecturer: true }));
vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => state }));
afterEach(cleanup);
beforeEach(() => {
  state.user.authorities = ['ROLE_LECTURE'];
  state.isAdmin = false; state.isStudent = false; state.isLecturer = true;
});

describe('Lecturer navigation and guards', () => {
  it('redirects an authenticated lecturer away from login to group review', () => {
    render(<MemoryRouter initialEntries={['/login']}><Routes>
      <Route path="/login" element={<PublicRoute><div>Login</div></PublicRoute>} />
      <Route path="/lecturer/group-review" element={<div>Group review</div>} />
    </Routes></MemoryRouter>);
    expect(screen.getByText('Group review')).toBeInTheDocument();
  });

  it('allows lecturers and blocks a student from the lecturer area', () => {
    render(<MemoryRouter><RoleRoute requiredRole="ROLE_LECTURE"><div>Rules editor</div></RoleRoute></MemoryRouter>);
    expect(screen.getByText('Rules editor')).toBeInTheDocument();
    cleanup(); state.isLecturer = false; state.isStudent = true;
    render(<MemoryRouter initialEntries={['/lecturer/classes']}><Routes>
      <Route path="/lecturer/classes" element={<RoleRoute requiredRole="ROLE_LECTURE"><div>Rules editor</div></RoleRoute>} />
      <Route path="/unauthorized" element={<div>Access denied</div>} />
    </Routes></MemoryRouter>);
    expect(screen.getByText('Access denied')).toBeInTheDocument();
    state.isLecturer = true; state.isStudent = false;
  });

  it.each(['ROLE_LECTURE_MASTER', 'ROLE_ADMIN'])('allows %s into the lecturer area', role => {
    state.user.authorities = [role];
    state.isAdmin = role === 'ROLE_ADMIN'; state.isLecturer = role === 'ROLE_LECTURE_MASTER';
    render(<MemoryRouter><RoleRoute requiredRole="ROLE_LECTURE"><div>Class information</div></RoleRoute></MemoryRouter>);
    expect(screen.getByText('Class information')).toBeInTheDocument();
  });

  it('redirects a department head from login to group review', () => {
    state.user.authorities = ['ROLE_LECTURE_MASTER'];
    render(<MemoryRouter initialEntries={['/login']}><Routes>
      <Route path="/login" element={<PublicRoute><div>Login</div></PublicRoute>} />
      <Route path="/lecturer/group-review" element={<div>Group review</div>} />
    </Routes></MemoryRouter>);
    expect(screen.getByText('Group review')).toBeInTheDocument();
  });

  it('keeps role precedence and rejects unknown roles', () => {
    expect(getHomeRoute(['ROLE_ADMIN', 'ROLE_LECTURE'])).toBe('/admin/dashboard');
    expect(getHomeRoute(['ROLE_LECTURE'])).toBe('/lecturer/group-review');
    expect(getHomeRoute(['ROLE_STUDENT'])).toBe('/student/dashboard');
    expect(getHomeRoute(['ROLE_LECTURE_MASTER'])).toBe('/lecturer/group-review');
    expect(getHomeRoute(['ROLE_ADMIN', 'ROLE_LECTURE_MASTER'])).toBe('/admin/dashboard');
    expect(getHomeRoute(['ROLE_UNKNOWN'])).toBe('/unauthorized');
    expect(canAccessPath('/lecturer/classes/12', ['ROLE_LECTURE_MASTER'])).toBe(true);
    expect(canAccessPath('/lecturer/classes/12', ['ROLE_ADMIN'])).toBe(true);
    expect(canAccessPath('/admin/classes', ['ROLE_LECTURE_MASTER'])).toBe(false);
  });
});
