import { Box, Typography } from '@mui/material';
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  align?: 'left' | 'center';
  showTagline?: boolean;
}

const SIZE_PRESET: Record<NonNullable<BrandLogoProps['size']>, {
  badge: number;
  icon: number;
  title: number;
  subtitle: number;
}> = {
  sm: { badge: 28, icon: 16, title: 20, subtitle: 10 },
  md: { badge: 34, icon: 18, title: 24, subtitle: 11 },
  lg: { badge: 40, icon: 20, title: 28, subtitle: 12 },
};

export function BrandLogo({ size = 'md', align = 'left', showTagline = false }: BrandLogoProps) {
  const preset = SIZE_PRESET[size];
  const centered = align === 'center';

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: centered ? 'center' : 'flex-start',
        gap: 1.25,
      }}
    >
      <Box
        sx={{
          width: preset.badge,
          height: preset.badge,
          borderRadius: '10px',
          display: 'grid',
          placeItems: 'center',
          color: '#111',
          background: 'linear-gradient(135deg, #FFDB4D 0%, #FFB347 100%)',
          boxShadow: '0 8px 20px rgba(255, 190, 64, 0.34)',
          flexShrink: 0,
        }}
      >
        <GraphicEqRoundedIcon sx={{ fontSize: preset.icon }} />
      </Box>

      <Box sx={{ minWidth: 0, textAlign: centered ? 'center' : 'left' }}>
        <Typography
          component="div"
          sx={{
            lineHeight: 1,
            fontSize: preset.title,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            fontFamily: '"Space Grotesk", "Inter", "Helvetica Neue", Arial, sans-serif',
          }}
        >
          <Box component="span" sx={{ color: 'text.primary' }}>
            Open
          </Box>{' '}
          <Box
            component="span"
            sx={{
              background: 'linear-gradient(135deg, #FFDB4D 0%, #FFC75F 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Music
          </Box>
        </Typography>

        {showTagline && (
          <Typography
            component="div"
            sx={{
              mt: 0.3,
              fontSize: preset.subtitle,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'text.secondary',
            }}
          >
            stream without limits
          </Typography>
        )}
      </Box>
    </Box>
  );
}
