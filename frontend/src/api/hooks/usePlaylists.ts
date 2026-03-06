import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import { Playlist } from '../../types';
import { useAuthStore } from '../../store/auth.store';

export function usePlaylists() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  return useQuery<Playlist[]>({
    queryKey: ['playlists'],
    queryFn: () => api.get<Playlist[]>('/playlists'),
    enabled: isLoggedIn,
  });
}

export function usePlaylist(id: string) {
  return useQuery<Playlist>({
    queryKey: ['playlists', id],
    queryFn: () => api.get<Playlist>(`/playlists/${id}`),
    enabled: !!id,
  });
}

export function useCreatePlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; isPublic?: boolean }) =>
      api.post<Playlist>('/playlists', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playlists'] }),
  });
}

export function useUpdatePlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name: string;
      description?: string;
      isPublic?: boolean;
    }) => api.put<Playlist>(`/playlists/${id}`, data),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['playlists'] });
      qc.invalidateQueries({ queryKey: ['playlists', id] });
    },
  });
}

export function useDeletePlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/playlists/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playlists'] }),
  });
}

export function useAddTrackToPlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      playlistId,
      provider,
      providerId,
    }: {
      playlistId: string;
      provider: string;
      providerId: string;
    }) => api.post(`/playlists/${playlistId}/tracks`, { provider, providerId }),
    onSuccess: (_data, { playlistId }) =>
      qc.invalidateQueries({ queryKey: ['playlists', playlistId] }),
  });
}

export function useRemoveTrackFromPlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ playlistId, trackId }: { playlistId: string; trackId: string }) =>
      api.delete(`/playlists/${playlistId}/tracks/${trackId}`),
    onSuccess: (_data, { playlistId }) =>
      qc.invalidateQueries({ queryKey: ['playlists', playlistId] }),
  });
}

export function useImportPlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => api.post('/playlists/import', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playlists'] }),
  });
}
