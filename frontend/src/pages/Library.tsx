import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PersonIcon from '@mui/icons-material/Person';
import { useLikedTracks, useLibraryAlbums, useLibraryArtists, useLikedIds, useRemoveLibraryArtist, useRemoveLibraryAlbum } from '../api/hooks/useLibrary';
import { TrackRow } from '../components/Track/TrackRow';
import { ArtworkImage } from '../components/Common/ArtworkImage';
import { LoadingSpinner } from '../components/Common/LoadingSpinner';
import { canonicalizeArtistName, formatAlbumName, formatArtistNames } from '../utils/trackText';

export function LibraryPage() {
  const navigate = useNavigate();

  const { data: likedData, isLoading: likedLoading } = useLikedTracks();
  const { data: likedSet } = useLikedIds(likedData?.tracks ?? []);
  const { data: albums, isLoading: albumsLoading } = useLibraryAlbums();
  const { data: artists, isLoading: artistsLoading } = useLibraryArtists();
  const { mutate: removeArtist } = useRemoveLibraryArtist();
  const { mutate: removeAlbum } = useRemoveLibraryAlbum();

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
                  onClick={() => navigate(`/artist/${encodeURIComponent(canonicalizeArtistName(a.artistRef.name))}`)}
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
                  onClick={() => navigate(`/artist/${encodeURIComponent(canonicalizeArtistName(a.artistRef.name))}`)}
                >
                  {canonicalizeArtistName(a.artistRef.name)}
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
                  flexShrink: 0,
                  width: 150,
                  position: 'relative',
                  '&:hover .album-remove-btn': {
                    opacity: 1,
                    transform: 'scale(1)',
                  },
                }}
              >
                <Box onClick={() => navigate(`/album/${a.albumRef.mbid}`)} sx={{ position: 'relative' }}>
                  <ArtworkImage src={a.albumRef.artworkUrl} size={150} borderRadius={1} />
                  <Tooltip title="Удалить из библиотеки">
                    <IconButton
                      className="album-remove-btn"
                      size="small"
                      onClick={(e) => { e.stopPropagation(); removeAlbum(a.id); }}
                      sx={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        opacity: 0,
                        transform: 'scale(0.96)',
                        transition: 'opacity 0.2s, transform 0.2s',
                        backgroundColor: 'rgba(0,0,0,0.58)',
                        color: '#fff',
                        '&:hover': { backgroundColor: 'rgba(0,0,0,0.78)' },
                      }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Typography variant="body2" fontWeight={600} noWrap mt={1}>
                    {formatAlbumName(a.albumRef.title)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {formatArtistNames(a.albumRef.artist)}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
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
              showAlbumRight
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
