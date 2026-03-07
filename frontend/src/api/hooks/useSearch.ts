import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
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
  const queryParams: Record<string, unknown> = { ...params };

  return useQuery<SearchResult>({
    queryKey: ['search', params],
    queryFn: () =>
      api.get<SearchResult>('/search', queryParams),
    enabled: enabled && params.q.trim().length > 0,
    staleTime: 2 * 60_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
}

const SEARCH_PAGE_SIZE = 20;

export function useInfiniteSearch(
  params: Omit<SearchParams, 'page'>,
  enabled = true,
) {
  return useInfiniteQuery<SearchResult>({
    queryKey: ['search-infinite', params],
    queryFn: ({ pageParam }) =>
      api.get<SearchResult>('/search', { ...params, page: pageParam, limit: SEARCH_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.page * lastPage.limit;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    enabled: enabled && params.q.trim().length > 0,
    staleTime: 2 * 60_000,
    gcTime: 5 * 60_000,
  });
}
