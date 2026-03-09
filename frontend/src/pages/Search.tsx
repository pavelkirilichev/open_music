import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  CircularProgress,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd';
import BookmarkAddedIcon from '@mui/icons-material/BookmarkAdded';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import { useInfiniteSearch } from '../api/hooks/useSearch';
import { useLikedIds, useAddLibraryAlbum, useLibraryAlbums, useLibraryArtists, useAddLibraryArtist } from '../api/hooks/useLibrary';
import { useAlbumSearch, useArtistAlbums, useArtistImage, AlbumItem } from '../api/hooks/useArtist';
import { useAuthStore } from '../store/auth.store';
import { TrackRow } from '../components/Track/TrackRow';
import { ArtworkImage } from '../components/Common/ArtworkImage';
import { LoadingSpinner } from '../components/Common/LoadingSpinner';
import { Track } from '../types';
import { canonicalizeArtistName, formatAlbumName, formatArtistNames } from '../utils/trackText';

/** Merge + dedup albums from multiple sources by mbid */
function mergeAlbums(
  ...sources: Array<Array<AlbumItem & { artist: string }> | undefined>
): Array<AlbumItem & { artist: string }> {
  const seen = new Set<string>();
  const result: Array<AlbumItem & { artist: string }> = [];
  for (const src of sources) {
    if (!src) continue;
    for (const album of src) {
      if (seen.has(album.mbid)) continue;
      seen.add(album.mbid);
      result.push(album);
    }
  }
  return result;
}

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const q = searchParams.get('q') ?? '';

  // ── Albums: artist lookup (gets artist's discography) ──
  const { data: artistAlbumsData, isLoading: artistAlbumsLoading } = useArtistAlbums(q);

  // ── Albums: MusicBrainz text search (release-group title match) ──
  const { data: textAlbumsData, isLoading: textAlbumsLoading } = useAlbumSearch(q, 1, q.length > 0);

  // ── Tracks: YouTube only (infinite) ──
  const {
    data: trackPages,
    isLoading: tracksLoading,
    isFetching: tracksFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteSearch(
    { q, provider: 'youtube', type: 'track' },
    q.length > 0,
  );

  const allTracks = useMemo(
    () => trackPages?.pages.flatMap((p) => p.tracks) ?? [],
    [trackPages],
  );

  const { data: likedSet } = useLikedIds(allTracks);
  const { data: libraryAlbumsRaw } = useLibraryAlbums();
  const { mutate: addAlbum } = useAddLibraryAlbum();
  const { data: libraryArtistsRaw } = useLibraryArtists();
  const { mutate: addArtist } = useAddLibraryArtist();

  const savedMbids = useMemo(
    () =>
      new Set<string>(
        ((libraryAlbumsRaw as Array<{ albumRef: { mbid?: string } }>) ?? [])
          .map((a) => a.albumRef?.mbid)
          .filter(Boolean) as string[],
      ),
    [libraryAlbumsRaw],
  );

  const savedArtistNames = useMemo(
    () =>
      new Set<string>(
        ((libraryArtistsRaw as Array<{ artistRef: { name?: string } }>) ?? [])
          .map((a) => canonicalizeArtistName(a.artistRef?.name ?? '').toLowerCase())
          .filter(Boolean) as string[],
      ),
    [libraryArtistsRaw],
  );

  // ── Merge artist albums + text search albums, dedup, filter ──
  const artistAlbums: Array<AlbumItem & { artist: string }> = useMemo(() => {
    if (!artistAlbumsData?.albums) return [];
    return artistAlbumsData.albums
      .filter((a) => {
        const t = a.type.toLowerCase();
        return t.includes('album') || t.includes('single') || t.includes('ep') || t === '';
      })
      .map((a) => ({ ...a, artist: artistAlbumsData.artist?.name ?? '' }));
  }, [artistAlbumsData]);

  const textAlbums: Array<AlbumItem & { artist: string }> = useMemo(() => {
    if (!textAlbumsData?.albums) return [];
    return textAlbumsData.albums.filter((a) => {
      const t = a.type.toLowerCase();
      return t.includes('album') || t.includes('single') || t.includes('ep') || t === '';
    });
  }, [textAlbumsData]);

  const albums = useMemo(
    () => mergeAlbums(artistAlbums, textAlbums).slice(0, 12),
    [artistAlbums, textAlbums],
  );
  const sortedAlbums = useMemo(() => {
    if (!albums.length) return albums;
    const saved: Array<AlbumItem & { artist: string }> = [];
    const regular: Array<AlbumItem & { artist: string }> = [];
    for (const album of albums) {
      if (savedMbids.has(album.mbid)) saved.push(album);
      else regular.push(album);
    }
    return [...saved, ...regular];
  }, [albums, savedMbids]);

  // ── Filter tracks ──
  const tracks: Track[] = useMemo(() => {
    return allTracks.filter((t) => {
      if (t.duration && t.duration > 600) return false;
      if (t.duration && t.duration < 30) return false;
      return true;
    });
  }, [allTracks]);
  const sortedTracks: Track[] = useMemo(() => {
    if (!tracks.length || !likedSet) return tracks;
    const saved: Track[] = [];
    const regular: Track[] = [];
    for (const track of tracks) {
      const key = `${track.provider}:${track.providerId}`;
      if (likedSet.has(key)) saved.push(track);
      else regular.push(track);
    }
    return [...saved, ...regular];
  }, [tracks, likedSet]);

  const albumsLoading = artistAlbumsLoading || textAlbumsLoading;
  const foundArtist = artistAlbumsData?.artist;
  const displayFoundArtistName = foundArtist ? canonicalizeArtistName(foundArtist.name) : '';
  const isFoundArtistSaved =
    displayFoundArtistName.length > 0 && savedArtistNames.has(displayFoundArtistName.toLowerCase());

  const { data: artistImageData } = useArtistImage(displayFoundArtistName);
  const artistImageUrl = artistImageData?.imageUrl ?? null;

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleObserver, { rootMargin: '300px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleObserver]);

  return (
    <Box>
      {q ? (
        <Typography variant="h5" fontWeight={700} py={3}>
          Результаты для &ldquo;{q}&rdquo;
        </Typography>
      ) : (
        <Box py={4} textAlign="center">
          <Typography variant="h4" fontWeight={700} mb={1}>
            Поиск
          </Typography>
          <Typography color="text.secondary">
            Ищите треки, исполнителей и альбомы
          </Typography>
        </Box>
      )}

      {/* ── Artist card ── */}
      {q && foundArtist && (
        <Box sx={{ mb: 3 }}>
          <Box
            onClick={() => navigate(`/artist/${encodeURIComponent(displayFoundArtistName)}`)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              p: 2,
              borderRadius: 2,
              cursor: 'pointer',
              backgroundColor: 'rgba(255,255,255,0.04)',
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.08)' },
              transition: 'background-color 0.2s',
            }}
          >
            <Box
              sx={{
                width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
                background: artistImageUrl ? 'none' : 'linear-gradient(135deg, #FFDB4D 0%, #FF8C00 100%)',
                overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {artistImageUrl
                ? <img src={artistImageUrl} alt={displayFoundArtistName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 28, color: '#000' }}>🎤</span>
              }
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">
                Исполнитель
              </Typography>
              <Typography variant="h6" fontWeight={700}>
                {displayFoundArtistName}
              </Typography>
              {foundArtist.disambiguation && (
                <Typography variant="caption" color="text.secondary">
                  {foundArtist.disambiguation}
                </Typography>
              )}
            </Box>
            {isLoggedIn && (
              <Tooltip title={isFoundArtistSaved ? 'В библиотеке' : 'Добавить в библиотеку'}>
                <IconButton
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isFoundArtistSaved) {
                      addArtist({ name: displayFoundArtistName, mbid: foundArtist.mbid });
                    }
                  }}
                  sx={{ color: isFoundArtistSaved ? 'primary.main' : 'text.secondary' }}
                >
                  {isFoundArtistSaved ? <FavoriteIcon /> : <FavoriteBorderIcon />}
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>
      )}

      {/* ── Albums ── */}
      {q && albums.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" fontWeight={700} mb={2}>
            Альбомы
          </Typography>
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              overflowX: 'auto',
              pb: 1,
              '&::-webkit-scrollbar': { height: 4 },
              '&::-webkit-scrollbar-thumb': { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2 },
            }}
          >
            {sortedAlbums.map((album) => (
              <AlbumCard
                key={album.mbid}
                album={album}
                isSaved={savedMbids.has(album.mbid)}
                isLoggedIn={isLoggedIn}
                onOpen={() => navigate(`/album/${album.mbid}`)}
                onSave={() => addAlbum({
                  mbid: album.mbid,
                  title: formatAlbumName(album.title),
                  artist: formatArtistNames(album.artist),
                  artworkUrl: album.artworkUrl,
                  firstReleaseDate: album.firstReleaseDate,
                  type: album.type,
                })}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* ── Tracks ── */}
      {q && (
        tracksLoading || (tracksFetching && allTracks.length === 0) ? (
          <LoadingSpinner message="Загрузка треков..." />
        ) : sortedTracks.length === 0 ? (
          !albumsLoading && sortedAlbums.length === 0 && (
            <Box textAlign="center" py={6}>
              <Typography color="text.secondary">
                Ничего не найдено для &ldquo;{q}&rdquo;
              </Typography>
            </Box>
          )
        ) : (
          <Box>
            <Typography variant="h6" fontWeight={700} mb={1.5}>
              Треки
            </Typography>
            {!isMobile && (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '40px 48px 1fr 80px 40px',
                  px: 2,
                  py: 0.5,
                  mb: 1,
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <Typography variant="caption" color="text.secondary" textAlign="center">#</Typography>
                <Box />
                <Typography variant="caption" color="text.secondary">Название</Typography>
                <Typography variant="caption" color="text.secondary" textAlign="right">Длительность</Typography>
                <Box />
              </Box>
            )}
            {sortedTracks.map((track, i) => (
              <TrackRow
                key={`${track.provider}:${track.providerId}`}
                track={track}
                index={i}
                showIndex
                queue={sortedTracks}
                likedSet={likedSet}
              />
            ))}

            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} />

            {isFetchingNextPage && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            )}

            {!hasNextPage && sortedTracks.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', py: 2 }}>
                Все результаты загружены
              </Typography>
            )}
          </Box>
        )
      )}
    </Box>
  );
}

interface AlbumCardProps {
  album: AlbumItem & { artist: string };
  isSaved: boolean;
  isLoggedIn: boolean;
  onOpen: () => void;
  onSave: () => void;
}

function AlbumCard({ album, isSaved, isLoggedIn, onOpen, onSave }: AlbumCardProps) {
  const displayAlbumTitle = formatAlbumName(album.title);
  const displayArtistName = formatArtistNames(album.artist);

  return (
    <Box
      onClick={onOpen}
      sx={{
        cursor: 'pointer',
        '&:hover': { opacity: 0.85 },
        transition: 'opacity 0.2s',
        flexShrink: 0,
        width: 130,
      }}
    >
      <Box sx={{ position: 'relative' }}>
        <ArtworkImage src={album.artworkUrl} size={130} borderRadius={1} />
        {isLoggedIn && (
          <Tooltip title={isSaved ? 'В библиотеке' : 'Добавить в библиотеку'}>
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); if (!isSaved) onSave(); }}
              sx={{
                position: 'absolute',
                bottom: 4,
                right: 4,
                backgroundColor: 'rgba(0,0,0,0.7)',
                color: isSaved ? 'primary.main' : 'white',
                '&:hover': { backgroundColor: 'rgba(0,0,0,0.9)' },
              }}
            >
              {isSaved ? <BookmarkAddedIcon fontSize="small" /> : <BookmarkAddIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Typography variant="body2" fontWeight={600} noWrap mt={1}>
        {displayAlbumTitle}
      </Typography>
      <Typography variant="caption" color="text.secondary" noWrap>
        {displayArtistName}
        {album.firstReleaseDate ? ` \u2022 ${album.firstReleaseDate.slice(0, 4)}` : ''}
      </Typography>
    </Box>
  );
}
