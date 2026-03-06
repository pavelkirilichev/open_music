import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import { SearchResult } from '../../types';

export interface SearchParams {
  q: string;
  provider?: string;
  type?: string;
  page?: number;
  limit?: number;
}

export function useSearch(params: SearchParams, enabled = true) {
  return useQuery<SearchResult>({
    queryKey: ['search', params],
    queryFn: () =>
      api.get<SearchResult>('/search', params as Record<string, unknown>),
    enabled: enabled && params.q.trim().length > 0,
    staleTime: 2 * 60_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
}
