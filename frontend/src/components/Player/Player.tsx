import { useEffect, useRef } from 'react';
import { Box, Typography, Alert, Link, IconButton, Tooltip, useMediaQuery, useTheme } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../../store/player.store';
import { useQueueStore } from '../../store/queue.store';
import { PlayerControls } from './PlayerControls';
import { PlayerProgressBar } from './PlayerProgress';
import { PlayerVolume } from './PlayerVolume';
import { ArtworkImage } from '../Common/ArtworkImage';
import { useRecordHistory, useIsLiked, useLikeTrack, useUnlikeTrack } from '../../api/hooks/useLibrary';
import { useAuthStore } from '../../store/auth.store';
import { Track } from '../../types';
import { api } from '../../api/client';
import { formatArtistNames, parseArtistNames, sanitizeTrackTitle } from '../../utils/trackText';

interface AlbumSearchItem {
  mbid: string;
  title: string;
  artist: string;
}

interface AlbumSearchResponse {
  albums: AlbumSearchItem[];
}

interface ArtistRecordingBrief {
  title: string;
  album: string | null;
  albumMbid: string | null;
}

interface ArtistRecordingsResponse {
  recordings: ArtistRecordingBrief[];
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[^\p{L}\d]/gu, '')
    .trim();
}

function likelySame(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [longer, shorter] = a.length >= b.length ? [a, b] : [b, a];
  if (shorter.length < 4) return false;
  return longer.includes(shorter) && shorter.length >= longer.length * 0.6;
}

function normalizeArtistName(artist: string): string {
  return artist
    .replace(/\s*-\s*topic$/i, '')
    .replace(/\s*vevo$/i, '')
    .replace(/\s*\(official.*?\)$/i, '')
    .trim();
}

function pickBestAlbumMbid(
  albums: AlbumSearchItem[],
  albumName: string,
  artistName: string,
): string | null {
  const nAlbum = norm(albumName);
  const nArtist = norm(artistName);

  let bestScore = -1;
  let bestMbid: string | null = null;

  for (const a of albums) {
    const aTitle = norm(a.title);
    const aArtist = norm(a.artist);

    if (!likelySame(aTitle, nAlbum)) continue;

    let score = 0;
    if (aTitle === nAlbum) score += 6;
    else score += 3;

    if (nArtist) {
      if (aArtist === nArtist) score += 4;
      else if (likelySame(aArtist, nArtist)) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMbid = a.mbid;
    }
  }

  return bestMbid;
}

export function Player() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const albumRouteCacheRef = useRef<Map<string, string>>(new Map());
  const navigate = useNavigate();
  const {
    setAudioEl,
    setCurrentTime,
    setDuration,
    setBuffered,
    setError,
    currentTime,
    duration,
    setVolume,
    volume,
    isPlaying,
    initAudioContext,
    error,
    play,
    togglePlay,
  } = usePlayerStore();

  const { currentTrack, nextTrack } = useQueueStore();
  const track = currentTrack();
  const displayTitle = track ? sanitizeTrackTitle(track.title, track.artist) : '';
  const displayArtists = track ? formatArtistNames(track.artist) : '';
  const { mutate: recordHistory } = useRecordHistory();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Register audio element
  useEffect(() => {
    if (audioRef.current) {
      setAudioEl(audioRef.current);
      audioRef.current.volume = volume;
    }
  }, []);

  // Handle audio events + stall recovery
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let stallTimer: ReturnType<typeof setTimeout> | null = null;

    const clearStallTimer = () => {
      if (stallTimer !== null) { clearTimeout(stallTimer); stallTimer = null; }
    };

    // When audio is waiting for data, start a recovery countdown
    let stallAttempts = 0;
    const onWaiting = () => {
      clearStallTimer();
      stallTimer = setTimeout(() => {
        // Still stuck - micro-seek to force the browser to re-issue the range request
        if (!audio.paused && !audio.ended && audio.readyState < 3) {
          stallAttempts++;
          if (stallAttempts <= 3) {
            const t = audio.currentTime;
            audio.currentTime = t + 0.001;
          } else {
            // After 3 micro-seeks, reload the source entirely
            stallAttempts = 0;
            const src = audio.src;
            audio.src = src;
            audio.currentTime = usePlayerStore.getState().currentTime;
            audio.play().catch(() => {});
          }
        }
      }, 3000);
    };

    const onPlaying = clearStallTimer;
    const onSeeked = clearStallTimer;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      clearStallTimer();
      // Record listen history
      if (track) {
        recordHistory({
          provider: track.provider,
          providerId: track.providerId,
          durationMs: Math.floor(audio.currentTime * 1000),
        });
      }
      // Auto-advance
      nextTrack();
      const next = useQueueStore.getState().currentTrack();
      if (next) play(next);
    };
    const onError = () => {
      clearStallTimer();
      const code = audio.error?.code;
      setError(
        code === 4
          ? 'Формат не поддерживается вашим браузером'
          : 'Поток недоступен — попробуйте открыть источник',
      );
    };
    const onProgress = () => {
      if (audio.buffered.length > 0) {
        setBuffered(audio.buffered.end(audio.buffered.length - 1));
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('progress', onProgress);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('seeked', onSeeked);

    return () => {
      clearStallTimer();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('progress', onProgress);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('seeked', onSeeked);
    };
  }, [track]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          usePlayerStore.getState().togglePlay();
          break;
        case 'ArrowRight':
          if (e.shiftKey) {
            const next = useQueueStore.getState();
            next.nextTrack();
            const t = next.currentTrack();
            if (t) play(t);
          } else {
            usePlayerStore.getState().seek(usePlayerStore.getState().currentTime + 5);
          }
          break;
        case 'ArrowLeft':
          usePlayerStore.getState().seek(
            Math.max(0, usePlayerStore.getState().currentTime - 5),
          );
          break;
        case 'ArrowUp':
          setVolume(Math.min(1, volume + 0.1));
          break;
        case 'ArrowDown':
          setVolume(Math.max(0, volume - 0.1));
          break;
        case 'KeyM':
          usePlayerStore.getState().toggleMute();
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [volume]);

  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const { data: likedData } = useIsLiked(
    track?.provider ?? '',
    track?.providerId ?? '',
  );
  const liked = likedData?.liked ?? false;
  const { mutate: likeTrack } = useLikeTrack();
  const { mutate: unlikeTrack } = useUnlikeTrack();

  const handleLike = () => {
    if (!track || !isLoggedIn) return;
    if (liked) {
      unlikeTrack({ provider: track.provider, providerId: track.providerId });
    } else {
      likeTrack({ provider: track.provider, providerId: track.providerId });
    }
  };

  const resolveTrackPath = async (current: Track): Promise<string> => {
    if (current.albumMbid) return `/album/${current.albumMbid}`;

    const fallback = `/track/${current.provider}/${current.providerId}`;
    let lookupTrack = current;

    // Search results may contain partial metadata (often no album). Fetch full track meta first.
    if (!lookupTrack.album) {
      try {
        const fullMeta = await api.get<Track>(`/tracks/${current.provider}/${current.providerId}`);
        lookupTrack = { ...current, ...fullMeta };
      } catch {
        // keep original partial track data
      }
    }

    const lookupArtist = normalizeArtistName(lookupTrack.artist);
    const key = `${lookupArtist}|${lookupTrack.title}|${lookupTrack.album ?? ''}`.toLowerCase();
    const cached = albumRouteCacheRef.current.get(key);
    if (cached) return cached;

    try {
      if (lookupTrack.album) {
        const albumQueries = [`${lookupArtist} ${lookupTrack.album}`, lookupTrack.album];
        for (const q of albumQueries) {
          const data = await api.get<AlbumSearchResponse>('/artists/search-albums', {
            q,
            page: 1,
            limit: 20,
          });
          const mbid = pickBestAlbumMbid(data.albums ?? [], lookupTrack.album, lookupArtist);
          if (mbid) {
            const albumPath = `/album/${mbid}`;
            albumRouteCacheRef.current.set(key, albumPath);
            return albumPath;
          }
        }
      }

      const nTitle = norm(lookupTrack.title);
      const nAlbum = lookupTrack.album ? norm(lookupTrack.album) : '';
      for (let page = 1; page <= 5; page += 1) {
        const recData = await api.get<ArtistRecordingsResponse>('/artists/recordings', {
          name: lookupArtist,
          page,
        });
        const recordings = recData.recordings ?? [];
        if (!recordings.length) break;

        const recMatch = recordings.find((r) => {
          if (!r.albumMbid) return false;
          const titleOk = likelySame(norm(r.title), nTitle);
          if (!titleOk) return false;
          if (!nAlbum || !r.album) return true;
          return likelySame(norm(r.album), nAlbum);
        });

        if (recMatch?.albumMbid) {
          const albumPath = `/album/${recMatch.albumMbid}`;
          albumRouteCacheRef.current.set(key, albumPath);
          return albumPath;
        }
      }
    } catch {
      // Fallback to track card if album lookup fails
    }

    albumRouteCacheRef.current.set(key, fallback);
    return fallback;
  };

  const openTrack = async () => {
    if (!track) return;
    const path = await resolveTrackPath(track);
    navigate(path);
  };

  const openTrackFromMobile = async () => {
    if (!track) return;
    if (!isPlaying) togglePlay();
    const path = await resolveTrackPath(track);
    navigate(path);
  };

  const providerUrl = track
    ? track.provider === 'youtube'
      ? `https://www.youtube.com/watch?v=${track.providerId}`
      : track.provider === 'archive'
        ? `https://archive.org/details/${track.providerId}`
        : `https://www.jamendo.com/track/${track.providerId}`
    : null;

  useEffect(() => {
    const defaultTitle = 'Open Music';
    if (track && isPlaying) {
      document.title = `${displayArtists} - ${displayTitle}`;
      return;
    }
    document.title = defaultTitle;
  }, [track, isPlaying, displayArtists, displayTitle]);

  // Media Session API: hardware media keys / headset controls
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    if (track) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: sanitizeTrackTitle(track.title, track.artist),
        artist: formatArtistNames(track.artist),
        album: track.album ?? '',
        artwork: track.artworkUrl
          ? [
              { src: track.artworkUrl, sizes: '96x96', type: 'image/jpeg' },
              { src: track.artworkUrl, sizes: '128x128', type: 'image/jpeg' },
              { src: track.artworkUrl, sizes: '192x192', type: 'image/jpeg' },
              { src: track.artworkUrl, sizes: '256x256', type: 'image/jpeg' },
              { src: track.artworkUrl, sizes: '384x384', type: 'image/jpeg' },
              { src: track.artworkUrl, sizes: '512x512', type: 'image/jpeg' },
            ]
          : [],
      });
    } else {
      navigator.mediaSession.metadata = null;
    }

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    const setHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Some browsers throw for unsupported actions
      }
    };

    setHandler('play', () => {
      const player = usePlayerStore.getState();
      const queuedTrack = useQueueStore.getState().currentTrack();
      if (player.isPlaying) return;
      if (player.audioEl?.src) player.play();
      else if (queuedTrack) player.play(queuedTrack);
    });

    setHandler('pause', () => {
      const player = usePlayerStore.getState();
      if (!player.isPlaying) return;
      player.pause();
    });

    setHandler('nexttrack', () => {
      const queue = useQueueStore.getState();
      queue.nextTrack();
      const next = queue.currentTrack();
      if (next) usePlayerStore.getState().play(next);
    });

    setHandler('previoustrack', () => {
      const player = usePlayerStore.getState();
      if (player.currentTime > 5) {
        player.seek(0);
        return;
      }
      const queue = useQueueStore.getState();
      queue.prevTrack();
      const prev = queue.currentTrack();
      if (prev) player.play(prev);
    });

    setHandler('seekbackward', (details) => {
      const player = usePlayerStore.getState();
      const offset = details?.seekOffset ?? 10;
      player.seek(Math.max(0, player.currentTime - offset));
    });

    setHandler('seekforward', (details) => {
      const player = usePlayerStore.getState();
      const offset = details?.seekOffset ?? 10;
      const target = player.currentTime + offset;
      const max = player.duration > 0 ? player.duration : target;
      player.seek(Math.min(max, target));
    });

    setHandler('seekto', (details) => {
      if (details?.seekTime === undefined) return;
      const player = usePlayerStore.getState();
      const max = player.duration > 0 ? player.duration : details.seekTime;
      player.seek(Math.max(0, Math.min(max, details.seekTime)));
    });

    return () => {
      setHandler('play', null);
      setHandler('pause', null);
      setHandler('nexttrack', null);
      setHandler('previoustrack', null);
      setHandler('seekbackward', null);
      setHandler('seekforward', null);
      setHandler('seekto', null);
    };
  }, [track, isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: duration > 0 ? duration : 0,
        position: Math.min(currentTime, duration || currentTime),
        playbackRate: 1,
      });
    } catch {
      // Ignore unsupported setPositionState implementations
    }
  }, [currentTime, duration]);

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: isMobile ? 'calc(52px + env(safe-area-inset-bottom, 0px))' : 0,
        left: 0,
        right: 0,
        zIndex: 1200,
        backgroundColor: 'rgba(10,10,10,0.97)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        height: track || error ? (isMobile ? 56 : 72) : 0,
        transition: 'height 0.3s',
        overflow: 'hidden',
      }}
    >
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        preload="auto"
        crossOrigin="anonymous"
        onPlay={() => {
          initAudioContext();
          usePlayerStore.setState({ isPlaying: true });
        }}
        onPause={() => usePlayerStore.setState({ isPlaying: false })}
      />

      {error && (
        <Alert
          severity="error"
          sx={{ borderRadius: 0, py: 0 }}
          action={
            providerUrl ? (
              <Link href={providerUrl} target="_blank" rel="noopener" color="inherit">
                Открыть источник
              </Link>
            ) : undefined
          }
        >
          {error}
        </Alert>
      )}

      {isMobile ? (
        /* Mobile: artwork + title/artist + play button */
        <Box
          sx={{
            height: 56,
            display: 'grid',
            gridTemplateColumns: '44px 1fr auto',
            alignItems: 'center',
            px: 1,
            gap: 1,
          }}
        >
          <Box sx={{ flexShrink: 0 }}>
            {track && <ArtworkImage src={track.artworkUrl} size={40} borderRadius={0.5} />}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            {track && (
              <>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  noWrap
                  onClick={openTrackFromMobile}
                  sx={{ fontSize: 13, cursor: 'pointer' }}
                >
                  {displayTitle}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  noWrap
                  onClick={openTrackFromMobile}
                  sx={{ fontSize: 11, cursor: 'pointer' }}
                >
                  {displayArtists}
                </Typography>
              </>
            )}
          </Box>
          <IconButton
            onClick={() => togglePlay()}
            sx={{
              backgroundColor: '#FFDB4D',
              color: '#000',
              width: 36,
              height: 36,
              '&:hover': { backgroundColor: '#FFE680' },
            }}
          >
            {isPlaying ? <PauseIcon sx={{ fontSize: 20 }} /> : <PlayArrowIcon sx={{ fontSize: 20 }} />}
          </IconButton>
        </Box>
      ) : (
        /* Desktop: progress bar on top, controls/info/actions below */
        <Box sx={{ height: 72, display: 'flex', flexDirection: 'column' }}>
          {/* Full-width progress bar */}
          <PlayerProgressBar />

          {/* Main row */}
          <Box
            sx={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              alignItems: 'center',
              px: 2,
              gap: 2,
            }}
          >
            {/* Left: Controls */}
            <PlayerControls />

            {/* Center: Track info */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, justifyContent: 'center' }}>
              {track && (
                <>
                  <ArtworkImage src={track.artworkUrl} size={48} borderRadius={0.5} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      noWrap
                      onClick={openTrack}
                      sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                    >
                      {displayTitle}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      noWrap
                      component="div"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        '& .artist-link:hover': { color: 'text.primary', textDecoration: 'underline' },
                      }}
                    >
                      {parseArtistNames(track.artist).map((name, idx, arr) => (
                        <span key={idx}>
                          <span
                            className="artist-link"
                            style={{ cursor: 'pointer' }}
                            onClick={() => navigate(`/artist/${encodeURIComponent(name)}`)}
                          >
                            {name}
                          </span>
                          {idx < arr.length - 1 && <span>{', '}</span>}
                        </span>
                      ))}
                    </Typography>
                  </Box>
                </>
              )}
            </Box>

            {/* Right: Like + Volume */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {isLoggedIn && track && (
                <Tooltip title={liked ? 'Убрать из любимых' : 'Добавить в любимые'}>
                  <IconButton
                    size="small"
                    onClick={handleLike}
                    sx={{ color: liked ? 'primary.main' : 'text.secondary' }}
                  >
                    {liked ? <FavoriteIcon fontSize="small" /> : <FavoriteBorderIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
              )}
              <PlayerVolume />
              {track && providerUrl && (
                <Tooltip title="Открыть источник">
                  <IconButton
                    size="small"
                    component="a"
                    href={providerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ color: 'text.secondary' }}
                  >
                    <MoreHorizIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}

