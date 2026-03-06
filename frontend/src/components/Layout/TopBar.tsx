import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  InputBase,
  Avatar,
  Menu,
  MenuItem,
  IconButton,
  Button,
  Typography,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useAuthStore } from '../../store/auth.store';
import { useLogout } from '../../api/hooks/useAuth';

export function TopBar() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const { user, isLoggedIn } = useAuthStore();
  const { mutate: logout } = useLogout();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchInput.trim())}`);
    }
  };

  return (
    <Box
      sx={{
        height: isMobile ? 52 : 64,
        display: 'flex',
        alignItems: 'center',
        px: isMobile ? 1.5 : 3,
        gap: isMobile ? 1 : 2,
        backgroundColor: 'transparent',
        flexShrink: 0,
      }}
    >
      {/* Navigation arrows — hidden on mobile */}
      {!isMobile && (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" onClick={() => navigate(-1)} sx={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={() => navigate(1)} sx={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <ArrowForwardIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      {/* Search bar */}
      <Box
        component="form"
        onSubmit={handleSearch}
        sx={{
          flex: 1,
          maxWidth: isMobile ? '100%' : 480,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          backgroundColor: '#242424',
          borderRadius: 500,
          px: 1.5,
          py: 0.5,
          border: '1px solid transparent',
          '&:focus-within': { border: '1px solid rgba(255,255,255,0.3)' },
        }}
      >
        <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
        <InputBase
          placeholder={isMobile ? 'Поиск...' : 'Search tracks, artists, albums...'}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          fullWidth
          sx={{ fontSize: 14, color: 'text.primary' }}
          inputProps={{ 'aria-label': 'search music' }}
        />
      </Box>

      {!isMobile && <Box sx={{ flex: 1 }} />}

      {/* Auth */}
      {isLoggedIn ? (
        <>
          <Tooltip title={user?.username ?? 'Profile'}>
            <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)} sx={{ p: 0 }}>
              <Avatar
                sx={{ width: 32, height: 32, backgroundColor: 'primary.main', fontSize: 14, fontWeight: 700 }}
              >
                {user?.username?.[0]?.toUpperCase()}
              </Avatar>
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
            PaperProps={{ sx: { backgroundColor: '#282828', minWidth: 180 } }}
          >
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="body2" fontWeight={600}>
                {user?.username}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {user?.email}
              </Typography>
            </Box>
            <MenuItem onClick={() => { navigate('/library'); setMenuAnchor(null); }}>
              Library
            </MenuItem>
            <MenuItem
              onClick={() => {
                logout();
                setMenuAnchor(null);
              }}
              sx={{ color: 'error.main' }}
            >
              Log out
            </MenuItem>
          </Menu>
        </>
      ) : (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="text" size="small" onClick={() => navigate('/register')} sx={{ color: 'text.secondary' }}>
            Sign up
          </Button>
          <Button variant="contained" size="small" onClick={() => navigate('/login')}>
            Log in
          </Button>
        </Box>
      )}
    </Box>
  );
}
