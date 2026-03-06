import { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Paper,
  Link,
} from '@mui/material';
import { useLogin } from '../api/hooks/useAuth';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { mutate: login, isPending, error } = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login({ email, password }, { onSuccess: () => navigate('/') });
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#121212',
        p: 2,
      }}
    >
      <Paper
        sx={{
          p: 4,
          width: '100%',
          maxWidth: 400,
          backgroundColor: '#181818',
        }}
      >
        <Box textAlign="center" mb={3}>
          <Typography variant="h5" fontWeight={700} color="primary">
            Open Music
          </Typography>
          <Typography variant="h6" mt={1}>
            Войдите, чтобы продолжить
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Неверный email или пароль
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} display="flex" flexDirection="column" gap={2}>
          <TextField
            label="Почта"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            fullWidth
          />
          <TextField
            label="Пароль"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            fullWidth
          />
          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            disabled={isPending}
          >
            {isPending ? 'Вход...' : 'Войти'}
          </Button>
        </Box>

        <Box textAlign="center" mt={3}>
          <Typography variant="body2" color="text.secondary">
            Нет аккаунта?{' '}
            <Link component={RouterLink} to="/register" color="primary">
              Зарегистрироваться
            </Link>
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
