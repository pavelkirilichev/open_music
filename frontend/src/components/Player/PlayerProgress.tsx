import { Box, Slider, Typography } from '@mui/material';
import { usePlayerStore } from '../../store/player.store';

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Full-width progress bar for the redesigned player (no time labels, slim) */
export function PlayerProgressBar() {
  const { currentTime, duration, buffered, seek } = usePlayerStore();
  const progress = duration > 0 ? currentTime : 0;

  return (
    <Box
      sx={{
        width: '100%',
        position: 'relative',
        height: 12,
        display: 'flex',
        alignItems: 'center',
        px: 0,
      }}
    >
      {/* Buffered track */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          height: 3,
          width: duration > 0 ? `${(buffered / duration) * 100}%` : 0,
          backgroundColor: 'rgba(255,255,255,0.12)',
          borderRadius: 2,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <Slider
        value={progress}
        min={0}
        max={duration || 1}
        step={0.5}
        onChange={(_, v) => seek(v as number)}
        size="small"
        sx={{
          p: 0,
          height: 3,
          borderRadius: 0,
          '& .MuiSlider-rail': { opacity: 0.2 },
          '& .MuiSlider-thumb': {
            width: 8,
            height: 8,
            opacity: 0,
            transition: 'opacity 0.2s',
          },
          '&:hover .MuiSlider-thumb': { opacity: 1 },
          position: 'relative',
          zIndex: 1,
        }}
      />
    </Box>
  );
}

/** Original progress bar with time labels (kept for backward compat) */
export function PlayerProgress() {
  const { currentTime, duration, buffered, seek } = usePlayerStore();
  const progress = duration > 0 ? currentTime : 0;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        width: '100%',
        maxWidth: 600,
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 36, textAlign: 'right' }}>
        {formatTime(currentTime)}
      </Typography>

      <Box sx={{ flex: 1, position: 'relative' }}>
        {/* Buffered track */}
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            height: 4,
            width: duration > 0 ? `${(buffered / duration) * 100}%` : 0,
            backgroundColor: 'rgba(255,255,255,0.15)',
            borderRadius: 2,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        <Slider
          value={progress}
          min={0}
          max={duration || 1}
          step={0.5}
          onChange={(_, v) => seek(v as number)}
          size="small"
          sx={{
            '& .MuiSlider-thumb': {
              opacity: 0,
              transition: 'opacity 0.2s',
            },
            '&:hover .MuiSlider-thumb': { opacity: 1 },
            position: 'relative',
            zIndex: 1,
          }}
        />
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 36 }}>
        {formatTime(duration)}
      </Typography>
    </Box>
  );
}
