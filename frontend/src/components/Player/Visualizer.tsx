import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { usePlayerStore } from '../../store/player.store';

export function Visualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const { analyser, isPlaying } = usePlayerStore();

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        const alpha = 0.4 + (dataArray[i] / 255) * 0.6;

        ctx.fillStyle = `rgba(29, 185, 84, ${alpha})`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
        x += barWidth;
      }
    };

    if (isPlaying) {
      draw();
    } else {
      // Draw silent state
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = canvas.width / bufferLength;
      for (let i = 0; i < bufferLength; i++) {
        ctx.fillStyle = 'rgba(29, 185, 84, 0.2)';
        ctx.fillRect(i * barWidth, canvas.height - 2, barWidth - 1, 2);
      }
    }

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [analyser, isPlaying]);

  return (
    <Box sx={{ display: { xs: 'none', md: 'block' } }}>
      <canvas
        ref={canvasRef}
        width={120}
        height={32}
        style={{ display: 'block' }}
      />
    </Box>
  );
}
