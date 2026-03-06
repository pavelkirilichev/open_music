import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Typography, IconButton, Box, Tooltip } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import { Track } from '../../types';
import { ArtworkImage } from '../Common/ArtworkImage';
import { usePlayerStore } from '../../store/player.store';
import { useQueueStore } from '../../store/queue.store';
import { useLikeTrack, useUnlikeTrack } from '../../api/hooks/useLibrary';
import { useAuthStore } from '../../store/auth.store';

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

interface TrackCardProps {
  track: Track;
  queue?: Track[];
  likedSet?: Set<string>; // "provider:providerId" — passed from parent, avoids N+1
}

export function TrackCard({ track, queue, likedSet }: TrackCardProps) {
  const [hovered, setHovered] = useState(false);
  const navigate = useNavigate();
  const { play, pause, isPlaying } = usePlayerStore();
  const { setQueue, currentTrack } = useQueueStore();
  const currentQueueTrack = currentTrack();
  const isCurrentTrack =
    currentQueueTrack?.provider === track.provider &&
    currentQueueTrack?.providerId === track.providerId;

  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const liked = likedSet?.has(`${track.provider}:${track.providerId}`) ?? false;
  const { mutate: likeTrack } = useLikeTrack();
  const { mutate: unlikeTrack } = useUnlikeTrack();

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrentTrack) {
      if (isPlaying) pause();
      else play();
    } else {
      const tracks = queue ?? [track];
      const idx = queue ? queue.findIndex((t) => t.providerId === track.providerId) : 0;
      setQueue(tracks, Math.max(0, idx));
      play(track);
    }
  };

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLoggedIn) return;
    if (liked) {
      unlikeTrack({ provider: track.provider, providerId: track.providerId });
    } else {
      likeTrack({ provider: track.provider, providerId: track.providerId });
    }
  };

  return (
    <Card
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        width: 160,
        cursor: 'pointer',
        p: 1.5,
        borderRadius: 2,
        flexShrink: 0,
      }}
    >
      <Box sx={{ position: 'relative', mb: 1.5 }}>
        <ArtworkImage src={track.artworkUrl} size={136} borderRadius={1} />
        <Box
          sx={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            opacity: hovered || isCurrentTrack ? 1 : 0,
            transition: 'opacity 0.2s',
            transform: hovered ? 'translateY(0)' : 'translateY(8px)',
          }}
        >
          <IconButton
            onClick={handlePlay}
            sx={{
              backgroundColor: 'primary.main',
              color: '#000',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              '&:hover': { backgroundColor: 'primary.light', transform: 'scale(1.05)' },
            }}
          >
            {isCurrentTrack && isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
          </IconButton>
        </Box>
      </Box>

      <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant="body2"
              fontWeight={600}
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
              component="div"
              sx={{
                '& .artist-link:hover': { color: 'text.primary' },
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
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
              {track.album && <span> · {track.album}</span>}
            </Typography>
          </Box>
          {isLoggedIn && (
            <Tooltip title={liked ? 'Unlike' : 'Like'}>
              <IconButton
                size="small"
                onClick={handleLike}
                sx={{
                  opacity: hovered || liked ? 1 : 0,
                  color: liked ? 'primary.main' : 'text.secondary',
                  p: 0.25,
                  ml: 0.5,
                  flexShrink: 0,
                }}
              >
                {liked ? (
                  <FavoriteIcon sx={{ fontSize: 16 }} />
                ) : (
                  <FavoriteBorderIcon sx={{ fontSize: 16 }} />
                )}
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
