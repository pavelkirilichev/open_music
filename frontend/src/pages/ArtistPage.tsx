import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Button, Skeleton, Avatar, Pagination, IconButton, Tooltip, useMediaQuery, useTheme } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PersonIcon from '@mui/icons-material/Person';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import { useLikedIds, useLibraryArtists, useAddLibraryArtist } from '../api/hooks/useLibrary';
import { useAuthStore } from '../store/auth.store';
import { useArtistAlbums, useMbTracks, useArtistImage } from '../api/hooks/useArtist';
import { TrackRow } from '../components/Track/TrackRow';
import { ArtworkImage } from '../components/Common/ArtworkImage';
import { LoadingSpinner } from '../components/Common/LoadingSpinner';
import { usePlayerStore } from '../store/player.store';
import { useQueueStore } from '../store/queue.store';
import { Track } from '../types';
import { resolveTrackForPlayback } from '../utils/resolveTrack';

const PAGE_SIZE = 30;

export function ArtistPage() {
  const { name = '' } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const artistName = decodeURIComponent(name);
  const [page, setPage] = useState(1);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Provider tracks — MusicBrainz metadata, no YouTube lookup at render time
  const { data: providerData, isLoading: tracksLoading } = useMbTracks(artistName);
  const allTracks: Track[] = providerData?.tracks ?? [];

  // Paginate client-side (no extra requests)
  const totalPages = Math.ceil(allTracks.length / PAGE_SIZE);
  const pageTracks = allTracks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const { data: likedSet } = useLikedIds(allTracks);
  const { play } = usePlayerStore();
  const { setQueue, toggleShuffle } = useQueueStore();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const { data: libraryArtistsRaw } = useLibraryArtists();
  const { mutate: addArtist } = useAddLibraryArtist();

  const savedArtistNames = new Set<string>(
    ((libraryArtistsRaw as Array<{ artistRef: { name?: string } }>) ?? [])
      .map((a) => a.artistRef?.name?.toLowerCase())
      .filter(Boolean) as string[],
  );
  const isArtistSaved = savedArtistNames.has(artistName.toLowerCase());

  const handlePlayAll = async () => {
    if (!allTracks.length) return;
    setQueue(allTracks, 0);
    const resolved = await resolveTrackForPlayback(allTracks[0]);
    if (resolved) play(resolved);
  };

  const handleShuffle = async () => {
    if (!allTracks.length) return;
    toggleShuffle();
    const idx = Math.floor(Math.random() * allTracks.length);
    setQueue(allTracks, idx);
    const resolved = await resolveTrackForPlayback(allTracks[idx]);
    if (resolved) play(resolved);
  };

  const { data: artistImageData } = useArtistImage(artistName);
  const artistImageUrl = artistImageData?.imageUrl ?? null;

  // Discography from MusicBrainz
  const { data: albumsData, isLoading: albumsLoading } = useArtistAlbums(artistName);

  return (
    <Box>
      <Box sx={{ pt: 2, pb: 1 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(-1)}
          size="small"
          sx={{ color: 'text.secondary', fontWeight: 400 }}
        >
          Назад
        </Button>
      </Box>

      {/* Hero */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 2, md: 3 },
          py: { xs: 2, md: 4 },
          px: { xs: 1.5, md: 2 },
          background: 'linear-gradient(180deg, rgba(255,219,77,0.08) 0%, transparent 100%)',
          borderRadius: 3,
          mb: 3,
          flexWrap: 'wrap',
        }}
      >
        <Avatar
          src={artistImageUrl ?? undefined}
          sx={{
            width: { xs: 80, md: 120 },
            height: { xs: 80, md: 120 },
            background: 'linear-gradient(135deg, #FFDB4D 0%, #FF8C00 100%)',
            flexShrink: 0,
          }}
        >
          <PersonIcon sx={{ fontSize: { xs: 40, md: 60 } }} />
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            fontWeight={600}
            sx={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
          >
            Исполнитель
          </Typography>
          <Typography
            variant="h3"
            fontWeight={800}
            sx={{
              mt: 0.5,
              mb: 1,
              fontSize: { xs: '1.75rem', md: '2.5rem' },
              wordBreak: 'break-word',
            }}
          >
            {artistName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {tracksLoading
              ? 'Загрузка треков...'
              : `${allTracks.length} доступных треков`}
          </Typography>
        </Box>
      </Box>

      {/* Controls */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 4 }}>
        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          onClick={handlePlayAll}
          disabled={!allTracks.length}
          size="large"
        >
          Слушать
        </Button>
        <Button
          variant="outlined"
          startIcon={<ShuffleIcon />}
          onClick={handleShuffle}
          disabled={!allTracks.length}
        >
          Перемешать
        </Button>
        {isLoggedIn && (
          <Tooltip title={isArtistSaved ? 'В библиотеке' : 'Добавить в библиотеку'}>
            <IconButton
              onClick={() => { if (!isArtistSaved) addArtist({ name: artistName }); }}
              sx={{ color: isArtistSaved ? 'primary.main' : 'text.secondary' }}
            >
              {isArtistSaved ? <FavoriteIcon /> : <FavoriteBorderIcon />}
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Track list */}
      <Typography variant="h6" fontWeight={700} mb={1.5}>
        Треки
      </Typography>

      {tracksLoading ? (
        <Box>
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton
              key={i}
              height={56}
              sx={{ borderRadius: 1, mb: 0.5, bgcolor: 'rgba(255,255,255,0.06)' }}
            />
          ))}
        </Box>
      ) : allTracks.length === 0 ? (
        <Box textAlign="center" py={6}>
          <Typography color="text.secondary">
            Треки не найдены. Попробуйте позже — идёт поиск по провайдерам.
          </Typography>
        </Box>
      ) : (
        <>
          {/* Header — hidden on mobile */}
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

          {pageTracks.map((track, i) => (
            <TrackRow
              key={`${track.provider}:${track.providerId}`}
              track={track}
              index={(page - 1) * PAGE_SIZE + i}
              showIndex
              queue={allTracks}
              likedSet={likedSet}
            />
          ))}

          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4, pb: 2 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, p) => {
                  setPage(p);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                color="primary"
              />
            </Box>
          )}
        </>
      )}

      {/* Discography */}
      <Box mt={5}>
        <Typography variant="h6" fontWeight={700} mb={2}>
          Дискография
        </Typography>
        {albumsLoading ? (
          <LoadingSpinner message="Загрузка дискографии..." />
        ) : albumsData?.albums?.length ? (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(auto-fill, minmax(120px, 1fr))', sm: 'repeat(auto-fill, minmax(150px, 1fr))' },
              gap: 2,
            }}
          >
            {albumsData.albums.map((album) => (
              <Box
                key={album.mbid}
                onClick={() => navigate(`/album/${album.mbid}`)}
                sx={{
                  cursor: 'pointer',
                  '&:hover': { opacity: 0.8 },
                  transition: 'opacity 0.2s',
                }}
              >
                <ArtworkImage src={album.artworkUrl} size={150} borderRadius={1} />
                <Typography variant="body2" fontWeight={600} noWrap mt={1}>
                  {album.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {album.firstReleaseDate?.slice(0, 4)}
                  {album.type ? ` • ${album.type}` : ''}
                </Typography>
              </Box>
            ))}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
