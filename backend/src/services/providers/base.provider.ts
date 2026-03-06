import { Response } from 'express';
import { TrackMeta, SearchResult } from '../../types';

export interface SearchOptions {
  query: string;
  type?: 'track' | 'album' | 'artist';
  page?: number;
  limit?: number;
}

export abstract class BaseProvider {
  abstract readonly name: string;

  abstract search(opts: SearchOptions): Promise<SearchResult>;
  abstract getTrackMeta(providerId: string): Promise<TrackMeta>;
  abstract getStreamUrl(providerId: string): Promise<string>;

  /**
   * Optional: providers that stream directly to the response (e.g. torrent-based)
   * override this instead of getStreamUrl. The stream service checks this first.
   */
  async streamDirect?(
    _providerId: string,
    _rangeHeader: string | undefined,
    _res: Response,
  ): Promise<void>;

  // Optional: album listing
  async getAlbumTracks(_albumId: string): Promise<TrackMeta[]> {
    return [];
  }

  protected makeTrackId(providerId: string): string {
    return `${this.name}:${providerId}`;
  }
}
