import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Chip, IconButton, Tooltip, Skeleton } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import { useAlbumDetail } from '../api/hooks/useArtist';
import { useAddLibraryAlbum, useRemoveLibraryAlbum, useLibraryAlbums } from '../api/hooks/useLibrary';
import { TrackRow } from '../components/Track/TrackRow';
import { ArtworkImage } from '../components/Common/ArtworkImage';
import { LoadingSpinner } from '../components/Common/LoadingSpinner';
import { usePlayerStore } from '../store/player.store';
import { useQueueStore } from '../store/queue.store';
import { useAuthStore } from '../store/auth.store';
import { Track } from '../types';
import { canonicalizeArtistName, formatAlbumName } from '../utils/trackText';
import { resolveTrackForPlayback } from '../utils/resolveTrack';

export function AlbumPage() {
  const { mbid = '' } = useParams<{ mbid: string }>();
  const navigate = useNavigate();
  const { data: album, isLoading } = useAlbumDetail(mbid);

  const albumArtworkUrl =
    album?.artworkUrl ??
    album?.artworkUrlRelease ??
    `https://coverartarchive.org/release-group/${mbid}/front-500`;

  // Build queue directly from MB tracklist — instant, no YouTube lookup at render time
  const albumArtist = album ? canonicalizeArtistName(album.artist) : '';
  const mbQueue: Track[] = (album?.tracks ?? []).map((mbTrack) => ({
    id: `musicbrainz:${mbTrack.mbid}`,
    provider: 'musicbrainz' as const,
    providerId: mbTrack.mbid,
    title: mbTrack.title,
    artist: albumArtist,
    album: album?.title ?? '',
    albumMbid: mbid,
    duration: mbTrack.duration ?? undefined,
    artworkUrl: albumArtworkUrl,
  }));

  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const { data: libraryAlbumsRaw } = useLibraryAlbums();
  const { mutate: addAlbum, isPending: isAddingAlbum } = useAddLibraryAlbum();
  const { mutate: removeAlbum, isPending: isRemovingAlbum } = useRemoveLibraryAlbum();
  const { play, pause, isPlaying } = usePlayerStore();
  const { setQueue, toggleShuffle, currentTrack } = useQueueStore();
  const currentQueueTrack = currentTrack();

  if (isLoading) return <LoadingSpinner message="Загрузка альбома..." />;
  if (!album) return null;

  const libraryAlbums =
    (libraryAlbumsRaw as Array<{ id: string; albumRef?: { mbid?: string } }> | undefined) ?? [];
  const savedAlbumEntry = libraryAlbums.find((entry) => entry.albumRef?.mbid === mbid);
  const isAlbumSaved = Boolean(savedAlbumEntry);
  const albumActionPending = isAddingAlbum || isRemovingAlbum;

  // Album is "playing" if current track belongs to this album
  const isAlbumPlaying = isPlaying && currentQueueTrack?.albumMbid === mbid;

  const handlePlayAll = async () => {
    if (!mbQueue.length) return;
    setQueue(mbQueue, 0);
    const resolved = await resolveTrackForPlayback(mbQueue[0]);
    if (resolved) play(resolved);
  };

  const handleShuffle = async () => {
    if (!mbQueue.length) return;
    toggleShuffle();
    const idx = Math.floor(Math.random() * mbQueue.length);
    setQueue(mbQueue, idx);
    const resolved = await resolveTrackForPlayback(mbQueue[idx]);
    if (resolved) play(resolved);
  };

  const handleAlbumPlayPause = () => {
    if (isAlbumPlaying) { pause(); return; }
    handlePlayAll();
  };

  const handleToggleAlbumLike = () => {
    if (!isLoggedIn) return;
    if (savedAlbumEntry) {
      removeAlbum(savedAlbumEntry.id);
      return;
    }
    addAlbum({
      mbid,
      title: formatAlbumName(album.title),
      artist: canonicalizeArtistName(album.artist),
      artworkUrl: albumArtworkUrl,
      firstReleaseDate: /^\d{4}$/.test(String(album.year)) ? `${album.year}-01-01` : String(album.year ?? ''),
      type: album.type || 'album',
    });
  };

  return (
    <Box>
      {/* Hero */}
      <Box sx={{ display: 'flex', gap: 3, mb: 4, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <ArtworkImage
          src={albumArtworkUrl}
          fallbackSrc={album.artworkUrlRelease}
          size={200}
          borderRadius={1}
        />
        <Box>
          <Chip label={album.type || 'Альбом'} size="small" variant="outlined" sx={{ mb: 1 }} />
          <Typography variant="h4" fontWeight={700}>
            {formatAlbumName(album.title)}
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            mt={0.5}
            sx={{ cursor: 'pointer', '&:hover': { color: 'text.primary' } }}
            onClick={() => navigate(`/artist/${encodeURIComponent(canonicalizeArtistName(album.artist))}`)}
          >
            {canonicalizeArtistName(album.artist)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {album.year} • {album.tracks.length} треков
          </Typography>
          <Box mt={2} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Tooltip title={isAlbumPlaying ? 'Пауза' : 'Слушать альбом'}>
              <IconButton
                onClick={handleAlbumPlayPause}
                disabled={!mbQueue.length}
                sx={{
                  backgroundColor: 'primary.main',
                  color: '#000',
                  width: 48,
                  height: 48,
                  '&:hover': { backgroundColor: '#FFE680' },
                  '&:disabled': { backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' },
                }}
              >
                {isAlbumPlaying ? <PauseIcon /> : <PlayArrowIcon />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Перемешать">
              <IconButton
                onClick={handleShuffle}
                disabled={!mbQueue.length}
                sx={{
                  width: 40, height: 40,
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: 'text.secondary',
                  '&:hover': { borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.06)' },
                  '&:disabled': { opacity: 0.3 },
                }}
              >
                <ShuffleIcon />
              </IconButton>
            </Tooltip>
            {isLoggedIn && (
              <Tooltip title={isAlbumSaved ? 'Убрать из библиотеки' : 'Добавить в библиотеку'}>
                <span>
                  <IconButton
                    onClick={handleToggleAlbumLike}
                    disabled={albumActionPending}
                    sx={{
                      width: 40, height: 40,
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: isAlbumSaved ? 'primary.main' : 'text.secondary',
                      '&:hover': { borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.06)' },
                    }}
                  >
                    {isAlbumSaved ? <FavoriteIcon /> : <FavoriteBorderIcon />}
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </Box>
        </Box>
      </Box>

      {/* Tracklist */}
      <Box>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '40px 48px 1fr 80px 40px',
            px: 2, py: 0.5, mb: 0.5,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <Typography variant="caption" color="text.secondary" textAlign="center">#</Typography>
          <Box />
          <Typography variant="caption" color="text.secondary">Название</Typography>
          <Typography variant="caption" color="text.secondary" textAlign="right">Длит.</Typography>
          <Box />
        </Box>

        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Box
              key={i}
              sx={{ display: 'grid', gridTemplateColumns: '40px 48px 1fr 80px 40px', px: 2, py: 0.75, gap: 1, alignItems: 'center' }}
            >
              <Skeleton width={20} height={20} sx={{ bgcolor: 'rgba(255,255,255,0.06)' }} />
              <Skeleton variant="rectangular" width={40} height={40} sx={{ borderRadius: 0.5, bgcolor: 'rgba(255,255,255,0.06)' }} />
              <Box>
                <Skeleton width="60%" height={16} sx={{ bgcolor: 'rgba(255,255,255,0.06)' }} />
              </Box>
              <Skeleton width={40} height={14} sx={{ ml: 'auto', bgcolor: 'rgba(255,255,255,0.06)' }} />
              <Box />
            </Box>
          ))
        ) : (
          mbQueue.map((track, i) => (
            <TrackRow
              key={track.providerId}
              track={track}
              index={i}
              showIndex
              queue={mbQueue}
              likedSet={new Set()}
              hideSecondaryText
              appendFeatToTitle
              primaryArtistName={albumArtist}
              linkTitleToTrack={false}
            />
          ))
        )}
      </Box>
    </Box>
  );
}
