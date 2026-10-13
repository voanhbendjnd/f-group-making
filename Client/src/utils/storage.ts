const TOKEN_KEY = 'f_group_auth_token';
const USER_KEY = 'f_group_auth_user';

export interface StoredUser {
  id: number;
  email: string;
  name: string | null;
  authorities: string[];
}

export const storage = {
  getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },

  setToken(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch (e) {
      console.error('Failed to save token to storage', e);
    }
  },

  clearToken(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      console.error('Failed to clear token from storage', e);
    }
  },

  getUser(): StoredUser | null {
    try {
      const data = localStorage.getItem(USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  setUser(user: StoredUser): void {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) {
      console.error('Failed to save user to storage', e);
    }
  },

  clearUser(): void {
    try {
      localStorage.removeItem(USER_KEY);
    } catch (e) {
      console.error('Failed to clear user from storage', e);
    }
  },

  clearAll(): void {
    storage.clearToken();
    storage.clearUser();
  },
};
