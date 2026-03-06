import { Box, Typography } from '@mui/material';
import { TrackRow } from '../components/Track/TrackRow';
import { useLikedTracks, useLikedIds } from '../api/hooks/useLibrary';
import { useAuthStore } from '../store/auth.store';

export function Home() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const { data: liked } = useLikedTracks();

  const likedTracks = liked?.tracks?.slice(0, 5) ?? [];

  // One batch call for all tracks on this page
  const allPageTracks = [...likedTracks];
  const { data: likedSet } = useLikedIds(allPageTracks);

  return (
    <Box>
      {/* Greeting */}
      <Box sx={{ py: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          {isLoggedIn ? getGreeting() : 'Добро пожаловать в Open Music'}
        </Typography>
        {!isLoggedIn && (
          <Typography variant="body1" color="text.secondary" mt={1}>
            Слушайте музыку бесплатно из YouTube, Internet Archive, Jamendo и других источников.
          </Typography>
        )}
      </Box>

      {/* Любимые треки */}
      {isLoggedIn && likedTracks.length > 0 && (
        <Section title="Любимые треки">
          <Box>
            {likedTracks.map((track, i) => (
              <TrackRow key={i} track={track} queue={likedTracks} showIndex index={i} likedSet={likedSet} />
            ))}
          </Box>
        </Section>
      )}
    </Box>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h5" fontWeight={700} mb={2}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  return 'Добрый вечер';
}
