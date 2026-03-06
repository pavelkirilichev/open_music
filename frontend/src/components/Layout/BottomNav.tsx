import { Box, useMediaQuery, useTheme } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import HomeIcon from '@mui/icons-material/Home';
import SearchIcon from '@mui/icons-material/Search';
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic';

const NAV_ITEMS = [
  { label: 'Главная', icon: HomeIcon, path: '/' },
  { label: 'Поиск', icon: SearchIcon, path: '/search' },
  { label: 'Библиотека', icon: LibraryMusicIcon, path: '/library' },
];

export function BottomNav() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const location = useLocation();

  if (!isMobile) return null;

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
      {NAV_ITEMS.map(({ label, icon: Icon, path }) => {
        const active = path === '/' ? location.pathname === path : location.pathname.startsWith(path);
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
