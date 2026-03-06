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
import { useRegister } from '../api/hooks/useAuth';

export function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { mutate: register, isPending, error } = useRegister();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    register({ email, username, password }, { onSuccess: () => navigate('/') });
  };

  const errMsg =
    (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
      ?.message ?? 'Ошибка регистрации';

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
      <Paper sx={{ p: 4, width: '100%', maxWidth: 400, backgroundColor: '#181818' }}>
        <Box textAlign="center" mb={3}>
          <Typography variant="h5" fontWeight={700} color="primary">
            Open Music
          </Typography>
          <Typography variant="h6" mt={1}>
            Создайте аккаунт
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errMsg}
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
            label="Имя пользователя"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            inputProps={{ minLength: 3, maxLength: 32, pattern: '[a-zA-Z0-9_]+' }}
            helperText="Только буквы, цифры и подчёркивания"
            fullWidth
          />
          <TextField
            label="Пароль"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            inputProps={{ minLength: 8 }}
            helperText="Минимум 8 символов"
            fullWidth
          />
          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            disabled={isPending}
          >
            {isPending ? 'Создание аккаунта...' : 'Зарегистрироваться'}
          </Button>
        </Box>

        <Box textAlign="center" mt={3}>
          <Typography variant="body2" color="text.secondary">
            Уже есть аккаунт?{' '}
            <Link component={RouterLink} to="/login" color="primary">
              Войти
            </Link>
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
