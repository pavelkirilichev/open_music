import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Pagination,
  IconButton,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd';
import BookmarkAddedIcon from '@mui/icons-material/BookmarkAdded';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import { useSearch } from '../api/hooks/useSearch';
import { useLikedIds, useAddLibraryAlbum, useLibraryAlbums, useLibraryArtists, useAddLibraryArtist } from '../api/hooks/useLibrary';
import { useAlbumSearch, useArtistAlbums, AlbumItem } from '../api/hooks/useArtist';
import { useAuthStore } from '../store/auth.store';
import { TrackRow } from '../components/Track/TrackRow';
import { ArtworkImage } from '../components/Common/ArtworkImage';
import { LoadingSpinner } from '../components/Common/LoadingSpinner';
import { Track } from '../types';

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
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const q = searchParams.get('q') ?? '';

  // ── Albums: artist lookup (gets artist's discography) ──
  const { data: artistAlbumsData, isLoading: artistAlbumsLoading } = useArtistAlbums(q);

  // ── Albums: MusicBrainz text search (release-group title match) ──
  const { data: textAlbumsData, isLoading: textAlbumsLoading } = useAlbumSearch(q, 1, q.length > 0);

  // ── Tracks: YouTube only ──
  const { data: trackData, isLoading: tracksLoading, isFetching: tracksFetching } = useSearch(
    { q, provider: 'youtube', type: 'track', page, limit: 20 },
    q.length > 0,
  );

  const { data: likedSet } = useLikedIds(trackData?.tracks ?? []);
  const { data: libraryAlbumsRaw } = useLibraryAlbums();
  const { mutate: addAlbum } = useAddLibraryAlbum();
  const { data: libraryArtistsRaw } = useLibraryArtists();
  const { mutate: addArtist } = useAddLibraryArtist();

  const savedMbids = new Set<string>(
    ((libraryAlbumsRaw as Array<{ albumRef: { mbid?: string } }>) ?? [])
      .map((a) => a.albumRef?.mbid)
      .filter(Boolean) as string[],
  );

  const savedArtistNames = new Set<string>(
    ((libraryArtistsRaw as Array<{ artistRef: { name?: string } }>) ?? [])
      .map((a) => a.artistRef?.name?.toLowerCase())
      .filter(Boolean) as string[],
  );

  useEffect(() => { setPage(1); }, [q]);

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

  // ── Filter tracks ──
  const tracks: Track[] = useMemo(() => {
    if (!trackData?.tracks) return [];
    return trackData.tracks.filter((t) => {
      if (t.duration && t.duration > 600) return false;
      if (t.duration && t.duration < 30) return false;
      return true;
    });
  }, [trackData]);

  const totalTrackPages = trackData ? Math.ceil(trackData.total / 20) : 0;
  const albumsLoading = artistAlbumsLoading || textAlbumsLoading;
  const foundArtist = artistAlbumsData?.artist;

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
            onClick={() => navigate(`/artist/${encodeURIComponent(foundArtist.name)}`)}
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
            <ArtworkImage src={albums[0]?.artworkUrl} size={64} borderRadius={32} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">
                Исполнитель
              </Typography>
              <Typography variant="h6" fontWeight={700}>
                {foundArtist.name}
              </Typography>
              {foundArtist.disambiguation && (
                <Typography variant="caption" color="text.secondary">
                  {foundArtist.disambiguation}
                </Typography>
              )}
            </Box>
            {isLoggedIn && (() => {
              const isSaved = savedArtistNames.has(foundArtist.name.toLowerCase());
              return (
                <Tooltip title={isSaved ? 'В библиотеке' : 'Добавить в библиотеку'}>
                  <IconButton
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isSaved) addArtist({ name: foundArtist.name, mbid: foundArtist.mbid });
                    }}
                    sx={{ color: isSaved ? 'primary.main' : 'text.secondary' }}
                  >
                    {isSaved ? <FavoriteIcon /> : <FavoriteBorderIcon />}
                  </IconButton>
                </Tooltip>
              );
            })()}
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
            {albums.map((album) => (
              <AlbumCard
                key={album.mbid}
                album={album}
                isSaved={savedMbids.has(album.mbid)}
                isLoggedIn={isLoggedIn}
                onOpen={() => navigate(`/album/${album.mbid}`)}
                onSave={() => addAlbum({
                  mbid: album.mbid,
                  title: album.title,
                  artist: album.artist,
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
        tracksLoading || tracksFetching ? (
          <LoadingSpinner message="Загрузка треков..." />
        ) : tracks.length === 0 ? (
          !albumsLoading && albums.length === 0 && (
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
            {tracks.map((track, i) => (
              <TrackRow
                key={`${track.provider}:${track.providerId}`}
                track={track}
                index={(page - 1) * 20 + i}
                showIndex
                queue={tracks}
                likedSet={likedSet}
              />
            ))}

            {totalTrackPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4, pb: 2 }}>
                <Pagination
                  count={totalTrackPages}
                  page={page}
                  onChange={(_, p) => {
                    setPage(p);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  color="primary"
                />
              </Box>
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
        {album.title}
      </Typography>
      <Typography variant="caption" color="text.secondary" noWrap>
        {album.artist}
        {album.firstReleaseDate ? ` \u2022 ${album.firstReleaseDate.slice(0, 4)}` : ''}
      </Typography>
    </Box>
  );
}
