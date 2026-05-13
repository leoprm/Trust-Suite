import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const apiBaseUrl = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3100/api`;

const api = axios.create({
  baseURL: apiBaseUrl,
});

// Automatically add JWT token to requests
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh on 401
let isRefreshing = false;
let pendingQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 403 && !originalRequest._retry) {
      // Don't try to refresh on 403 if the refresh itself failed
      if (originalRequest.url === '/auth/refresh') {
        return Promise.reject(error);
      }
      
      if (!isRefreshing) {
        isRefreshing = true;
        originalRequest._retry = true;
        
        const newToken = await useAuthStore.getState().refreshAccessToken();
        
        if (newToken) {
          // Retry queued requests
          pendingQueue.forEach(({ resolve }) => resolve(newToken));
          pendingQueue = [];
          
          // Retry original request
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
        
        // Refresh failed — reject all
        pendingQueue.forEach(({ reject }) => reject(new Error('Session expired')));
        pendingQueue = [];
        isRefreshing = false;
        return Promise.reject(error);
      }
      
      // Another refresh is in progress — queue this request
      return new Promise<string>((resolve, reject) => {
        pendingQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      });
    }
    
    return Promise.reject(error);
  }
);

export default api;
