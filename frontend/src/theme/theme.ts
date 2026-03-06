import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#FFDB4D',
      light: '#FFE680',
      dark: '#E6C200',
      contrastText: '#000000',
    },
    secondary: {
      main: '#A0A0A0',
    },
    background: {
      default: '#0D0D0D',
      paper: '#161616',
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#A0A0A0',
    },
    error: { main: '#FF4444' },
    success: { main: '#4CAF50' },
    divider: 'rgba(255,255,255,0.06)',
  },
  typography: {
    fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
    h1: { fontWeight: 800, letterSpacing: '-0.02em' },
    h2: { fontWeight: 700, letterSpacing: '-0.01em' },
    h3: { fontWeight: 700, letterSpacing: '-0.01em' },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    body1: { fontSize: '0.9375rem' },
    body2: { fontSize: '0.875rem' },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0.01em' },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiCssBaseline: {
      styleOverrides: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `,
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '10px 24px',
          fontWeight: 600,
          transition: 'all 0.15s ease',
        },
        containedPrimary: {
          color: '#000',
          '&:hover': { backgroundColor: '#FFE680', transform: 'translateY(-1px)', boxShadow: '0 4px 20px rgba(255,219,77,0.3)' },
        },
        outlinedPrimary: {
          borderColor: 'rgba(255,219,77,0.4)',
          '&:hover': { borderColor: '#FFDB4D', backgroundColor: 'rgba(255,219,77,0.08)' },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#1A1A1A',
          backgroundImage: 'none',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.04)',
          transition: 'all 0.2s ease',
          '&:hover': { backgroundColor: '#222222', transform: 'translateY(-2px)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none', backgroundColor: '#1A1A1A' },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: '#A0A0A0',
          borderRadius: 8,
          transition: 'all 0.15s ease',
          '&:hover': { color: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.08)' },
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: { color: '#FFDB4D', padding: '10px 0' },
        thumb: {
          width: 14, height: 14,
          '&:hover, &.Mui-focusVisible': { boxShadow: '0 0 0 8px rgba(255,219,77,0.16)' },
          '&:before': { boxShadow: 'none' },
        },
        rail: { color: 'rgba(255,255,255,0.15)', height: 3 },
        track: { color: '#FFDB4D', height: 3, border: 'none' },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
            backgroundColor: 'rgba(255,255,255,0.05)',
            '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
            '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
            '&.Mui-focused fieldset': { borderColor: '#FFDB4D' },
          },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px !important',
          color: '#A0A0A0',
          '&.Mui-selected': {
            backgroundColor: 'rgba(255,219,77,0.15)',
            color: '#FFDB4D',
            borderColor: 'rgba(255,219,77,0.3)',
            '&:hover': { backgroundColor: 'rgba(255,219,77,0.2)' },
          },
          '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)' },
        },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: { gap: 4 },
        grouped: {
          margin: 0,
          '&:not(:first-of-type)': { borderRadius: '8px !important', borderLeft: '1px solid rgba(255,255,255,0.1)' },
          '&:first-of-type': { borderRadius: '8px !important' },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '&.MuiChip-outlined': { borderColor: 'rgba(255,255,255,0.15)' },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)' },
          '&.Mui-selected': {
            backgroundColor: 'rgba(255,219,77,0.1)',
            '&:hover': { backgroundColor: 'rgba(255,219,77,0.15)' },
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#2A2A2A',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          fontSize: 12,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: '#222222',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          margin: '2px 4px',
          '&:hover': { backgroundColor: 'rgba(255,255,255,0.08)' },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '0.9rem',
          '&.Mui-selected': { fontWeight: 700 },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { backgroundColor: '#FFDB4D', height: 3, borderRadius: 2 },
      },
    },
  },
});
