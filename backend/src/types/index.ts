export type Provider = 'youtube' | 'archive' | 'jamendo' | 'soundcloud' | 'zaycev' | 'rutracker' | 'vk';

export interface TrackMeta {
  id: string;
  provider: Provider;
  providerId: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number; // seconds
  artworkUrl?: string;
  year?: number;
  genre?: string;
  score?: number; // relevance score for ranking
}

export interface AlbumMeta {
  id?: string;
  provider: Provider;
  providerId: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  year?: number;
  trackCount?: number;
}

export interface SearchResult {
  tracks: TrackMeta[];
  albums: AlbumMeta[];
  total: number;
  page: number;
  limit: number;
}

export interface StreamInfo {
  url: string;
  mimeType: string;
  contentLength?: number;
  fromCache: boolean;
  provider: Provider;
}

export interface JwtPayload {
  sub: string; // userId
  email: string;
  iat?: number;
  exp?: number;
}

// Express augmentation
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
