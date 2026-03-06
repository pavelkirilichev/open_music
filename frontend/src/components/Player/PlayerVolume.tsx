import { Box, IconButton, Slider, Tooltip } from '@mui/material';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeDownIcon from '@mui/icons-material/VolumeDown';
import VolumeMuteIcon from '@mui/icons-material/VolumeMute';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import { usePlayerStore } from '../../store/player.store';

export function PlayerVolume() {
  const { volume, muted, setVolume, toggleMute } = usePlayerStore();

  const VolumeIcon =
    muted || volume === 0
      ? VolumeOffIcon
      : volume < 0.33
        ? VolumeMuteIcon
        : volume < 0.66
          ? VolumeDownIcon
          : VolumeUpIcon;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 120 }}>
      <Tooltip title={muted ? 'Включить звук' : 'Выключить звук'}>
        <IconButton size="small" onClick={toggleMute}>
          <VolumeIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Slider
        value={muted ? 0 : volume}
        min={0}
        max={1}
        step={0.01}
        onChange={(_, v) => setVolume(v as number)}
        size="small"
        sx={{ width: 80 }}
        aria-label="Громкость"
      />
    </Box>
  );
}
