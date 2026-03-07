import { useState } from 'react';
import { Box, SxProps, Theme } from '@mui/material';
import MusicNoteIcon from '@mui/icons-material/MusicNote';

interface ArtworkImageProps {
  src?: string;
  alt?: string;
  size?: number | string;
  borderRadius?: number | string;
  sx?: SxProps<Theme>;
}

export function ArtworkImage({
  src,
  alt = 'Обложка альбома',
  size = 56,
  borderRadius = 1,
  sx,
}: ArtworkImageProps) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius,
          backgroundColor: '#282828',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          ...sx,
        }}
      >
        <MusicNoteIcon sx={{ color: '#535353', fontSize: typeof size === 'number' ? size * 0.4 : 20 }} />
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setError(true)}
      sx={{
        width: size,
        height: size,
        borderRadius,
        objectFit: 'cover',
        flexShrink: 0,
        display: 'block',
        ...sx,
      }}
    />
  );
}
