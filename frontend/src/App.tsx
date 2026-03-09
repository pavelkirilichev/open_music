import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/Layout/AppLayout';
import { LoadingSpinner } from './components/Common/LoadingSpinner';
import { useAuthStore } from './store/auth.store';

// Lazy-loaded pages for code splitting
const SearchPage = lazy(() => import('./pages/Search').then(m => ({ default: m.SearchPage })));
const LibraryPage = lazy(() => import('./pages/Library').then(m => ({ default: m.LibraryPage })));
const PlaylistDetailPage = lazy(() => import('./pages/PlaylistDetail').then(m => ({ default: m.PlaylistDetailPage })));
const LoginPage = lazy(() => import('./pages/Login').then(m => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./pages/Register').then(m => ({ default: m.RegisterPage })));
const ArtistPage = lazy(() => import('./pages/ArtistPage').then(m => ({ default: m.ArtistPage })));
const TrackDetailPage = lazy(() => import('./pages/TrackDetailPage').then(m => ({ default: m.TrackDetailPage })));
const AlbumPage = lazy(() => import('./pages/AlbumPage').then(m => ({ default: m.AlbumPage })));
const ImportPage = lazy(() => import('./pages/ImportPage').then(m => ({ default: m.ImportPage })));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  return isLoggedIn ? <>{children}</> : <Navigate to="/login" replace />;
}

function DefaultRedirect() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  return <Navigate to={isLoggedIn ? '/library' : '/search'} replace />;
}

export default function App() {
  const { logout } = useAuthStore();

  useEffect(() => {
    const handler = () => logout();
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, [logout]);

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<AppLayout />}>
          <Route path="/" element={<DefaultRedirect />} />
          <Route path="/search" element={<SearchPage />} />
          <Route
            path="/library"
            element={
              <ProtectedRoute>
                <LibraryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/playlist/:id"
            element={
              <ProtectedRoute>
                <PlaylistDetailPage />
              </ProtectedRoute>
            }
          />
          <Route path="/artist/:name" element={<ArtistPage />} />
          <Route path="/album/:mbid" element={<AlbumPage />} />
          <Route path="/track/:provider/:id" element={<TrackDetailPage />} />
          <Route
            path="/import"
            element={
              <ProtectedRoute>
                <ImportPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<DefaultRedirect />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
