import { Box, List, ListItemButton, ListItemIcon, ListItemText, Typography, IconButton, Divider, useMediaQuery, useTheme } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic';
import LibraryMusicOutlinedIcon from '@mui/icons-material/LibraryMusicOutlined';
import AddIcon from '@mui/icons-material/Add';
import QueueMusicIcon from '@mui/icons-material/QueueMusic';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import { useAuthStore } from '../../store/auth.store';
import { usePlaylists, useCreatePlaylist } from '../../api/hooks/usePlaylists';

const NAV_ITEMS = [
  { label: 'Поиск', icon: SearchIcon, activeIcon: SearchIcon, path: '/search' },
  { label: 'Библиотека', icon: LibraryMusicOutlinedIcon, activeIcon: LibraryMusicIcon, path: '/library' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const { data: playlists } = usePlaylists();
  const { mutate: createPlaylist } = useCreatePlaylist();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  if (isMobile) return null;

  const handleCreatePlaylist = () => {
    createPlaylist(
      { name: `Мой плейлист ${(playlists?.length ?? 0) + 1}` },
      { onSuccess: (pl: { id: string }) => navigate(`/playlist/${pl.id}`) },
    );
  };

  return (
    <Box
      sx={{
        width: 240,
        flexShrink: 0,
        background: 'linear-gradient(180deg, #111111 0%, #0D0D0D 100%)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
        borderRight: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <Box sx={{ px: 3, pt: 3, pb: 2 }}>
        <Typography
          variant="h6"
          fontWeight={800}
          sx={{
            background: 'linear-gradient(135deg, #FFDB4D 0%, #FFB800 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.5px',
          }}
        >
          Open Music
        </Typography>
      </Box>

      <List dense sx={{ px: 1.5, mb: 1 }}>
        {NAV_ITEMS.map(({ label, icon: Icon, activeIcon: ActiveIcon, path }) => {
          const active = path === '/' ? location.pathname === path : location.pathname.startsWith(path);
          return (
            <ListItemButton key={path} selected={active} onClick={() => navigate(path)} sx={{ borderRadius: 2, mb: 0.5, py: 1 }}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                {active
                  ? <ActiveIcon sx={{ color: '#FFDB4D', fontSize: 22 }} />
                  : <Icon sx={{ color: 'text.secondary', fontSize: 22 }} />
                }
              </ListItemIcon>
              <ListItemText
                primary={label}
                primaryTypographyProps={{ fontWeight: active ? 700 : 400, color: active ? 'text.primary' : 'text.secondary', fontSize: 14 }}
              />
            </ListItemButton>
          );
        })}
      </List>

      <Divider sx={{ mx: 2, borderColor: 'rgba(255,255,255,0.06)' }} />

      {isLoggedIn && (
        <>
          <List dense sx={{ px: 1.5, mb: 0.5 }}>
            <ListItemButton
              selected={location.pathname === '/import'}
              onClick={() => navigate('/import')}
              sx={{ borderRadius: 2, py: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <CloudDownloadIcon sx={{ color: location.pathname === '/import' ? '#FFDB4D' : 'text.secondary', fontSize: 22 }} />
              </ListItemIcon>
              <ListItemText
                primary="Импорт музыки"
                primaryTypographyProps={{
                  fontWeight: location.pathname === '/import' ? 700 : 400,
                  color: location.pathname === '/import' ? 'text.primary' : 'text.secondary',
                  fontSize: 14,
                }}
              />
            </ListItemButton>
          </List>

          <Divider sx={{ mx: 2, borderColor: 'rgba(255,255,255,0.06)' }} />

          <Box sx={{ px: 2, pt: 2, pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10 }}>
              Плейлисты
            </Typography>
            <IconButton size="small" onClick={handleCreatePlaylist} sx={{ width: 24, height: 24 }}>
              <AddIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>

          <List dense sx={{ px: 1.5, flex: 1, overflowY: 'auto' }}>
            {playlists?.map((pl: { id: string; name: string }) => {
              const active = location.pathname === `/playlist/${pl.id}`;
              return (
                <ListItemButton key={pl.id} onClick={() => navigate(`/playlist/${pl.id}`)} selected={active} sx={{ borderRadius: 2, mb: 0.25, py: 0.75 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <QueueMusicIcon sx={{ fontSize: 18, color: active ? '#FFDB4D' : 'text.secondary' }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={pl.name}
                    primaryTypographyProps={{ noWrap: true, fontSize: 13, color: active ? 'text.primary' : 'text.secondary' }}
                  />
                </ListItemButton>
              );
            })}
          </List>
        </>
      )}
    </Box>
  );
}
