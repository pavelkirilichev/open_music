import { useMemo, useState, useRef, useEffect, useCallback, type UIEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PersonIcon from '@mui/icons-material/Person';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import {
  useLikedTracks,
  useLibraryAlbums,
  useLibraryArtists,
  useRemoveLibraryArtist,
  useRemoveLibraryAlbum,
} from '../api/hooks/useLibrary';
import { TrackRow } from '../components/Track/TrackRow';
import { ArtworkImage } from '../components/Common/ArtworkImage';
import { LoadingSpinner } from '../components/Common/LoadingSpinner';
import { canonicalizeArtistName, formatAlbumName, formatArtistNames } from '../utils/trackText';

function getAlbumArtworkUrl(albumRef: Record<string, unknown>): string | undefined {
  const artworkUrl = typeof albumRef.artworkUrl === 'string' ? albumRef.artworkUrl : undefined;
  const coverUrl = typeof albumRef.coverUrl === 'string' ? albumRef.coverUrl : undefined;
  const mbid = typeof albumRef.mbid === 'string' ? albumRef.mbid : undefined;

  if (artworkUrl) return artworkUrl;
  if (coverUrl) return coverUrl;
  if (mbid) return `https://coverartarchive.org/release-group/${mbid}/front-250`;

  return undefined;
}

const TRACK_LIST_MAX_HEIGHT = 680;
const TRACK_ROW_HEIGHT_DESKTOP = 58;
const TRACK_ROW_HEIGHT_MOBILE = 62;
const TRACK_LIST_OVERSCAN = 8;

export function LibraryPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [filter, setFilter] = useState('');
  const tracksScrollRef = useRef<HTMLDivElement | null>(null);
  const [tracksScrollTop, setTracksScrollTop] = useState(0);

  const { data: likedData, isLoading: likedLoading } = useLikedTracks();
  const allTracks = likedData?.tracks ?? [];
  const total = likedData?.total ?? 0;

  const normalizedFilter = filter.trim().toLowerCase();
  const filteredTracks = useMemo(() => {
    if (!normalizedFilter) return allTracks;
    return allTracks.filter((track) =>
      `${track.title} ${track.artist}`.toLowerCase().includes(normalizedFilter),
    );
  }, [allTracks, normalizedFilter]);

  const trackRowHeight = isMobile ? TRACK_ROW_HEIGHT_MOBILE : TRACK_ROW_HEIGHT_DESKTOP;
  const totalTracksHeight = filteredTracks.length * trackRowHeight;
  const enableVirtualScroll = totalTracksHeight > TRACK_LIST_MAX_HEIGHT;
  const visibleViewportHeight = enableVirtualScroll ? TRACK_LIST_MAX_HEIGHT : totalTracksHeight;
  const startIndex = enableVirtualScroll
    ? Math.max(0, Math.floor(tracksScrollTop / trackRowHeight) - TRACK_LIST_OVERSCAN)
    : 0;
  const endIndex = enableVirtualScroll
    ? Math.min(
      filteredTracks.length,
      Math.ceil((tracksScrollTop + visibleViewportHeight) / trackRowHeight) + TRACK_LIST_OVERSCAN,
    )
    : filteredTracks.length;
  const visibleTracks = filteredTracks.slice(startIndex, endIndex);
  const topSpacerHeight = startIndex * trackRowHeight;
  const bottomSpacerHeight = Math.max(0, totalTracksHeight - endIndex * trackRowHeight);

  const handleTracksScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    setTracksScrollTop(e.currentTarget.scrollTop);
  }, []);

  useEffect(() => {
    setTracksScrollTop(0);
    if (tracksScrollRef.current) tracksScrollRef.current.scrollTop = 0;
  }, [normalizedFilter, filteredTracks.length]);

  const likedSet = useMemo(
    () => new Set(allTracks.map((track) => `${track.provider}:${track.providerId}`)),
    [allTracks],
  );

  const { data: albums, isLoading: albumsLoading } = useLibraryAlbums();
  const { data: artists, isLoading: artistsLoading } = useLibraryArtists();
  const { mutate: removeArtist } = useRemoveLibraryArtist();
  const { mutate: removeAlbum } = useRemoveLibraryAlbum();

  const artistList = (artists as Array<{ id: string; artistRef: Record<string, string> }>) ?? [];
  const albumList = (albums as Array<{ id: string; albumRef: Record<string, unknown> }>) ?? [];

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Библиотека
        </Typography>
      </Box>

      {artistsLoading ? (
        <LoadingSpinner />
      ) : artistList.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" fontWeight={700} mb={2}>
            Исполнители
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
            {artistList.map((a) => (
              <Box
                key={a.id}
                sx={{
                  cursor: 'pointer',
                  '&:hover': { opacity: 0.85 },
                  transition: 'opacity 0.2s',
                  flexShrink: 0,
                  width: 130,
                  textAlign: 'center',
                  position: 'relative',
                }}
              >
                <Box
                  onClick={() => navigate(`/artist/${encodeURIComponent(canonicalizeArtistName(a.artistRef.name))}`)}
                  sx={{
                    width: 100,
                    height: 100,
                    borderRadius: '50%',
                    mx: 'auto',
                    background: 'linear-gradient(135deg, #FFDB4D 0%, #FF8C00 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mb: 1,
                  }}
                >
                  <PersonIcon sx={{ fontSize: 40, color: '#000' }} />
                </Box>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  noWrap
                  onClick={() => navigate(`/artist/${encodeURIComponent(canonicalizeArtistName(a.artistRef.name))}`)}
                >
                  {canonicalizeArtistName(a.artistRef.name)}
                </Typography>
                <Tooltip title="Удалить из библиотеки">
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); removeArtist(a.id); }}
                    sx={{ mt: 0.5, opacity: 0.5, '&:hover': { opacity: 1 } }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {albumsLoading ? (
        <LoadingSpinner />
      ) : albumList.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" fontWeight={700} mb={2}>
            Альбомы
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
            {albumList.map((a) => {
              const albumRef = a.albumRef;
              const albumMbid = typeof albumRef.mbid === 'string' ? albumRef.mbid : '';
              const albumTitle = typeof albumRef.title === 'string' ? albumRef.title : '';
              const albumArtist = typeof albumRef.artist === 'string' ? albumRef.artist : '';

              return (
                <Box
                  key={a.id}
                  sx={{
                    cursor: 'pointer',
                    flexShrink: 0,
                    width: 150,
                    position: 'relative',
                    '&:hover .album-remove-btn': {
                      opacity: 1,
                      transform: 'scale(1)',
                    },
                  }}
                >
                  <Box onClick={() => albumMbid && navigate(`/album/${albumMbid}`)} sx={{ position: 'relative' }}>
                    <ArtworkImage src={getAlbumArtworkUrl(albumRef)} size={150} borderRadius={1} />
                    <Tooltip title="Удалить из библиотеки">
                      <IconButton
                        className="album-remove-btn"
                        size="small"
                        onClick={(e) => { e.stopPropagation(); removeAlbum(a.id); }}
                        sx={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          opacity: 0,
                          transform: 'scale(0.96)',
                          transition: 'opacity 0.2s, transform 0.2s',
                          backgroundColor: 'rgba(0,0,0,0.58)',
                          color: '#fff',
                          '&:hover': { backgroundColor: 'rgba(0,0,0,0.78)' },
                        }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Typography variant="body2" fontWeight={600} noWrap mt={1}>
                      {formatAlbumName(albumTitle)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {formatArtistNames(albumArtist)}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <Typography variant="h6" fontWeight={700}>
            Любимые треки {total > 0 ? `(${total})` : ''}
          </Typography>
          {allTracks.length > 0 && (
            <TextField
              size="small"
              placeholder="Фильтр по названию или исполнителю..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              sx={{ flex: 1, minWidth: 200, maxWidth: 400 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                  </InputAdornment>
                ),
                endAdornment: filter ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setFilter('')}>
                      <ClearIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
          )}
        </Box>
        {likedLoading ? (
          <LoadingSpinner />
        ) : allTracks.length === 0 ? (
          <EmptyState message="Нет лайкнутых треков. Нажмите ❤ при прослушивании!" />
        ) : filteredTracks.length === 0 && normalizedFilter ? (
          <Typography variant="body2" color="text.secondary" py={3} textAlign="center">
            Ничего не найдено для &ldquo;{filter.trim()}&rdquo;
          </Typography>
        ) : (
          <Box
            ref={tracksScrollRef}
            onScroll={enableVirtualScroll ? handleTracksScroll : undefined}
            sx={{
              maxHeight: TRACK_LIST_MAX_HEIGHT,
              overflowY: enableVirtualScroll ? 'auto' : 'visible',
              pr: enableVirtualScroll ? 0.5 : 0,
            }}
          >
            {topSpacerHeight > 0 && <Box sx={{ height: topSpacerHeight }} />}
            {visibleTracks.map((track, i) => (
              <TrackRow
                key={`${track.provider}:${track.providerId}`}
                track={track}
                index={startIndex + i}
                showIndex
                queue={filteredTracks}
                likedSet={likedSet}
                showAlbumRight
              />
            ))}
            {bottomSpacerHeight > 0 && <Box sx={{ height: bottomSpacerHeight }} />}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Box textAlign="center" py={6}>
      <Typography color="text.secondary">{message}</Typography>
    </Box>
  );
}
