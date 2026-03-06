import { Box, Typography, Grid } from '@mui/material';
import { TrackCard } from '../components/Track/TrackCard';
import { TrackRow } from '../components/Track/TrackRow';
import { LoadingSpinner } from '../components/Common/LoadingSpinner';
import { useListenHistory, useLikedTracks, useLikedIds } from '../api/hooks/useLibrary';
import { useAuthStore } from '../store/auth.store';
import { useSearch } from '../api/hooks/useSearch';
import { Track } from '../types';

const FEATURED_QUERIES = [
  'jazz instrumental',
  'classical piano',
  'ambient electronic',
  'lo-fi hip hop',
];

export function Home() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const { data: history, isLoading: historyLoading } = useListenHistory();
  const { data: liked } = useLikedTracks();

  // Featured: rotating query
  const featuredQuery = FEATURED_QUERIES[new Date().getHours() % FEATURED_QUERIES.length];
  const { data: featured, isLoading: featuredLoading } = useSearch(
    { q: featuredQuery, provider: 'jamendo', limit: 12 },
    true,
  );

  const recentTracks = (history as Track[] | undefined)?.slice(0, 6) ?? [];
  const likedTracks = liked?.tracks?.slice(0, 5) ?? [];

  // One batch call for all tracks on this page
  const allPageTracks = [...recentTracks, ...likedTracks, ...(featured?.tracks ?? [])];
  const { data: likedSet } = useLikedIds(allPageTracks);

  return (
    <Box>
      {/* Greeting */}
      <Box sx={{ py: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          {isLoggedIn
            ? getGreeting()
            : 'Welcome to Open Music'}
        </Typography>
        {!isLoggedIn && (
          <Typography variant="body1" color="text.secondary" mt={1}>
            Discover and stream free music from YouTube, Internet Archive, Jamendo and more.
          </Typography>
        )}
      </Box>

      {/* Recently played */}
      {/* {isLoggedIn && recentTracks.length > 0 && (
        <Section title="Recently played">
          {historyLoading ? (
            <LoadingSpinner />
          ) : (
            <Grid container spacing={1}>
              {recentTracks.map((track, i) => (
                <Grid item xs={12} sm={6} key={i}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      backgroundColor: '#282828',
                      borderRadius: 1,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      '&:hover': { backgroundColor: '#3a3a3a' },
                    }}
                  >
                    <TrackRow track={track} queue={recentTracks} likedSet={likedSet} />
                  </Box>
                </Grid>
              ))}
            </Grid>
          )}
        </Section>
      )} */}

      {/* Liked tracks */}
      {isLoggedIn && likedTracks.length > 0 && (
        <Section title="Liked tracks">
          <Box>
            {likedTracks.map((track, i) => (
              <TrackRow key={i} track={track} queue={likedTracks} showIndex index={i} likedSet={likedSet} />
            ))}
          </Box>
        </Section>
      )}

      {/* Featured / Discovery */}
      <Section title={`Discover — ${featuredQuery}`}>
        {featuredLoading ? (
          <LoadingSpinner message="Finding music..." />
        ) : (
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {featured?.tracks.map((track, i) => (
              <TrackCard key={i} track={track} queue={featured.tracks} likedSet={likedSet} />
            ))}
          </Box>
        )}
      </Section>
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
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
