import { useEffect, useMemo, useRef, useState } from 'react';
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
  Popper,
  Paper,
  List,
  ListItemButton,
  ListItemText,
  ClickAwayListener,
  CircularProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useAuthStore } from '../../store/auth.store';
import { useLogout } from '../../api/hooks/useAuth';
import { useSearch } from '../../api/hooks/useSearch';
import { useAlbumSearch, useArtistAlbums } from '../../api/hooks/useArtist';
import { canonicalizeArtistName, formatAlbumName, formatArtistNames, sanitizeTrackTitle } from '../../utils/trackText';

type SuggestionItem = {
  label: string;
  hint: string;
};

export function TopBar() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const { user, isLoggedIn } = useAuthStore();
  const { mutate: logout } = useLogout();
  const normalizedInput = searchInput.trim();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(normalizedInput), 250);
    return () => window.clearTimeout(timer);
  }, [normalizedInput]);

  const suggestionsEnabled = debouncedQuery.length >= 2;
  const { data: trackSuggestionsData, isFetching: tracksSuggestFetching } = useSearch(
    { q: debouncedQuery, provider: 'youtube', type: 'track', page: 1, limit: 6 },
    suggestionsEnabled,
  );
  const { data: albumSuggestionsData, isLoading: albumsSuggestLoading } = useAlbumSearch(
    suggestionsEnabled ? debouncedQuery : '',
    1,
    suggestionsEnabled,
  );
  const { data: artistSuggestionsData, isLoading: artistSuggestLoading } = useArtistAlbums(
    suggestionsEnabled ? debouncedQuery : '',
  );

  const suggestions: SuggestionItem[] = useMemo(() => {
    if (!suggestionsEnabled) return [];

    const items: SuggestionItem[] = [];
    const seen = new Set<string>();
    const pushSuggestion = (label: string, hint: string) => {
      const normalized = label.trim();
      if (!normalized) return;
      const key = normalized.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ label: normalized, hint });
    };

    if (artistSuggestionsData?.artist?.name) {
      pushSuggestion(canonicalizeArtistName(artistSuggestionsData.artist.name), 'Исполнитель');
    }

    for (const album of albumSuggestionsData?.albums?.slice(0, 4) ?? []) {
      pushSuggestion(formatAlbumName(album.title), `Альбом • ${formatArtistNames(album.artist)}`);
    }

    for (const track of trackSuggestionsData?.tracks?.slice(0, 6) ?? []) {
      const title = sanitizeTrackTitle(track.title, track.artist);
      pushSuggestion(title, `Трек • ${formatArtistNames(track.artist)}`);
    }

    return items.slice(0, 8);
  }, [suggestionsEnabled, artistSuggestionsData, albumSuggestionsData, trackSuggestionsData]);

  const suggestionsLoading = suggestionsEnabled && (
    tracksSuggestFetching || albumsSuggestLoading || artistSuggestLoading
  );
  const showSuggestions = isSearchFocused && normalizedInput.length >= 2 && (
    suggestions.length > 0 || suggestionsLoading
  );

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchInput]);

  const submitSearch = (value: string) => {
    const query = value.trim();
    if (!query) return;
    setSearchInput(query);
    navigate(`/search?q=${encodeURIComponent(query)}`);
    setIsSearchFocused(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (showSuggestions && highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
      submitSearch(suggestions[highlightedIndex].label);
      return;
    }
    submitSearch(searchInput);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, -1));
      return;
    }
    if (e.key === 'Escape') {
      setIsSearchFocused(false);
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
      {/* Navigation arrows - hidden on mobile */}
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
      <ClickAwayListener onClickAway={() => setIsSearchFocused(false)}>
        <Box sx={{ flex: 1, maxWidth: isMobile ? '100%' : 480 }}>
          <Box
            ref={searchBoxRef}
            component="form"
            onSubmit={handleSearch}
            sx={{
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
              placeholder={
                isMobile
                  ? '\u041f\u043e\u0438\u0441\u043a...'
                  : '\u0418\u0449\u0438\u0442\u0435 \u0442\u0440\u0435\u043a\u0438, \u0438\u0441\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u0435\u0439, \u0430\u043b\u044c\u0431\u043e\u043c\u044b...'
              }
              value={searchInput}
              onFocus={() => setIsSearchFocused(true)}
              onKeyDown={handleSearchKeyDown}
              onChange={(e) => setSearchInput(e.target.value)}
              fullWidth
              sx={{ fontSize: 14, color: 'text.primary' }}
              inputProps={{ 'aria-label': '\u043f\u043e\u0438\u0441\u043a \u043c\u0443\u0437\u044b\u043a\u0438' }}
            />
          </Box>
          <Popper
            open={showSuggestions}
            anchorEl={searchBoxRef.current}
            placement="bottom-start"
            sx={{ zIndex: 1350, mt: 0.5 }}
            style={{ width: searchBoxRef.current?.clientWidth }}
          >
            <Paper
              elevation={10}
              sx={{
                borderRadius: 2,
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.08)',
                backgroundColor: 'rgba(24,24,24,0.98)',
                backdropFilter: 'blur(14px)',
              }}
            >
              {suggestionsLoading && suggestions.length === 0 ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5 }}>
                  <CircularProgress size={14} />
                  <Typography variant="caption" color="text.secondary">
                    Поиск подсказок...
                  </Typography>
                </Box>
              ) : (
                <List disablePadding>
                  {suggestions.map((item, idx) => (
                    <ListItemButton
                      key={`${item.label}-${item.hint}-${idx}`}
                      selected={idx === highlightedIndex}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onClick={() => submitSearch(item.label)}
                      sx={{
                        px: 1.5,
                        py: 1,
                        alignItems: 'flex-start',
                        '&.Mui-selected': {
                          backgroundColor: 'rgba(255,219,77,0.14)',
                        },
                        '&.Mui-selected:hover': {
                          backgroundColor: 'rgba(255,219,77,0.2)',
                        },
                      }}
                    >
                      <ListItemText
                        primary={item.label}
                        secondary={item.hint}
                        primaryTypographyProps={{ noWrap: true, fontSize: 14 }}
                        secondaryTypographyProps={{ noWrap: true, fontSize: 12 }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Paper>
          </Popper>
        </Box>
      </ClickAwayListener>

      {!isMobile && <Box sx={{ flex: 1 }} />}

      {/* Auth */}
      {isLoggedIn ? (
        <>
          <Tooltip title={user?.username ?? '\u041f\u0440\u043e\u0444\u0438\u043b\u044c'}>
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
              {'\u0411\u0438\u0431\u043b\u0438\u043e\u0442\u0435\u043a\u0430'}
            </MenuItem>
            <MenuItem
              onClick={() => {
                logout();
                setMenuAnchor(null);
              }}
              sx={{ color: 'error.main' }}
            >
              {'\u0412\u044b\u0439\u0442\u0438'}
            </MenuItem>
          </Menu>
        </>
      ) : (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="text" size="small" onClick={() => navigate('/register')} sx={{ color: 'text.secondary' }}>
            {'\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f'}
          </Button>
          <Button variant="contained" size="small" onClick={() => navigate('/login')}>
            {'\u0412\u043e\u0439\u0442\u0438'}
          </Button>
        </Box>
      )}
    </Box>
  );
}
