import { useEffect, useRef } from 'react';
import { Box, Typography, Alert, Link, IconButton, Tooltip, useMediaQuery, useTheme } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import { usePlayerStore } from '../../store/player.store';
import { useQueueStore } from '../../store/queue.store';
import { PlayerControls } from './PlayerControls';
import { PlayerProgressBar } from './PlayerProgress';
import { PlayerVolume } from './PlayerVolume';
import { ArtworkImage } from '../Common/ArtworkImage';
import { useRecordHistory, useIsLiked, useLikeTrack, useUnlikeTrack } from '../../api/hooks/useLibrary';
import { useAuthStore } from '../../store/auth.store';

export function Player() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const {
    setAudioEl,
    setCurrentTime,
    setDuration,
    setBuffered,
    setError,
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
        // Still stuck — micro-seek to force the browser to re-issue the range request
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
          ? 'Format not supported by your browser'
          : 'Stream unavailable — try opening the source link',
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

  const providerUrl = track
    ? track.provider === 'youtube'
      ? `https://www.youtube.com/watch?v=${track.providerId}`
      : track.provider === 'archive'
        ? `https://archive.org/details/${track.providerId}`
        : `https://www.jamendo.com/track/${track.providerId}`
    : null;

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
                Open source
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
                <Typography variant="body2" fontWeight={600} noWrap sx={{ fontSize: 13 }}>
                  {track.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 11 }}>
                  {track.artist}
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
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {track.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {track.artist}
                    </Typography>
                  </Box>
                </>
              )}
            </Box>

            {/* Right: Like + Volume */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {isLoggedIn && track && (
                <Tooltip title={liked ? 'Убрать из любимых' : 'В любимые'}>
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
