import { useState } from 'react';
import { Box, SxProps, Theme } from '@mui/material';
import MusicNoteIcon from '@mui/icons-material/MusicNote';

interface ArtworkImageProps {
  src?: string;
  fallbackSrc?: string;
  alt?: string;
  size?: number | string;
  borderRadius?: number | string;
  sx?: SxProps<Theme>;
}

export function ArtworkImage({
  src,
  fallbackSrc,
  alt = 'Обложка альбома',
  size = 56,
  borderRadius = 1,
  sx,
}: ArtworkImageProps) {
  const [triedFallback, setTriedFallback] = useState(false);
  const [failed, setFailed] = useState(false);

  const effectiveSrc = (!triedFallback ? src : fallbackSrc) ?? src;

  const handleError = () => {
    if (!triedFallback && fallbackSrc && fallbackSrc !== src) {
      setTriedFallback(true);
    } else {
      setFailed(true);
    }
  };

  if (!effectiveSrc || failed) {
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
      src={effectiveSrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={handleError}
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
