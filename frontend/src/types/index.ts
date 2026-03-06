export type Provider = 'youtube' | 'archive' | 'jamendo' | 'soundcloud' | 'zaycev' | 'rutracker' | 'vk';

export interface Track {
  id: string;
  provider: Provider;
  providerId: string;
  title: string;
  artist: string;
  album?: string;
  albumMbid?: string;
  duration?: number; // seconds
  artworkUrl?: string;
  year?: number;
  genre?: string;
}

export interface Album {
  provider: Provider;
  providerId: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  year?: number;
  trackCount?: number;
}

export interface SearchResult {
  tracks: Track[];
  albums: Album[];
  total: number;
  page: number;
  limit: number;
}

export interface Playlist {
  id: string;
  userId: string;
  name: string;
  description?: string;
  isPublic: boolean;
  artworkUrl?: string;
  createdAt: string;
  updatedAt: string;
  _count?: { tracks: number };
  tracks?: Array<{ track: Track; position: number }>;
}

export interface User {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export type RepeatMode = 'none' | 'one' | 'all';
export type CacheStatus = 'not_cached' | 'pending' | 'processing' | 'ready' | 'error';
