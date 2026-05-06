import { create } from 'zustand';
import api from '../lib/api';

interface User {
  id: string;
  username: string;
  role: string;
  totalWeeklyPoints?: number;
  sharingCode?: string;
  is_guest?: boolean;
  memberships?: Array<{ treeId: string; weeklyNeedPoints: number; status: string; xp: number; level: number }>;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isInitialLoading: boolean;
  isInstallPromptVisible: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
  fetchUser: () => Promise<void>;
  setInstallPromptVisible: (visible: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const storedToken = localStorage.getItem('token');
  const storedUser = localStorage.getItem('user');

  return {
    user: storedUser ? JSON.parse(storedUser) : null,
    token: storedToken || null,
    isAuthenticated: !!storedToken,
    isInitialLoading: !!storedToken, // Only loading if we have a token to verify
    isInstallPromptVisible: false,

    login: (user, token) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, token, isAuthenticated: true, isInitialLoading: false });
    },

    logout: () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      set({ user: null, token: null, isAuthenticated: false });
    },

    fetchUser: async () => {
      try {
        const { data } = await api.get('/auth/me');
        localStorage.setItem('user', JSON.stringify(data));
        set({ user: data, isInitialLoading: false });
      } catch (e) {
        console.error("Failed to fetch user state, logging out...");
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        set({ user: null, token: null, isAuthenticated: false, isInitialLoading: false });
      }
    },

    setInstallPromptVisible: (visible: boolean) => {
      set({ isInstallPromptVisible: visible });
    }
  };
});
