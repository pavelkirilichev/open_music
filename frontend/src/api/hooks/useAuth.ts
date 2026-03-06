import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import { useAuthStore } from '../../store/auth.store';
import { AuthResponse, User } from '../../types';

export function useMe() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  return useQuery<User>({
    queryKey: ['me'],
    queryFn: () => api.get<User>('/auth/me'),
    enabled: isLoggedIn,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const { setAuth } = useAuthStore();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      api.post<AuthResponse>('/auth/login', data),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, data.refreshToken);
      qc.setQueryData(['me'], data.user);
    },
  });
}

export function useRegister() {
  const { setAuth } = useAuthStore();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: { email: string; username: string; password: string }) =>
      api.post<AuthResponse>('/auth/register', data),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, data.refreshToken);
      qc.setQueryData(['me'], data.user);
    },
  });
}

export function useLogout() {
  const { logout } = useAuthStore();
  const qc = useQueryClient();
  const refreshToken = useAuthStore((s) => s.refreshToken);

  return useMutation({
    mutationFn: () => api.post('/auth/logout', { refreshToken }),
    onSettled: () => {
      logout();
      qc.clear();
    },
  });
}
