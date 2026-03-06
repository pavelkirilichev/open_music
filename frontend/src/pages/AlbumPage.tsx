import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Chip, IconButton, Tooltip } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import { useAlbumDetail, AlbumTrack, useArtistProviderTracks } from '../api/hooks/useArtist';
import { useSearch } from '../api/hooks/useSearch';
import { useLikedIds, useAddLibraryAlbum, useRemoveLibraryAlbum, useLibraryAlbums } from '../api/hooks/useLibrary';
import { TrackRow } from '../components/Track/TrackRow';
import { ArtworkImage } from '../components/Common/ArtworkImage';
import { LoadingSpinner } from '../components/Common/LoadingSpinner';
import { usePlayerStore } from '../store/player.store';
import { useQueueStore } from '../store/queue.store';
import { useAuthStore } from '../store/auth.store';
import { Track } from '../types';
import { canonicalizeArtistName, formatAlbumName } from '../utils/trackText';

/** Strip noise from titles for fuzzy matching. Supports Cyrillic and any Unicode. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[-–—]\s*(?:official|audio|video|hd|hq|lyrics?|mv|remaster\w*|live|remix).*/gi, '')
    .replace(/[^\p{L}\d]/gu, '') // keep any Unicode letter + digits, strip punctuation/spaces
    .trim();
}

function titleMatches(n: string, t: Track): boolean {
  const full = normalise(t.title);
  const afterDash = t.title.includes(' - ')
    ? normalise(t.title.split(' - ').slice(1).join(' - '))
    : null;
  for (const pn of [full, afterDash]) {
    if (!pn) continue;
    if (pn === n) return true;
    const [longer, shorter] = pn.length >= n.length ? [pn, n] : [n, pn];
    if (shorter.length >= longer.length * 0.75 && longer.startsWith(shorter)) return true;
  }
  return false;
}

function findMatch(mbTrack: AlbumTrack, providerTracks: Track[], albumArtist: string): Track | undefined {
  const n = normalise(mbTrack.title);
  if (!n) return undefined;
  const na = normalise(albumArtist);

  // First pass: require both artist AND title to match
  if (na) {
    for (const t of providerTracks) {
      const ta = normalise(t.artist);
      if ((ta.includes(na) || na.includes(ta)) && titleMatches(n, t)) return t;
    }
  }

  // Second pass: title only (artist field may be unreliable on some providers)
  for (const t of providerTracks) {
    if (titleMatches(n, t)) return t;
  }

  return undefined;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AlbumPage() {
  const { mbid = '' } = useParams<{ mbid: string }>();
  const albumArtworkUrl = `https://coverartarchive.org/release-group/${mbid}/front-500`;
  const navigate = useNavigate();
  const { data: album, isLoading } = useAlbumDetail(mbid);

  // Search providers by "artist album" to find streamable tracks for this album
  const albumQuery = album
    ? `${canonicalizeArtistName(album.artist)} ${formatAlbumName(album.title)}`
    : '';
  const { data: searchData } = useSearch(
    { q: albumQuery, provider: 'all', type: 'track', page: 1, limit: 50 },
    albumQuery.length > 0,
  );

  // Also search by just artist name to cover more tracks
  const artistQuery = album ? canonicalizeArtistName(album.artist) : '';
  const { data: providerData } = useArtistProviderTracks(artistQuery, mbid);
  const { data: artistData } = useSearch(
    { q: artistQuery, provider: 'all', type: 'track', page: 1, limit: 30 },
    artistQuery.length > 0,
  );

  // Merge provider-tracks (album-focused) + fallback search results
  const providerTracks: Track[] = (() => {
    const seen = new Set<string>();
    const merged: Track[] = [];
    for (const t of [
      ...(providerData?.tracks ?? []),
      ...(searchData?.tracks ?? []),
      ...(artistData?.tracks ?? []),
    ]) {
      const key = `${t.provider}:${t.providerId}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(t);
      }
    }
    return merged;
  })();

  // Build the playable queue (only MB tracks that have a provider match)
  const albumArtist = album ? canonicalizeArtistName(album.artist) : '';
  const playableQueue: Track[] = [];
  for (const mbTrack of album?.tracks ?? []) {
    const match = findMatch(mbTrack, providerTracks, albumArtist);
    if (match && !playableQueue.find((t) => t.providerId === match.providerId)) {
      playableQueue.push({
        ...match,
        albumMbid: mbid,
        album: album?.title ?? match.album,
        artworkUrl: albumArtworkUrl,
      });
    }
  }

  const { data: likedSet } = useLikedIds(playableQueue);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const { data: libraryAlbumsRaw } = useLibraryAlbums();
  const { mutate: addAlbum, isPending: isAddingAlbum } = useAddLibraryAlbum();
  const { mutate: removeAlbum, isPending: isRemovingAlbum } = useRemoveLibraryAlbum();
  const { play, pause, isPlaying } = usePlayerStore();
  const { setQueue, currentTrack } = useQueueStore();
  const currentQueueTrack = currentTrack();

  if (isLoading) return <LoadingSpinner message="Загрузка альбома..." />;
  if (!album) return null;

  const libraryAlbums =
    (libraryAlbumsRaw as Array<{ id: string; albumRef?: { mbid?: string } }> | undefined) ?? [];
  const savedAlbumEntry = libraryAlbums.find((entry) => entry.albumRef?.mbid === mbid);
  const isAlbumSaved = Boolean(savedAlbumEntry);
  const albumActionPending = isAddingAlbum || isRemovingAlbum;

  const handlePlayAll = () => {
    if (!playableQueue.length) return;
    setQueue(playableQueue, 0);
    play(playableQueue[0]);
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
      firstReleaseDate: /^\d{4}$/.test(album.year) ? `${album.year}-01-01` : album.year,
      type: album.type || 'album',
    });
  };

  const isAlbumPlaying =
    isPlaying &&
    playableQueue.some(
      (t) =>
        t.provider === currentQueueTrack?.provider &&
        t.providerId === currentQueueTrack?.providerId,
    );

  return (
    <Box>
      {/* Hero */}
      <Box
        sx={{
          display: 'flex',
          gap: 3,
          mb: 4,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <ArtworkImage
          src={albumArtworkUrl}
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
            {album.year}
            {playableQueue.length > 0 &&
              ` • ${playableQueue.length} из ${album.tracks.length} доступно`}
          </Typography>
          <Box mt={2} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Tooltip title={isAlbumPlaying ? 'Пауза' : 'Слушать альбом'}>
              <IconButton
                onClick={() => {
                  if (isAlbumPlaying) pause();
                  else handlePlayAll();
                }}
                disabled={!playableQueue.length}
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
            {isLoggedIn && (
              <Tooltip title={isAlbumSaved ? 'Убрать из библиотеки' : 'Добавить в библиотеку'}>
                <span>
                  <IconButton
                    onClick={handleToggleAlbumLike}
                    disabled={albumActionPending}
                    sx={{
                      width: 40,
                      height: 40,
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: isAlbumSaved ? 'primary.main' : 'text.secondary',
                      '&:hover': {
                        borderColor: 'rgba(255,255,255,0.35)',
                        backgroundColor: 'rgba(255,255,255,0.06)',
                      },
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

      {/* Integrated tracklist */}
      <Box>
        {/* Header row */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '40px 48px 1fr 80px 40px',
            px: 2,
            py: 0.5,
            mb: 0.5,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <Typography variant="caption" color="text.secondary" textAlign="center">#</Typography>
          <Box />
          <Typography variant="caption" color="text.secondary">Название</Typography>
          <Typography variant="caption" color="text.secondary" textAlign="right">Длит.</Typography>
          <Box />
        </Box>

        {album.tracks.map((mbTrack) => {
          const providerTrack = findMatch(mbTrack, providerTracks, albumArtist);
          const enrichedTrack = providerTrack
            ? playableQueue.find(
                (t) =>
                  t.provider === providerTrack.provider &&
                  t.providerId === providerTrack.providerId,
              ) ?? providerTrack
            : undefined;

          if (providerTrack && enrichedTrack) {
            const albumStyledTrack: Track = {
              ...enrichedTrack,
              album: formatAlbumName(album.title),
              albumMbid: mbid,
              artworkUrl: albumArtworkUrl,
            };

            // Playable - render as full TrackRow but with MB position number
            return (
              <Box key={mbTrack.mbid} sx={{ position: 'relative' }}>
                {/* Position number overlay */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 40,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                />
                <TrackRow
                  key={`${albumStyledTrack.provider}:${albumStyledTrack.providerId}`}
                  track={albumStyledTrack}
                  index={mbTrack.position - 1}
                  showIndex
                  queue={playableQueue}
                  likedSet={likedSet}
                  hideSecondaryText
                  appendFeatToTitle
                  primaryArtistName={canonicalizeArtistName(album.artist)}
                  linkTitleToTrack
                />
              </Box>
            );
          }

          // Not yet available from any provider - show as static row
          return (
            <Box
              key={mbTrack.mbid}
              sx={{
                display: 'grid',
                gridTemplateColumns: '40px 48px 1fr 80px 40px',
                alignItems: 'center',
                gap: 1,
                px: 2,
                py: 0.75,
                borderRadius: 1,
                opacity: 0.38,
              }}
            >
              <Typography
                variant="body2"
                color="text.secondary"
                textAlign="center"
                sx={{ fontSize: 12 }}
              >
                {mbTrack.position}
              </Typography>
              <Box sx={{ width: 40, height: 40 }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" noWrap>
                  {mbTrack.title}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" textAlign="right">
                {formatDuration(mbTrack.duration)}
              </Typography>
              <MusicNoteIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
