import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import { Track } from '../../types';
import { useAuthStore } from '../../store/auth.store';

interface LibraryTracksResponse {
  tracks: Track[];
  total: number;
  page: number;
  limit: number;
}

export function useLikedTracks(page = 1, limit = 50) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  return useQuery<LibraryTracksResponse>({
    queryKey: ['library', 'tracks', page, limit],
    queryFn: () => api.get<LibraryTracksResponse>('/library/tracks', { page, limit }),
    enabled: isLoggedIn,
  });
}

// ─── Batch liked check — ONE request for all tracks on screen ─────────────────
// Returns a Set<"provider:providerId"> — O(1) membership check
export function useLikedIds(tracks: Array<{ provider: string; providerId: string }>) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  // Stable cache key: sorted list of "provider:id" strings
  const key = tracks
    .map((t) => `${t.provider}:${t.providerId}`)
    .sort()
    .join(',');

  return useQuery<Set<string>>({
    queryKey: ['library', 'liked-batch', key],
    queryFn: async () => {
      if (!isLoggedIn || tracks.length === 0) return new Set<string>();
      const data = await api.post<{ liked: string[] }>('/library/tracks/liked-batch', {
        items: tracks.map((t) => ({ provider: t.provider, providerId: t.providerId })),
      });
      return new Set(data.liked);
    },
    enabled: isLoggedIn && tracks.length > 0,
    staleTime: 2 * 60 * 1000,   // 2 min — liked status doesn't change that often
    gcTime: 5 * 60 * 1000,
    placeholderData: new Set<string>(),
  });
}

// ─── Mutations — optimistically update the liked-batch cache ──────────────────

export function useLikeTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, providerId }: { provider: string; providerId: string }) =>
      api.post(`/library/tracks/${provider}/${providerId}`),
    onSuccess: () => {
      // Invalidate both liked tracks list and all batch caches
      qc.invalidateQueries({ queryKey: ['library', 'tracks'] });
      qc.invalidateQueries({ queryKey: ['library', 'liked-batch'] });
    },
  });
}

export function useUnlikeTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, providerId }: { provider: string; providerId: string }) =>
      api.delete(`/library/tracks/${provider}/${providerId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library', 'tracks'] });
      qc.invalidateQueries({ queryKey: ['library', 'liked-batch'] });
    },
  });
}

// ─── Single-track check (kept for backward compat, avoid using in lists) ──────
export function useIsLiked(provider: string, providerId: string) {
  const { data } = useLikedIds(
    provider && providerId ? [{ provider, providerId }] : [],
  );
  return { data: { liked: data?.has(`${provider}:${providerId}`) ?? false } };
}

export function useAddLibraryAlbum() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (album: Record<string, unknown>) => api.post('/library/albums', album),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library', 'albums'] }),
  });
}

export function useRemoveLibraryAlbum() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (albumId: string) => api.delete(`/library/albums/${albumId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library', 'albums'] }),
  });
}

export function useLibraryAlbums() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  return useQuery({
    queryKey: ['library', 'albums'],
    queryFn: () => api.get('/library/albums'),
    enabled: isLoggedIn,
  });
}

// ─── Artist library ──────────────────────────────────────────────────────────

export function useLibraryArtists() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  return useQuery({
    queryKey: ['library', 'artists'],
    queryFn: () => api.get('/library/artists'),
    enabled: isLoggedIn,
  });
}

export function useAddLibraryArtist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (artist: Record<string, unknown>) => api.post('/library/artists', artist),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library', 'artists'] }),
  });
}

export function useRemoveLibraryArtist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (artistId: string) => api.delete(`/library/artists/${artistId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library', 'artists'] }),
  });
}

export function useListenHistory() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  return useQuery({
    queryKey: ['library', 'history'],
    queryFn: () => api.get('/library/history'),
    enabled: isLoggedIn,
  });
}

export function useRecordHistory() {
  return useMutation({
    mutationFn: (data: { provider: string; providerId: string; durationMs?: number }) =>
      api.post('/library/history', data),
  });
}
