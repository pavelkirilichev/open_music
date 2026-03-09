import { Box, useMediaQuery, useTheme } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import { useAuthStore } from '../../store/auth.store';

const NAV_ITEMS = [
  { label: 'Поиск', icon: SearchIcon, path: '/search', authOnly: false },
  { label: 'Библиотека', icon: LibraryMusicIcon, path: '/library', authOnly: true },
  { label: 'Импорт', icon: CloudDownloadIcon, path: '/import', authOnly: true },
];

export function BottomNav() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const location = useLocation();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  if (!isMobile) return null;

  const visibleItems = NAV_ITEMS.filter((item) => !item.authOnly || isLoggedIn);

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1100,
        backgroundColor: 'rgba(10,10,10,0.97)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        pb: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {visibleItems.map(({ label, icon: Icon, path }) => {
        const active = location.pathname.startsWith(path);
        return (
          <Box
            key={path}
            onClick={() => navigate(path)}
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 1.25,
              gap: 0.4,
              cursor: 'pointer',
              color: active ? '#FFDB4D' : '#707070',
              transition: 'color 0.15s ease',
              WebkitTapHighlightColor: 'transparent',
              userSelect: 'none',
            }}
          >
            <Icon sx={{ fontSize: 22 }} />
            <Box component="span" sx={{ fontSize: 10, fontWeight: active ? 600 : 400, lineHeight: 1 }}>
              {label}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
