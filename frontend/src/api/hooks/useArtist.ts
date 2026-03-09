import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import { Track } from '../../types';

export interface AlbumItem {
  mbid: string;
  title: string;
  type: string;
  firstReleaseDate: string;
  artworkUrl: string;
}

export interface ArtistAlbumsData {
  artist: { mbid: string; name: string; country?: string; disambiguation?: string };
  albums: AlbumItem[];
}

export interface AlbumTrack {
  position: number;
  title: string;
  duration: number | null;
  mbid: string;
}

export interface AlbumDetailData {
  mbid: string;
  title: string;
  artist: string;
  year: string;
  type?: string;
  tracks: AlbumTrack[];
  artworkUrl?: string;
  artworkUrlRelease?: string;
}

export interface MBRecording {
  mbid: string;
  title: string;
  duration: number | null;
  album: string | null;
  albumMbid: string | null;
  year: string | null;
}

export interface ArtistRecordingsData {
  artist: { mbid: string; name: string } | null;
  recordings: MBRecording[];
  total: number;
  page: number;
}

export interface ArtistProviderTracksData {
  tracks: Track[];
}

export function useArtistAlbums(name: string) {
  return useQuery<ArtistAlbumsData>({
    queryKey: ['artist-albums', name],
    queryFn: () => api.get<ArtistAlbumsData>('/artists/albums', { name } as Record<string, unknown>),
    enabled: name.length > 0,
    staleTime: 1000 * 60 * 60,
  });
}

export function useAlbumDetail(mbid: string) {
  return useQuery<AlbumDetailData>({
    queryKey: ['album-detail', mbid],
    queryFn: () => api.get<AlbumDetailData>(`/artists/albums/${mbid}`),
    enabled: mbid.length > 0,
    staleTime: 1000 * 60 * 60 * 24,
  });
}

export function useArtistRecordings(name: string, page = 1) {
  return useQuery<ArtistRecordingsData>({
    queryKey: ['artist-recordings', name, page],
    queryFn: () =>
      api.get<ArtistRecordingsData>('/artists/recordings', {
        name,
        page,
      } as Record<string, unknown>),
    enabled: name.length > 0,
    staleTime: 1000 * 60 * 60,
  });
}

export interface AlbumSearchResult {
  albums: Array<AlbumItem & { artist: string }>;
  total: number;
  page: number;
  limit: number;
}

export function useAlbumSearch(q: string, page = 1, enabled = true) {
  return useQuery<AlbumSearchResult>({
    queryKey: ['album-search', q, page],
    queryFn: () =>
      api.get<AlbumSearchResult>('/artists/search-albums', { q, page } as Record<string, unknown>),
    enabled: enabled && q.length > 0,
    staleTime: 1000 * 60 * 30,
  });
}

export function useArtistImage(name: string) {
  return useQuery<{ imageUrl: string | null }>({
    queryKey: ['artist-image', name],
    queryFn: () => api.get<{ imageUrl: string | null }>('/artists/image', { name } as Record<string, unknown>),
    enabled: name.length > 0,
    staleTime: 1000 * 60 * 60 * 24, // 24h
    gcTime: 1000 * 60 * 60 * 48,
  });
}

export function useMbTracks(name: string, albumMbid?: string) {
  return useQuery<ArtistProviderTracksData>({
    queryKey: ['artist-mb-tracks', name, albumMbid],
    queryFn: () =>
      api.get<ArtistProviderTracksData>('/artists/mb-tracks', {
        name,
        ...(albumMbid ? { albumMbid } : {}),
      } as Record<string, unknown>),
    enabled: name.length > 0,
    staleTime: 1000 * 60 * 60 * 4, // 4h
    gcTime: 1000 * 60 * 60 * 8,
  });
}

/**
 * Fetches streamable tracks for an artist from all providers,
 * using per-album searches for comprehensive coverage.
 */
export function useArtistProviderTracks(name: string, albumMbid?: string) {
  return useQuery<ArtistProviderTracksData>({
    queryKey: ['artist-provider-tracks', name, albumMbid],
    queryFn: () =>
      api.get<ArtistProviderTracksData>('/artists/provider-tracks', {
        name,
        albumMbid,
      } as Record<string, unknown>),
    enabled: name.length > 0,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 2, // keep in cache 2h — expensive query
  });
}
