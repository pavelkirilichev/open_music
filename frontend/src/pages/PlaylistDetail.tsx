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
    link.download = `${playlist?.name ?? 'playlist'}.json`;
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
    if (!confirm('Delete this playlist?')) return;
    deletePlaylist(id!, { onSuccess: () => navigate('/library') });
  };

  if (isLoading) return <LoadingSpinner message="Loading playlist..." />;
  if (!playlist) return null;

  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0);
  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
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
            PLAYLIST
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
              label={`${tracks.length} tracks`}
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
              <Chip label="Public" size="small" color="primary" variant="outlined" />
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
          Play
        </Button>
        <Tooltip title="Shuffle play">
          <IconButton onClick={handleShuffle} disabled={tracks.length === 0}>
            <ShuffleIcon />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Export as JSON">
          <IconButton onClick={handleExport}>
            <FileDownloadIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Import playlist JSON">
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
        <Tooltip title="Delete playlist">
          <IconButton onClick={handleDelete} sx={{ color: 'error.main' }}>
            <DeleteIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Track list */}
      {tracks.length === 0 ? (
        <Box textAlign="center" py={8}>
          <Typography color="text.secondary">
            This playlist is empty. Search for tracks and add them here.
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
            <Typography variant="caption" color="text.secondary">Title</Typography>
            <Typography variant="caption" color="text.secondary">Source</Typography>
            <Typography variant="caption" color="text.secondary" textAlign="right">Duration</Typography>
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
