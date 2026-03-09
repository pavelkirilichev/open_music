import { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import QueueMusicIcon from '@mui/icons-material/QueueMusic';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useNavigate } from 'react-router-dom';
import { Track } from '../../types';
import { ArtworkImage } from '../Common/ArtworkImage';
import { usePlayerStore } from '../../store/player.store';
import { useQueueStore } from '../../store/queue.store';
import { useLikeTrack, useUnlikeTrack } from '../../api/hooks/useLibrary';
import { useAuthStore } from '../../store/auth.store';
import { api } from '../../api/client';
import { formatAlbumName, formatArtistNames, parseArtistNames, sanitizeTrackTitle, withFeaturedInTitle } from '../../utils/trackText';
import { AddToPlaylistButton } from './AddToPlaylistButton';
import { resolveTrackForPlayback } from '../../utils/resolveTrack';

interface TrackRowProps {
  track: Track;
  index?: number;
  showIndex?: boolean;
  queue?: Track[];
  likedSet?: Set<string>; // "provider:providerId" passed from parent, no N+1
  hideSecondaryText?: boolean;
  showAlbumRight?: boolean;
  appendFeatToTitle?: boolean;
  primaryArtistName?: string;
  linkTitleToTrack?: boolean;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TrackRow({
  track,
  index,
  showIndex,
  queue,
  likedSet,
  hideSecondaryText = false,
  showAlbumRight = false,
  appendFeatToTitle = false,
  primaryArtistName,
  linkTitleToTrack = false,
}: TrackRowProps) {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [hovered, setHovered] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const { play, pause, isPlaying } = usePlayerStore();
  const { setQueue, currentTrack } = useQueueStore();
  const currentQueueTrack = currentTrack();
  // Match by provider+id OR by mbid (after resolution, resolved track has mbid = original MB recording id)
  const isCurrentTrack =
    (currentQueueTrack?.provider === track.provider && currentQueueTrack?.providerId === track.providerId) ||
    (track.provider === 'musicbrainz' && currentQueueTrack?.mbid === track.providerId);
  const displayTitle = appendFeatToTitle
    ? withFeaturedInTitle(track.title, track.artist, primaryArtistName)
    : sanitizeTrackTitle(track.title, track.artist);

  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  // O(1) lookup from parent-provided Set, zero extra requests
  const liked = likedSet?.has(`${track.provider}:${track.providerId}`) ?? false;

  const { mutate: likeTrack } = useLikeTrack();
  const { mutate: unlikeTrack } = useUnlikeTrack();

  const handlePlay = async () => {
    if (isCurrentTrack) {
      if (isPlaying) pause();
      else play();
      return;
    }
    const tracks = queue ?? [track];
    const idx = queue ? queue.findIndex((t) => t.providerId === track.providerId) : 0;
    setQueue(tracks, idx >= 0 ? idx : 0);

    if (track.provider === 'musicbrainz') {
      setIsResolving(true);
      try {
        const resolved = await resolveTrackForPlayback(track);
        if (resolved) play(resolved);
      } finally {
        setIsResolving(false);
      }
    } else {
      play(track);
    }
  };

  const handleLike = () => {
    if (!isLoggedIn || track.provider === 'musicbrainz') return;
    if (liked) {
      unlikeTrack({ provider: track.provider, providerId: track.providerId });
    } else {
      likeTrack({
        provider: track.provider,
        providerId: track.providerId,
        title: track.title,
        artist: track.artist,
        album: track.album ?? undefined,
        artworkUrl: track.artworkUrl ?? undefined,
        duration: track.duration ?? undefined,
      });
    }
  };

  const handleOpenTrack = (e: React.MouseEvent<HTMLElement>) => {
    if (!linkTitleToTrack) return;
    e.stopPropagation();
    navigate(`/track/${track.provider}/${track.providerId}`);
  };

  const handleCache = async () => {
    try {
      await api.post(`/tracks/${track.provider}/${track.providerId}/cache`);
      setMenuAnchor(null);
    } catch { /* noop */ }
  };

  const providerUrl =
    track.provider === 'youtube'
      ? `https://www.youtube.com/watch?v=${track.providerId}`
      : track.provider === 'archive'
        ? `https://archive.org/details/${track.providerId}`
        : track.provider === 'jamendo'
          ? `https://www.jamendo.com/track/${track.providerId}`
          : null;

  // Mobile: simplified 3-column layout (artwork + info, duration, menu)
  if (isMobile) {
    return (
      <Box
        onClick={handlePlay}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 1,
          py: 0.75,
          borderRadius: 1,
          cursor: 'pointer',
          backgroundColor: isCurrentTrack ? 'rgba(255,219,77,0.08)' : 'transparent',
          '&:active': { backgroundColor: 'rgba(255,255,255,0.05)' },
        }}
      >
        {/* Artwork */}
        <Box sx={{ position: 'relative', flexShrink: 0 }}>
          <ArtworkImage src={track.artworkUrl} size={44} borderRadius={0.5} />
          {(isCurrentTrack || isResolving) && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 0.5,
              }}
            >
              {isResolving ? (
                <CircularProgress size={16} sx={{ color: 'white' }} />
              ) : isPlaying ? (
                <PauseIcon sx={{ color: 'white', fontSize: 20 }} />
              ) : (
                <PlayArrowIcon sx={{ color: 'white', fontSize: 20 }} />
              )}
            </Box>
          )}
        </Box>

        {/* Title + Artist */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            fontWeight={isCurrentTrack ? 600 : 400}
            color={isCurrentTrack ? 'primary.main' : 'text.primary'}
            noWrap
            onClick={linkTitleToTrack ? handleOpenTrack : undefined}
            sx={{
              fontSize: 13,
              cursor: linkTitleToTrack ? 'pointer' : 'default',
              '&:hover': linkTitleToTrack ? { color: 'primary.main' } : undefined,
            }}
          >
            {displayTitle}
          </Typography>
          {!hideSecondaryText && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 11 }}>
              {formatArtistNames(track.artist)}
              {track.duration ? ` - ${formatDuration(track.duration)}` : ''}
            </Typography>
          )}
        </Box>

        {/* Actions */}
        {isLoggedIn && (
          <AddToPlaylistButton track={track} size="small" sx={{ color: 'text.secondary', flexShrink: 0 }} />
        )}
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); setMenuAnchor(e.currentTarget); }}
          sx={{ color: 'text.secondary', flexShrink: 0 }}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>

        {/* Context menu */}
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
          slotProps={{ paper: { sx: { backgroundColor: '#282828', minWidth: 200 } } }}
        >
          {isLoggedIn && (
            <MenuItem onClick={(e) => { e.stopPropagation(); handleLike(); setMenuAnchor(null); }}>
              <ListItemIcon>
                {liked ? <FavoriteIcon fontSize="small" color="primary" /> : <FavoriteBorderIcon fontSize="small" />}
              </ListItemIcon>
              <ListItemText>{liked ? 'Убрать из любимых' : 'Добавить в любимые'}</ListItemText>
            </MenuItem>
          )}
          <MenuItem onClick={(e) => { e.stopPropagation(); useQueueStore.getState().addNext(track); setMenuAnchor(null); }}>
            <ListItemIcon><PlaylistAddIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Слушать следующим</ListItemText>
          </MenuItem>
          <MenuItem onClick={(e) => { e.stopPropagation(); useQueueStore.getState().addToQueue(track); setMenuAnchor(null); }}>
            <ListItemIcon><QueueMusicIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Добавить в очередь</ListItemText>
          </MenuItem>
          {isLoggedIn && (
            <MenuItem onClick={(e) => { e.stopPropagation(); handleCache(); }}>
              <ListItemIcon><CloudDownloadIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Сохранить для офлайна</ListItemText>
            </MenuItem>
          )}
          {providerUrl && (
            <MenuItem
              component="a"
              href={providerUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Открыть источник</ListItemText>
            </MenuItem>
          )}
        </Menu>
      </Box>
    );
  }

  // Desktop: full grid layout
  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        display: 'grid',
        gridTemplateColumns: showAlbumRight
          ? (showIndex ? '40px 48px 1fr minmax(120px, 0.55fr) 72px 80px' : '48px 1fr minmax(120px, 0.55fr) 72px 80px')
          : (showIndex ? '40px 48px 1fr 80px 80px' : '48px 1fr 80px 80px'),
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 0.75,
        borderRadius: 1,
        cursor: 'pointer',
        backgroundColor: isCurrentTrack ? 'rgba(255,219,77,0.08)' : 'transparent',
        '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)' },
        transition: 'background-color 0.1s',
      }}
    >
      {/* Index / Play indicator */}
      {showIndex && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isResolving ? (
            <CircularProgress size={16} sx={{ color: 'text.secondary' }} />
          ) : hovered || isCurrentTrack ? (
            <IconButton size="small" onClick={handlePlay} sx={{ p: 0.5, color: 'white' }}>
              {isCurrentTrack && isPlaying ? (
                <PauseIcon fontSize="small" />
              ) : (
                <PlayArrowIcon fontSize="small" />
              )}
            </IconButton>
          ) : (
            <Typography variant="body2" color={isCurrentTrack ? 'primary' : 'text.secondary'}>
              {index !== undefined ? index + 1 : ''}
            </Typography>
          )}
        </Box>
      )}

      {/* Artwork + Play */}
      <Box sx={{ position: 'relative', cursor: 'pointer' }} onClick={handlePlay}>
        <ArtworkImage src={track.artworkUrl} size={40} borderRadius={0.5} />
        {!showIndex && (hovered || isCurrentTrack) && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 0.5,
            }}
          >
            {isCurrentTrack && isPlaying ? (
              <PauseIcon sx={{ color: 'white', fontSize: 20 }} />
            ) : (
              <PlayArrowIcon sx={{ color: 'white', fontSize: 20 }} />
            )}
          </Box>
        )}
      </Box>

      {/* Title + Artist */}
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="body2"
          fontWeight={isCurrentTrack ? 600 : 400}
          color={isCurrentTrack ? 'primary.main' : 'text.primary'}
          noWrap
          onClick={linkTitleToTrack ? handleOpenTrack : undefined}
          sx={{
            cursor: linkTitleToTrack ? 'pointer' : 'default',
            '&:hover': linkTitleToTrack ? { color: 'primary.main' } : undefined,
          }}
        >
          {displayTitle}
        </Typography>
        {!hideSecondaryText && (
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              '& .artist-link:hover': { color: 'primary.main' },
            }}
          >
            {parseArtistNames(track.artist).map((name, idx, arr) => (
              <span key={idx}>
                <span
                  onClick={(e) => { e.stopPropagation(); navigate(`/artist/${encodeURIComponent(name)}`); }}
                  style={{ cursor: 'pointer' }}
                  className="artist-link"
                >
                  {name}
                </span>
                {idx < arr.length - 1 && <span>{', '}</span>}
              </span>
            ))}
          </Typography>
        )}
      </Box>

      {showAlbumRight && (
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          textAlign="right"
          sx={{ minWidth: 0, pr: 1 }}
        >
          {formatAlbumName(track.album) || '-'}
        </Typography>
      )}

      {/* Duration */}
      <Typography variant="caption" color="text.secondary" textAlign="right" sx={{ minWidth: 40 }}>
        {formatDuration(track.duration)}
      </Typography>

      {/* Actions */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        {isLoggedIn && (
          <Tooltip title={liked ? 'Убрать из любимых' : 'Добавить в любимые'}>
            <IconButton
              size="small"
              onClick={handleLike}
              sx={{
                opacity: hovered || liked ? 1 : 0,
                color: liked ? 'primary.main' : 'text.secondary',
                transition: 'opacity 0.2s',
              }}
            >
              {liked ? <FavoriteIcon fontSize="small" /> : <FavoriteBorderIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
        {isLoggedIn && (
          <AddToPlaylistButton
            track={track}
            size="small"
            sx={{ opacity: hovered ? 1 : 0, color: 'text.secondary', transition: 'opacity 0.2s' }}
          />
        )}
        <IconButton
          size="small"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          sx={{ opacity: hovered ? 1 : 0, transition: 'opacity 0.2s' }}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Context menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        slotProps={{ paper: { sx: { backgroundColor: '#282828', minWidth: 200 } } }}
      >
        <MenuItem onClick={() => { useQueueStore.getState().addNext(track); setMenuAnchor(null); }}>
          <ListItemIcon><PlaylistAddIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Слушать следующим</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { useQueueStore.getState().addToQueue(track); setMenuAnchor(null); }}>
          <ListItemIcon><QueueMusicIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Добавить в очередь</ListItemText>
        </MenuItem>
        {isLoggedIn && (
          <MenuItem onClick={handleCache}>
            <ListItemIcon><CloudDownloadIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Сохранить для офлайна</ListItemText>
          </MenuItem>
        )}
        {providerUrl && (
          <MenuItem component="a" href={providerUrl} target="_blank" rel="noopener noreferrer">
            <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Открыть источник</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
}


