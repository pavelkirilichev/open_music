import { useMemo, useState, type MouseEvent } from 'react';
import {
  CircularProgress,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
} from '@mui/material';
import type { IconButtonProps } from '@mui/material/IconButton';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import PlaylistRemoveIcon from '@mui/icons-material/PlaylistRemove';
import AddIcon from '@mui/icons-material/Add';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic';
import { Track } from '../../types';
import { useAuthStore } from '../../store/auth.store';
import {
  useAddTrackToPlaylist,
  useCreatePlaylist,
  useRemoveTrackFromPlaylist,
  usePlaylists,
} from '../../api/hooks/usePlaylists';

interface AddToPlaylistButtonProps {
  track: Track;
  size?: IconButtonProps['size'];
  sx?: IconButtonProps['sx'];
  tooltip?: string;
  stopPropagation?: boolean;
}

export function AddToPlaylistButton({
  track,
  size = 'small',
  sx,
  tooltip = 'Добавить в плейлист',
  stopPropagation = true,
}: AddToPlaylistButtonProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const { data: playlists, isLoading: playlistsLoading } = usePlaylists({ withTracks: true });
  const addTrackToPlaylist = useAddTrackToPlaylist();
  const removeTrackFromPlaylist = useRemoveTrackFromPlaylist();
  const createPlaylist = useCreatePlaylist();

  if (!isLoggedIn) return null;

  const handleOpen = (event: MouseEvent<HTMLElement>) => {
    if (stopPropagation) event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  const handleClose = (event?: unknown) => {
    if (
      stopPropagation &&
      event &&
      typeof event === 'object' &&
      'stopPropagation' in event &&
      typeof event.stopPropagation === 'function'
    ) {
      event.stopPropagation();
    }
    setAnchorEl(null);
  };

  const handleAdd = (playlistId: string, event: MouseEvent<HTMLElement>) => {
    if (stopPropagation) event.stopPropagation();
    addTrackToPlaylist.mutate(
      { playlistId, provider: track.provider, providerId: track.providerId },
      { onSettled: () => setAnchorEl(null) },
    );
  };

  const handleRemove = (playlistId: string, trackId: string, event: MouseEvent<HTMLElement>) => {
    if (stopPropagation) event.stopPropagation();
    removeTrackFromPlaylist.mutate(
      { playlistId, trackId },
      { onSettled: () => setAnchorEl(null) },
    );
  };

  const handleCreateAndAdd = (event: MouseEvent<HTMLElement>) => {
    if (stopPropagation) event.stopPropagation();
    const nextIndex = (playlists?.length ?? 0) + 1;
    createPlaylist.mutate(
      { name: `Мой плейлист ${nextIndex}` },
      {
        onSuccess: (playlist) => {
          addTrackToPlaylist.mutate(
            { playlistId: playlist.id, provider: track.provider, providerId: track.providerId },
            { onSettled: () => setAnchorEl(null) },
          );
        },
      },
    );
  };

  const playlistItems = useMemo(
    () =>
      (playlists ?? []).map((playlist) => {
        const existingTrackId = playlist.tracks?.find(
          (pt) =>
            pt.track.provider === track.provider &&
            pt.track.providerId === track.providerId,
        )?.track.id;

        return { playlist, existingTrackId };
      }),
    [playlists, track.provider, track.providerId],
  );

  const isInAnyPlaylist = playlistItems.some((item) => Boolean(item.existingTrackId));
  const busy =
    addTrackToPlaylist.isPending || removeTrackFromPlaylist.isPending || createPlaylist.isPending;
  const open = Boolean(anchorEl);
  const buttonTooltip = isInAnyPlaylist ? 'Убрать из плейлиста' : tooltip;

  return (
    <>
      <Tooltip title={buttonTooltip}>
        <span>
          <IconButton
            size={size}
            onClick={handleOpen}
            disabled={busy}
            sx={sx}
          >
            {busy ? (
              <CircularProgress size={16} sx={{ color: 'inherit' }} />
            ) : isInAnyPlaylist ? (
              <PlaylistRemoveIcon fontSize="small" />
            ) : (
              <PlaylistAddIcon fontSize="small" />
            )}
          </IconButton>
        </span>
      </Tooltip>

      {open && (
        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
          onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
          PaperProps={{ sx: { backgroundColor: '#282828', minWidth: 220 } }}
        >
          {playlistsLoading && (
            <MenuItem disabled>
              <ListItemIcon>
                <CircularProgress size={16} />
              </ListItemIcon>
              <ListItemText>Загрузка...</ListItemText>
            </MenuItem>
          )}

          {!playlistsLoading && playlistItems.map(({ playlist, existingTrackId }) => (
            <MenuItem
              key={playlist.id}
              onClick={(event) => (
                existingTrackId
                  ? handleRemove(playlist.id, existingTrackId, event)
                  : handleAdd(playlist.id, event)
              )}
              disabled={busy}
            >
              <ListItemIcon>
                {existingTrackId ? (
                  <RemoveCircleOutlineIcon fontSize="small" />
                ) : (
                  <LibraryMusicIcon fontSize="small" />
                )}
              </ListItemIcon>
              <ListItemText>
                {existingTrackId ? `Убрать из "${playlist.name}"` : `Добавить в "${playlist.name}"`}
              </ListItemText>
            </MenuItem>
          ))}

          {!playlistsLoading && (playlists?.length ?? 0) === 0 && (
            <MenuItem disabled>
              <ListItemText>Нет плейлистов</ListItemText>
            </MenuItem>
          )}

          <MenuItem onClick={handleCreateAndAdd} disabled={busy}>
            <ListItemIcon>
              {createPlaylist.isPending ? <CircularProgress size={16} /> : <AddIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>Новый плейлист</ListItemText>
          </MenuItem>
        </Menu>
      )}
    </>
  );
}
