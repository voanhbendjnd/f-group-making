import type { StoredUser } from '@/utils/storage';

export function canViewAllClasses(authorities: string[]): boolean {
  return authorities.includes('ROLE_ADMIN') || authorities.includes('ROLE_LECTURE_MASTER');
}

export function canManageClassRules(user: StoredUser | null, lecturerId: number | null): boolean {
  if (!user) return false;
  if (user.authorities.includes('ROLE_ADMIN')) return true;
  return lecturerId === user.id && user.authorities.some(role =>
    role === 'ROLE_LECTURE' || role === 'ROLE_LECTURE_MASTER');
}

export function getHomeRoute(authorities: string[]): string {
  if (authorities.includes('ROLE_ADMIN')) return '/admin/dashboard';
  if (authorities.includes('ROLE_LECTURE') || authorities.includes('ROLE_LECTURE_MASTER')) return '/lecturer/classes';
  if (authorities.includes('ROLE_STUDENT')) return '/student/dashboard';
  return '/unauthorized';
}

export function canAccessPath(path: string, authorities: string[]): boolean {
  if (path.startsWith('/admin/')) return authorities.includes('ROLE_ADMIN');
  if (path.startsWith('/lecturer/')) return canViewAllClasses(authorities) || authorities.includes('ROLE_LECTURE');
  if (path.startsWith('/student/')) {
    return authorities.includes('ROLE_STUDENT') || authorities.includes('ROLE_ADMIN');
  }
  return false;
}
