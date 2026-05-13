import { create } from 'zustand';
import api from '../lib/api';

interface User {
  id: string;
  username: string;
  role: string;
  totalWeeklyPoints?: number;
  sharingCode?: string;
  is_guest?: boolean;
  memberships?: Array<{ id: string; treeId: string; weeklyNeedPoints: number; status: string; xp: number; level: number; role?: string }>;
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isInitialLoading: boolean;
  isInstallPromptVisible: boolean;
  login: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  fetchUser: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
  setInstallPromptVisible: (visible: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => {
  const storedToken = localStorage.getItem('token');
  const storedRefreshToken = localStorage.getItem('refreshToken');
  const storedUser = localStorage.getItem('user');

  return {
    user: storedUser ? JSON.parse(storedUser) : null,
    token: storedToken || null,
    refreshToken: storedRefreshToken || null,
    isAuthenticated: !!storedToken,
    isInitialLoading: !!storedToken, // Only loading if we have a token to verify
    isInstallPromptVisible: false,

    login: (user, accessToken, refreshToken) => {
      localStorage.setItem('token', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, token: accessToken, refreshToken, isAuthenticated: true, isInitialLoading: false });
    },

    logout: () => {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      set({ user: null, token: null, refreshToken: null, isAuthenticated: false });
    },

    refreshAccessToken: async () => {
      const { refreshToken } = get();
      if (!refreshToken) return null;
      try {
        const { data } = await api.post('/auth/refresh', { refreshToken });
        const newAccessToken = data.accessToken;
        const newRefreshToken = data.refreshToken;
        localStorage.setItem('token', newAccessToken);
        localStorage.setItem('refreshToken', newRefreshToken);
        set({ token: newAccessToken, refreshToken: newRefreshToken });
        return newAccessToken;
      } catch {
        // Refresh failed — force logout
        get().logout();
        return null;
      }
    },

    fetchUser: async () => {
      try {
        const { data } = await api.get('/auth/me');
        localStorage.setItem('user', JSON.stringify(data));
        set({ user: data, isInitialLoading: false });
      } catch (e) {
        console.error("Failed to fetch user state, logging out...");
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        set({ user: null, token: null, refreshToken: null, isAuthenticated: false, isInitialLoading: false });
      }
    },

  setInstallPromptVisible: (visible: boolean) => {
      set({ isInstallPromptVisible: visible });
    }
  };
});
