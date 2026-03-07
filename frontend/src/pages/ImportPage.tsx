import { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Link,
  LinearProgress,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import AlbumIcon from '@mui/icons-material/Album';
import { api } from '../api/client';

interface ImportedTrack {
  title: string;
  artist: string;
  album?: string;
  duration?: number;
}

interface ImportedAlbum {
  title: string;
  artist: string;
  year?: number;
  coverUrl?: string;
}

interface ImportResult {
  tracks: ImportedTrack[];
  albums: ImportedAlbum[];
  errors: string[];
}

interface SaveResult {
  savedTracks: number;
  savedAlbums: number;
  errors: string[];
}

/** Extract access_token from a pasted URL/fragment or return as-is */
function extractToken(raw: string): string {
  const s = raw.trim();
  const m = s.match(/access_token=([^&\s]+)/);
  if (m) return m[1];
  if (s.includes('&')) return s.split('&')[0];
  return s;
}

export function ImportPage() {
  const [tab, setTab] = useState(0);
  const [ymToken, setYmToken] = useState('');
  const [vkToken, setVkToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [error, setError] = useState('');

  const handleImport = async (service: 'yandex' | 'vk') => {
    const token = extractToken(service === 'yandex' ? ymToken : vkToken);
    if (!token) {
      setError('Введите токен');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setSaveResult(null);

    try {
      const data = await api.post<ImportResult>(`/import/${service}`, { token }, { timeout: 180_000 });
      setResult(data);
      if (data.errors?.length) {
        setError(data.errors.join('\n'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка импорта';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    setSaveResult(null);

    try {
      const data = await api.post<SaveResult>('/import/save', {
        tracks: result.tracks,
        albums: result.albums,
      }, { timeout: 1_800_000 });
      setSaveResult(data);
      if (data.errors?.length) {
        setError((prev) => prev ? `${prev}\n${data.errors.join('\n')}` : data.errors.join('\n'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка сохранения';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Box sx={{ py: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Импорт музыки
        </Typography>
        <Typography variant="body2" color="text.secondary" mt={1}>
          Импортируйте лайкнутые треки и альбомы из Яндекс Музыки или ВК Музыки.
          Метаданные будут загружены и сопоставлены с источниками Open Music.
        </Typography>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => { setTab(v); setResult(null); setError(''); setSaveResult(null); }}
        sx={{
          mb: 3,
          '& .MuiTab-root': { textTransform: 'none', fontWeight: 600 },
        }}
      >
        <Tab label="Яндекс Музыка" />
        <Tab label="ВК Музыка" />
      </Tabs>

      {/* Yandex Music tab */}
      {tab === 0 && (
        <Box>
          <Accordion
            defaultExpanded={false}
            sx={{ backgroundColor: 'rgba(255,255,255,0.03)', mb: 2 }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={600}>
                Как получить токен Яндекс Музыки?
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary" component="div">
                <ol style={{ paddingLeft: 20, margin: 0 }}>
                  <li>Откройте <Link href="https://oauth.yandex.ru/authorize?response_type=token&client_id=23cabbbdc6cd418abb4b39c32c41195d" target="_blank" rel="noopener">эту ссылку</Link> для авторизации</li>
                  <li>Войдите в аккаунт Яндекс</li>
                  <li>После перенаправления скопируйте всю ссылку из адресной строки и вставьте в поле ниже (токен будет извлечён автоматически)</li>
                </ol>
              </Typography>
            </AccordionDetails>
          </Accordion>

          <TextField
            fullWidth
            label="OAuth токен Яндекс Музыки"
            placeholder="Вставьте ссылку или токен (y0_AgAAAA...)"
            value={ymToken}
            onChange={(e) => setYmToken(e.target.value)}
            type="password"
            sx={{ mb: 2 }}
            InputLabelProps={{ shrink: true }}
            InputProps={{ notched: true }}
          />

          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <CloudDownloadIcon />}
            onClick={() => handleImport('yandex')}
            disabled={loading || saving || !ymToken.trim()}
            size="large"
          >
            {loading ? 'Импортируем...' : 'Импортировать из Яндекс Музыки'}
          </Button>
        </Box>
      )}

      {/* VK Music tab */}
      {tab === 1 && (
        <Box>
          <Accordion
            defaultExpanded={false}
            sx={{ backgroundColor: 'rgba(255,255,255,0.03)', mb: 2 }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={600}>
                Как получить токен ВК Музыки?
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary" component="div">
                <ol style={{ paddingLeft: 20, margin: 0 }}>
                  <li>Установите <code>vkaudiotoken</code>: <code>pip install vkaudiotoken</code></li>
                  <li>Запустите: <code>python -m vkaudiotoken</code></li>
                  <li>Войдите через Kate Mobile и скопируйте токен</li>
                </ol>
                <Typography variant="caption" color="text.secondary" mt={1} display="block">
                  Альтернатива: перехватить токен через mitmproxy из Kate Mobile на Android.
                </Typography>
              </Typography>
            </AccordionDetails>
          </Accordion>

          <TextField
            fullWidth
            label="VK Access Token"
            placeholder="vk1.a.xxxxx..."
            value={vkToken}
            onChange={(e) => setVkToken(e.target.value)}
            type="password"
            sx={{ mb: 2 }}
            InputLabelProps={{ shrink: true }}
            InputProps={{ notched: true }}
          />

          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <CloudDownloadIcon />}
            onClick={() => handleImport('vk')}
            disabled={loading || saving || !vkToken.trim()}
            size="large"
          >
            {loading ? 'Импортируем...' : 'Импортировать из ВК Музыки'}
          </Button>
        </Box>
      )}

      {/* Errors */}
      {error && (
        <Alert severity="warning" sx={{ mt: 3, whiteSpace: 'pre-line' }}>
          {error}
        </Alert>
      )}

      {/* Results */}
      {result && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" fontWeight={700} mb={2}>
            Результат импорта
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip
              icon={<MusicNoteIcon />}
              label={`${result.tracks.length} треков`}
              color="primary"
              variant="outlined"
            />
            <Chip
              icon={<AlbumIcon />}
              label={`${result.albums.length} альбомов`}
              color="primary"
              variant="outlined"
            />

            {!saveResult && (
              <Button
                variant="contained"
                startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <LibraryAddIcon />}
                onClick={handleSave}
                disabled={saving || (result.tracks.length === 0 && result.albums.length === 0)}
              >
                {saving ? 'Сохраняем...' : 'Сохранить в библиотеку'}
              </Button>
            )}

            {saveResult && (
              <Chip
                icon={<CheckCircleIcon />}
                label={`Сохранено: ${saveResult.savedTracks} треков, ${saveResult.savedAlbums} альбомов`}
                color="success"
                variant="filled"
              />
            )}
          </Box>

          {saving && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="caption" color="text.secondary" mb={0.5} display="block">
                Поиск и сохранение треков на YouTube... Это может занять несколько минут.
              </Typography>
              <LinearProgress color="primary" />
            </Box>
          )}

          {result.tracks.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" fontWeight={600} mb={1}>
                Треки (первые 50)
              </Typography>
              <Box
                sx={{
                  maxHeight: 400,
                  overflowY: 'auto',
                  backgroundColor: 'rgba(255,255,255,0.02)',
                  borderRadius: 2,
                  p: 1,
                }}
              >
                {result.tracks.slice(0, 50).map((t, i) => (
                  <Box
                    key={i}
                    sx={{
                      display: 'flex',
                      gap: 1,
                      py: 0.5,
                      px: 1,
                      borderRadius: 1,
                      '&:hover': { backgroundColor: 'rgba(255,255,255,0.04)' },
                    }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 28, textAlign: 'right' }}>
                      {i + 1}
                    </Typography>
                    <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                      {t.artist} — {t.title}
                    </Typography>
                    {t.album && (
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                        {t.album}
                      </Typography>
                    )}
                  </Box>
                ))}
                {result.tracks.length > 50 && (
                  <Typography variant="caption" color="text.secondary" sx={{ px: 1, pt: 1, display: 'block' }}>
                    ...и ещё {result.tracks.length - 50} треков
                  </Typography>
                )}
              </Box>
            </Box>
          )}

          {result.albums.length > 0 && (
            <Box>
              <Typography variant="subtitle2" fontWeight={600} mb={1}>
                Альбомы
              </Typography>
              <Box
                sx={{
                  maxHeight: 300,
                  overflowY: 'auto',
                  backgroundColor: 'rgba(255,255,255,0.02)',
                  borderRadius: 2,
                  p: 1,
                }}
              >
                {result.albums.map((a, i) => (
                  <Box
                    key={i}
                    sx={{
                      display: 'flex',
                      gap: 1,
                      py: 0.5,
                      px: 1,
                      borderRadius: 1,
                      '&:hover': { backgroundColor: 'rgba(255,255,255,0.04)' },
                    }}
                  >
                    <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                      {a.artist} — {a.title}
                    </Typography>
                    {a.year && (
                      <Typography variant="caption" color="text.secondary">
                        {a.year}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
