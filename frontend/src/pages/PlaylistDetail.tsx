import { useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Tooltip,
  Chip,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import { usePlaylist, useDeletePlaylist, useImportPlaylist } from '../api/hooks/usePlaylists';
import { useLikedIds } from '../api/hooks/useLibrary';
import { TrackRow } from '../components/Track/TrackRow';
import { LoadingSpinner } from '../components/Common/LoadingSpinner';
import { usePlayerStore } from '../store/player.store';
import { useQueueStore } from '../store/queue.store';
import { Track } from '../types';

export function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: playlist, isLoading } = usePlaylist(id!);
  const { mutate: deletePlaylist } = useDeletePlaylist();
  const { mutate: importPlaylist } = useImportPlaylist();

  const { play } = usePlayerStore();
  const { setQueue, toggleShuffle } = useQueueStore();

  const tracks: Track[] =
    playlist?.tracks?.map((pt) => pt.track) ?? [];

  const { data: likedSet } = useLikedIds(tracks);

  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    setQueue(tracks, 0);
    play(tracks[0]);
  };

  const handleShuffle = () => {
    if (tracks.length === 0) return;
    toggleShuffle();
    setQueue(tracks, Math.floor(Math.random() * tracks.length));
    play(tracks[0]);
  };

  const handleExport = () => {
    const link = document.createElement('a');
    link.href = `/api/playlists/${id}/export`;
    link.download = `${playlist?.name ?? 'плейлист'}.json`;
    link.click();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      importPlaylist(data, {
        onSuccess: (result) => {
          navigate(`/playlist/${(result as { playlistId: string }).playlistId}`);
        },
      });
    } catch {
      // handle parse error
    }
  };

  const handleDelete = () => {
    if (!confirm('Удалить этот плейлист?')) return;
    deletePlaylist(id!, { onSuccess: () => navigate('/library') });
  };

  if (isLoading) return <LoadingSpinner message="Загрузка плейлиста..." />;
  if (!playlist) return null;

  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0);
  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
  };

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          gap: 3,
          py: 4,
          alignItems: 'flex-end',
          background: 'linear-gradient(transparent 0%, rgba(0,0,0,0.5) 100%)',
        }}
      >
        <Box
          sx={{
            width: 200,
            height: 200,
            backgroundColor: '#282828',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 64,
            flexShrink: 0,
          }}
        >
          🎵
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            ПЛЕЙЛИСТ
          </Typography>
          <Typography variant="h3" fontWeight={700} mb={1}>
            {playlist.name}
          </Typography>
          {playlist.description && (
            <Typography color="text.secondary" mb={1}>
              {playlist.description}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip
              label={`${tracks.length} треков`}
              size="small"
              variant="outlined"
            />
            {totalDuration > 0 && (
              <Chip
                label={formatDuration(totalDuration)}
                size="small"
                variant="outlined"
              />
            )}
            {playlist.isPublic && (
              <Chip label="Публичный" size="small" color="primary" variant="outlined" />
            )}
          </Box>
        </Box>
      </Box>

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', py: 2 }}>
        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          onClick={handlePlayAll}
          disabled={tracks.length === 0}
          size="large"
          sx={{ borderRadius: 500 }}
        >
          Слушать
        </Button>
        <Tooltip title="Перемешать">
          <IconButton onClick={handleShuffle} disabled={tracks.length === 0}>
            <ShuffleIcon />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Экспорт в JSON">
          <IconButton onClick={handleExport}>
            <FileDownloadIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Импорт из JSON">
          <IconButton onClick={() => fileInputRef.current?.click()}>
            <FileUploadIcon />
          </IconButton>
        </Tooltip>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleImport}
        />
        <Tooltip title="Удалить плейлист">
          <IconButton onClick={handleDelete} sx={{ color: 'error.main' }}>
            <DeleteIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Track list */}
      {tracks.length === 0 ? (
        <Box textAlign="center" py={8}>
          <Typography color="text.secondary">
            Этот плейлист пуст. Найдите треки и добавьте их сюда.
          </Typography>
        </Box>
      ) : (
        <>
          {/* Header row */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '40px 48px 1fr auto 80px 40px',
              px: 2,
              py: 0.5,
              mb: 0.5,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <Typography variant="caption" color="text.secondary" textAlign="center">#</Typography>
            <Box />
            <Typography variant="caption" color="text.secondary">Название</Typography>
            <Typography variant="caption" color="text.secondary">Источник</Typography>
            <Typography variant="caption" color="text.secondary" textAlign="right">Длительность</Typography>
            <Box />
          </Box>

          {tracks.map((track, i) => (
            <TrackRow
              key={track.id ?? `${track.provider}:${track.providerId}`}
              track={track}
              index={i}
              showIndex
              queue={tracks}
              likedSet={likedSet}
            />
          ))}
        </>
      )}
    </Box>
  );
}
