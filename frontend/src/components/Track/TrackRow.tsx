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

function parseArtists(artistStr: string): Array<{ name: string; separator?: string }> {
  const parts: Array<{ name: string; separator?: string }> = [];
  const regex = /( ft\. | feat\. | featuring | & |, )/i;
  const tokens = artistStr.split(regex);
  tokens.forEach((token) => {
    if (regex.test(token)) {
      if (parts.length > 0) parts[parts.length - 1].separator = token;
    } else if (token.trim()) {
      parts.push({ name: token.trim() });
    }
  });
  return parts;
}

interface TrackRowProps {
  track: Track;
  index?: number;
  showIndex?: boolean;
  queue?: Track[];
  likedSet?: Set<string>; // "provider:providerId" → passed from parent, no N+1
  onAddToPlaylist?: (track: Track) => void;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TrackRow({ track, index, showIndex, queue, likedSet, onAddToPlaylist }: TrackRowProps) {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [hovered, setHovered] = useState(false);
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const { play, pause, isPlaying } = usePlayerStore();
  const { setQueue, currentTrack } = useQueueStore();
  const currentQueueTrack = currentTrack();
  const isCurrentTrack =
    currentQueueTrack?.provider === track.provider &&
    currentQueueTrack?.providerId === track.providerId;

  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  // O(1) lookup from parent-provided Set — zero extra requests
  const liked = likedSet?.has(`${track.provider}:${track.providerId}`) ?? false;

  const { mutate: likeTrack } = useLikeTrack();
  const { mutate: unlikeTrack } = useUnlikeTrack();

  const handlePlay = () => {
    if (isCurrentTrack) {
      if (isPlaying) pause();
      else play();
    } else {
      const tracks = queue ?? [track];
      const idx = queue ? queue.findIndex((t) => t.providerId === track.providerId) : 0;
      setQueue(tracks, idx >= 0 ? idx : 0);
      play(track);
    }
  };

  const handleLike = () => {
    if (!isLoggedIn) return;
    if (liked) {
      unlikeTrack({ provider: track.provider, providerId: track.providerId });
    } else {
      likeTrack({ provider: track.provider, providerId: track.providerId });
    }
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
        : `https://www.jamendo.com/track/${track.providerId}`;

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
          {isCurrentTrack && (
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
              {isPlaying ? (
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
            sx={{ fontSize: 13 }}
          >
            {track.title}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 11 }}>
            {track.artist}
            {track.duration ? ` • ${formatDuration(track.duration)}` : ''}
          </Typography>
        </Box>

        {/* Actions */}
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
          PaperProps={{ sx: { backgroundColor: '#282828', minWidth: 200 } }}
        >
          {isLoggedIn && (
            <MenuItem onClick={(e) => { e.stopPropagation(); handleLike(); setMenuAnchor(null); }}>
              <ListItemIcon>
                {liked ? <FavoriteIcon fontSize="small" color="primary" /> : <FavoriteBorderIcon fontSize="small" />}
              </ListItemIcon>
              <ListItemText>{liked ? 'Убрать из любимых' : 'В любимые'}</ListItemText>
            </MenuItem>
          )}
          <MenuItem onClick={(e) => { e.stopPropagation(); useQueueStore.getState().addNext(track); setMenuAnchor(null); }}>
            <ListItemIcon><PlaylistAddIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Play next</ListItemText>
          </MenuItem>
          <MenuItem onClick={(e) => { e.stopPropagation(); useQueueStore.getState().addToQueue(track); setMenuAnchor(null); }}>
            <ListItemIcon><QueueMusicIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Add to queue</ListItemText>
          </MenuItem>
          {onAddToPlaylist && (
            <MenuItem onClick={(e) => { e.stopPropagation(); onAddToPlaylist(track); setMenuAnchor(null); }}>
              <ListItemIcon><PlaylistAddIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Add to playlist</ListItemText>
            </MenuItem>
          )}
          {isLoggedIn && (
            <MenuItem onClick={(e) => { e.stopPropagation(); handleCache(); }}>
              <ListItemIcon><CloudDownloadIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Cache for offline</ListItemText>
            </MenuItem>
          )}
          <MenuItem
            component="a"
            href={providerUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Open source</ListItemText>
          </MenuItem>
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
        gridTemplateColumns: showIndex
          ? '40px 48px 1fr 80px 40px'
          : '48px 1fr 80px 40px',
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
          {hovered || isCurrentTrack ? (
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
        {(hovered || isCurrentTrack) && (
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
          onClick={(e) => { e.stopPropagation(); navigate(`/track/${track.provider}/${track.providerId}`); }}
          sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
        >
          {track.title}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{
            display: 'flex',
            flexWrap: 'nowrap',
            maxWidth: '100%',
            overflow: 'hidden',
            '& .artist-link:hover': { color: 'text.primary', textDecoration: 'underline' },
          }}
        >
          {parseArtists(track.artist).map((a, idx) => (
            <span key={idx}>
              <span
                onClick={(e) => { e.stopPropagation(); navigate(`/artist/${encodeURIComponent(a.name)}`); }}
                style={{ cursor: 'pointer' }}
                className="artist-link"
              >
                {a.name}
              </span>
              {a.separator && <span>{a.separator}</span>}
            </span>
          ))}
          {track.album && <span> • {track.album}</span>}
        </Typography>
      </Box>

      {/* Duration */}
      <Typography variant="caption" color="text.secondary" textAlign="right" sx={{ minWidth: 40 }}>
        {formatDuration(track.duration)}
      </Typography>

      {/* Actions */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        {isLoggedIn && (
          <Tooltip title={liked ? 'Remove from liked' : 'Add to liked'}>
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
        PaperProps={{ sx: { backgroundColor: '#282828', minWidth: 200 } }}
      >
        <MenuItem onClick={() => { useQueueStore.getState().addNext(track); setMenuAnchor(null); }}>
          <ListItemIcon><PlaylistAddIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Play next</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { useQueueStore.getState().addToQueue(track); setMenuAnchor(null); }}>
          <ListItemIcon><QueueMusicIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Add to queue</ListItemText>
        </MenuItem>
        {onAddToPlaylist && (
          <MenuItem onClick={() => { onAddToPlaylist(track); setMenuAnchor(null); }}>
            <ListItemIcon><PlaylistAddIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Add to playlist</ListItemText>
          </MenuItem>
        )}
        {isLoggedIn && (
          <MenuItem onClick={handleCache}>
            <ListItemIcon><CloudDownloadIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Cache for offline</ListItemText>
          </MenuItem>
        )}
        <MenuItem component="a" href={providerUrl} target="_blank" rel="noopener noreferrer">
          <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Open source</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}
