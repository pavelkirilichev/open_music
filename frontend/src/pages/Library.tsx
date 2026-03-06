import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  IconButton,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PersonIcon from '@mui/icons-material/Person';
import { useLikedTracks, useLibraryAlbums, useLibraryArtists, useLikedIds, useRemoveLibraryArtist, useRemoveLibraryAlbum } from '../api/hooks/useLibrary';
import { usePlaylists, useCreatePlaylist } from '../api/hooks/usePlaylists';
import { TrackRow } from '../components/Track/TrackRow';
import { ArtworkImage } from '../components/Common/ArtworkImage';
import { LoadingSpinner } from '../components/Common/LoadingSpinner';

export function LibraryPage() {
  const navigate = useNavigate();

  const { data: likedData, isLoading: likedLoading } = useLikedTracks();
  const { data: likedSet } = useLikedIds(likedData?.tracks ?? []);
  const { data: albums, isLoading: albumsLoading } = useLibraryAlbums();
  const { data: artists, isLoading: artistsLoading } = useLibraryArtists();
  const { data: playlists, isLoading: playlistsLoading } = usePlaylists();
  const { mutate: createPlaylist } = useCreatePlaylist();
  const { mutate: removeArtist } = useRemoveLibraryArtist();
  const { mutate: removeAlbum } = useRemoveLibraryAlbum();

  const handleCreatePlaylist = () => {
    createPlaylist(
      { name: `My Playlist #${(playlists?.length ?? 0) + 1}` },
      { onSuccess: (pl) => navigate(`/playlist/${pl.id}`) },
    );
  };

  const artistList = (artists as Array<{ id: string; artistRef: Record<string, string> }>) ?? [];
  const albumList = (albums as Array<{ id: string; albumRef: Record<string, string> }>) ?? [];

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Библиотека
        </Typography>
      </Box>

      {/* ── Artists ── */}
      {artistsLoading ? (
        <LoadingSpinner />
      ) : artistList.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" fontWeight={700} mb={2}>
            Исполнители
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
            {artistList.map((a) => (
              <Box
                key={a.id}
                sx={{
                  cursor: 'pointer',
                  '&:hover': { opacity: 0.85 },
                  transition: 'opacity 0.2s',
                  flexShrink: 0,
                  width: 130,
                  textAlign: 'center',
                  position: 'relative',
                }}
              >
                <Box
                  onClick={() => navigate(`/artist/${encodeURIComponent(a.artistRef.name)}`)}
                  sx={{
                    width: 100,
                    height: 100,
                    borderRadius: '50%',
                    mx: 'auto',
                    background: 'linear-gradient(135deg, #FFDB4D 0%, #FF8C00 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mb: 1,
                  }}
                >
                  <PersonIcon sx={{ fontSize: 40, color: '#000' }} />
                </Box>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  noWrap
                  onClick={() => navigate(`/artist/${encodeURIComponent(a.artistRef.name)}`)}
                >
                  {a.artistRef.name}
                </Typography>
                <Tooltip title="Удалить из библиотеки">
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); removeArtist(a.id); }}
                    sx={{ mt: 0.5, opacity: 0.5, '&:hover': { opacity: 1 } }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* ── Albums ── */}
      {albumsLoading ? (
        <LoadingSpinner />
      ) : albumList.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" fontWeight={700} mb={2}>
            Альбомы
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
            {albumList.map((a) => (
              <Box
                key={a.id}
                sx={{
                  cursor: 'pointer',
                  '&:hover': { opacity: 0.85 },
                  transition: 'opacity 0.2s',
                  flexShrink: 0,
                  width: 150,
                  position: 'relative',
                }}
              >
                <Box onClick={() => navigate(`/album/${a.albumRef.mbid}`)}>
                  <ArtworkImage src={a.albumRef.artworkUrl} size={150} borderRadius={1} />
                  <Typography variant="body2" fontWeight={600} noWrap mt={1}>
                    {a.albumRef.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {a.albumRef.artist}
                  </Typography>
                </Box>
                <Tooltip title="Удалить из библиотеки">
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); removeAlbum(a.id); }}
                    sx={{ mt: 0.5, opacity: 0.5, '&:hover': { opacity: 1 } }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* ── Playlists ── */}
      {playlistsLoading ? (
        <LoadingSpinner />
      ) : (
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Typography variant="h6" fontWeight={700}>
              Плейлисты
            </Typography>
            <Button startIcon={<AddIcon />} variant="outlined" size="small" onClick={handleCreatePlaylist}>
              Новый
            </Button>
          </Box>
          {playlists?.length === 0 ? (
            <EmptyState message="Плейлистов пока нет. Создайте первый!" />
          ) : (
            <Grid container spacing={2}>
              {playlists?.map((pl) => (
                <Grid item xs={6} sm={4} md={3} key={pl.id}>
                  <Card
                    onClick={() => navigate(`/playlist/${pl.id}`)}
                    sx={{ cursor: 'pointer', '&:hover': { backgroundColor: '#282828' } }}
                  >
                    <Box
                      sx={{
                        height: 150,
                        backgroundColor: '#282828',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 48,
                      }}
                    >
                      🎵
                    </Box>
                    <CardContent sx={{ pb: '12px !important' }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {pl.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {pl._count?.tracks ?? 0} треков
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      {/* ── Liked Tracks ── */}
      <Box>
        <Typography variant="h6" fontWeight={700} mb={2}>
          Любимые треки {likedData ? `(${likedData.total})` : ''}
        </Typography>
        {likedLoading ? (
          <LoadingSpinner />
        ) : likedData?.tracks.length === 0 ? (
          <EmptyState message="Нет лайкнутых треков. Нажмите ❤ при прослушивании!" />
        ) : (
          likedData?.tracks.map((track, i) => (
            <TrackRow
              key={track.id}
              track={track}
              index={i}
              showIndex
              queue={likedData.tracks}
              likedSet={likedSet}
            />
          ))
        )}
      </Box>
    </Box>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Box textAlign="center" py={6}>
      <Typography color="text.secondary">{message}</Typography>
    </Box>
  );
}
