import { Box, IconButton, Tooltip } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import RepeatIcon from '@mui/icons-material/Repeat';
import RepeatOneIcon from '@mui/icons-material/RepeatOne';
import { usePlayerStore } from '../../store/player.store';
import { useQueueStore } from '../../store/queue.store';
import { RepeatMode } from '../../types';
import { resolveTrackForPlayback } from '../../utils/resolveTrack';

const REPEAT_CYCLE: RepeatMode[] = ['none', 'all', 'one'];

export function PlayerControls() {
  const { isPlaying, togglePlay } = usePlayerStore();
  const { shuffle, repeat, toggleShuffle, setRepeat, nextTrack, prevTrack, hasNext, hasPrev } =
    useQueueStore();
  const { play } = usePlayerStore();

  const handleNext = () => {
    nextTrack();
    const track = useQueueStore.getState().currentTrack();
    if (track) resolveTrackForPlayback(track).then((r) => { if (r) play(r); });
  };

  const handlePrev = () => {
    prevTrack();
    const track = useQueueStore.getState().currentTrack();
    if (track) resolveTrackForPlayback(track).then((r) => { if (r) play(r); });
  };

  const cycleRepeat = () => {
    const idx = REPEAT_CYCLE.indexOf(repeat);
    setRepeat(REPEAT_CYCLE[(idx + 1) % REPEAT_CYCLE.length]);
  };

  const RepeatIconComponent = repeat === 'one' ? RepeatOneIcon : RepeatIcon;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Tooltip title={shuffle ? 'Перемешивание: включено' : 'Перемешивание: выключено'}>
        <IconButton
          size="small"
          onClick={toggleShuffle}
          sx={{ color: shuffle ? 'primary.main' : 'text.secondary' }}
        >
          <ShuffleIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Tooltip title="Предыдущий трек">
        <span>
          <IconButton size="small" onClick={handlePrev} disabled={!hasPrev()}>
            <SkipPreviousIcon />
          </IconButton>
        </span>
      </Tooltip>

      <IconButton
        onClick={togglePlay}
        sx={{
          backgroundColor: 'white',
          color: '#000',
          width: 36,
          height: 36,
          '&:hover': { backgroundColor: '#f0f0f0', transform: 'scale(1.05)' },
          transition: 'transform 0.1s',
        }}
      >
        {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
      </IconButton>

      <Tooltip title="Следующий трек">
        <span>
          <IconButton size="small" onClick={handleNext} disabled={!hasNext()}>
            <SkipNextIcon />
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip
        title={
          repeat === 'none'
            ? 'Повтор: выключен'
            : repeat === 'all'
              ? 'Повтор: все треки'
              : 'Повтор: один трек'
        }
      >
        <IconButton
          size="small"
          onClick={cycleRepeat}
          sx={{ color: repeat !== 'none' ? 'primary.main' : 'text.secondary' }}
        >
          <RepeatIconComponent fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
