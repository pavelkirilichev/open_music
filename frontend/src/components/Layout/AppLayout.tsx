import { Box, useMediaQuery, useTheme } from '@mui/material';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { Player } from '../Player/Player';

export function AppLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: 'background.default' }}>
      <Sidebar />

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <TopBar />

        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            pb: isMobile ? 'calc(120px + env(safe-area-inset-bottom, 0px))' : '90px',
            px: { xs: 1.5, sm: 2, md: 3 },
          }}
        >
          <Outlet />
        </Box>
      </Box>

      <Player />
      <BottomNav />
    </Box>
  );
}
