import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Box, Typography, Button, Chip, Skeleton, CircularProgress } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { ArtworkImage } from '../components/Common/ArtworkImage';
import { usePlayerStore } from '../store/player.store';
import { useQueueStore } from '../store/queue.store';
import { useIsLiked, useLikeTrack, useUnlikeTrack } from '../api/hooks/useLibrary';
import { useAuthStore } from '../store/auth.store';
import { api } from '../api/client';
import { Track } from '../types';
import { formatAlbumName, formatArtistNames, parseArtistNames, sanitizeTrackTitle } from '../utils/trackText';

const PROVIDER_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  archive: 'Интернет-архив',
  jamendo: 'Jamendo',
  soundcloud: 'SoundCloud',
};

interface GeniusTrackPayload {
  source: 'genius';
  track: {
    id: number;
    title: string;
    artist: string;
    url: string;
    artworkUrl: string | null;
    lyrics: string | null;
  } | null;
}

function formatDuration(s?: number) {
  if (!s) return '--:--';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function TrackDetailPage() {
  const { provider = '', id = '' } = useParams<{ provider: string; id: string }>();
  const navigate = useNavigate();

  const [track, setTrack] = useState<Track | null>(null);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [lyricsSource, setLyricsSource] = useState<'genius' | 'lyricsovh' | null>(null);
  const [geniusTrack, setGeniusTrack] = useState<GeniusTrackPayload['track']>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const { play, pause, isPlaying } = usePlayerStore();
  const { setQueue, currentTrack } = useQueueStore();
  const isCurrentTrack = currentTrack()?.provider === provider && currentTrack()?.providerId === id;
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const { data: likedData } = useIsLiked(provider, id);
  const liked = likedData?.liked ?? false;
  const { mutate: likeTrack } = useLikeTrack();
  const { mutate: unlikeTrack } = useUnlikeTrack();
  const displayTitle = track ? sanitizeTrackTitle(track.title, track.artist) : '';
  const displayArtists = track ? formatArtistNames(track.artist) : '';
  const primaryArtist = track ? parseArtistNames(track.artist)[0] ?? track.artist : '';
  const displayAlbum = track ? formatAlbumName(track.album) : '';

  useEffect(() => {
    setLoading(true);
    setTrack(null);
    api.get<Track>(`/tracks/${provider}/${id}`)
      .then((data) => setTrack(data))
      .catch(() => setTrack(null))
      .finally(() => setLoading(false));
  }, [provider, id]);

  useEffect(() => {
    if (!track) return;
    let cancelled = false;

    const loadLyrics = async () => {
      setLyricsLoading(true);
      setLyrics(null);
      setLyricsSource(null);
      setGeniusTrack(null);

      try {
        try {
          const genius = await api.get<GeniusTrackPayload>('/tracks/genius', {
            artist: primaryArtist || track.artist,
            title: displayTitle || track.title,
          });
          if (cancelled) return;

          setGeniusTrack(genius.track);
          if (genius.track?.lyrics) {
            setLyrics(genius.track.lyrics);
            setLyricsSource('genius');
            return;
          }
        } catch {
          if (!cancelled) setGeniusTrack(null);
        }

        try {
          const response = await fetch(
            `https://api.lyrics.ovh/v1/${encodeURIComponent(primaryArtist || track.artist)}/${encodeURIComponent(displayTitle || track.title)}`,
          );
          const data = (await response.json()) as { lyrics?: string };
          if (cancelled) return;
          setLyrics(data.lyrics ?? null);
          setLyricsSource(data.lyrics ? 'lyricsovh' : null);
        } catch {
          if (!cancelled) {
            setLyrics(null);
            setLyricsSource(null);
          }
        }
      } finally {
        if (!cancelled) setLyricsLoading(false);
      }
    };

    void loadLyrics();
    return () => {
      cancelled = true;
    };
  }, [track?.artist, track?.title, primaryArtist, displayTitle]);

  const handlePlay = () => {
    if (!track) return;
    if (isCurrentTrack) {
      if (isPlaying) pause(); else play();
    } else {
      setQueue([track], 0);
      play(track);
    }
  };

  const providerUrl =
    provider === 'youtube' ? `https://www.youtube.com/watch?v=${id}` :
    provider === 'archive' ? `https://archive.org/details/${id}` :
    provider === 'soundcloud' ? `https://soundcloud.com/tracks/${id}` :
    `https://www.jamendo.com/track/${id}`;

  if (loading) return (
    <Box sx={{ pt: 2 }}>
      <Skeleton height={40} width={100} sx={{ mb: 2 }} />
      <Box sx={{ display: 'flex', gap: 3, mb: 4 }}>
        <Skeleton variant="rectangular" width={240} height={240} sx={{ borderRadius: 3, flexShrink: 0 }} />
        <Box sx={{ flex: 1 }}>
          <Skeleton height={40} width="80%" sx={{ mb: 1 }} />
          <Skeleton height={28} width="50%" sx={{ mb: 2 }} />
          <Skeleton height={48} width={160} />
        </Box>
      </Box>
    </Box>
  );

  if (!track) return (
    <Box textAlign="center" py={8}>
      <Typography color="text.secondary" mb={2}>Трек не найден</Typography>
      <Button onClick={() => navigate(-1)}>Назад</Button>
    </Box>
  );

  return (
    <Box>
      <Box sx={{ pt: 2, pb: 1 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} size="small" sx={{ color: 'text.secondary' }}>
          Назад
        </Button>
      </Box>

      <Box sx={{ display: 'flex', gap: { xs: 2, md: 4 }, alignItems: 'flex-start', flexDirection: { xs: 'column', sm: 'row' }, py: 3 }}>
        <Box sx={{ flexShrink: 0 }}>
          <Box sx={{ borderRadius: 3, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <ArtworkImage src={track.artworkUrl} size={240} borderRadius={0} />
          </Box>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Chip
            label={PROVIDER_LABELS[track.provider] ?? track.provider}
            size="small"
            variant="outlined"
            sx={{ mb: 1.5, fontSize: 11 }}
            component="a"
            href={providerUrl}
            target="_blank"
            rel="noopener noreferrer"
            clickable
          />

          <Typography variant="h4" fontWeight={800} sx={{ mb: 0.5, lineHeight: 1.2, wordBreak: 'break-word' }}>
            {displayTitle}
          </Typography>

          <Typography
            variant="h6"
            color="text.secondary"
            fontWeight={400}
            component={Link}
            to={`/artist/${encodeURIComponent(primaryArtist)}`}
            sx={{ mb: 1, display: 'block', textDecoration: 'none', '&:hover': { color: 'primary.main' } }}
          >
            {displayArtists}
          </Typography>

          {(track.album || track.year) && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {[displayAlbum, track.year].filter(Boolean).join(' • ')}
            </Typography>
          )}

          {track.duration && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
              {formatDuration(track.duration)}
            </Typography>
          )}

          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button variant="contained" size="large" onClick={handlePlay}
              startIcon={isCurrentTrack && isPlaying ? <PauseIcon /> : <PlayArrowIcon />}>
              {isCurrentTrack && isPlaying ? 'Пауза' : 'Слушать'}
            </Button>

            {isLoggedIn && (
              <Button variant="outlined" onClick={() => {
                if (liked) unlikeTrack({ provider, providerId: id });
                else likeTrack({ provider, providerId: id });
              }}
                startIcon={liked ? <FavoriteIcon /> : <FavoriteBorderIcon />}
                sx={{ borderColor: liked ? 'primary.main' : undefined, color: liked ? 'primary.main' : undefined }}>
                {liked ? 'Сохранено' : 'Сохранить'}
              </Button>
            )}
          </Box>
        </Box>
      </Box>

      <Box sx={{ mt: 4, maxWidth: 700 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
          <Typography variant="h6" fontWeight={700}>Текст песни</Typography>
          {lyricsSource === 'genius' && (
            <Chip label="Genius" size="small" color="primary" />
          )}
          {geniusTrack?.url && (
            <Button
              component="a"
              href={geniusTrack.url}
              target="_blank"
              rel="noopener noreferrer"
              size="small"
              variant="text"
              sx={{ minWidth: 'auto', px: 0.5 }}
            >
              Открыть на Genius
            </Button>
          )}
        </Box>
        {lyricsLoading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <CircularProgress size={16} sx={{ color: 'text.secondary' }} />
            <Typography variant="body2" color="text.secondary">Загрузка текста...</Typography>
          </Box>
        ) : lyrics ? (
          <Box sx={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 2, p: 3, border: '1px solid rgba(255,255,255,0.06)' }}>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-line', lineHeight: 2, color: 'text.secondary' }}>
              {lyrics}
            </Typography>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">Текст песни не найден</Typography>
        )}
      </Box>
    </Box>
  );
}
