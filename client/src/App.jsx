import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams, Link } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuthContext } from './context/AuthContext';
import { VaultProvider } from './context/VaultContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import RecoverAccount from './pages/RecoverAccount';
import api from './lib/api';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuthContext();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-primary)',
      }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <VaultProvider>{children}</VaultProvider>;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuthContext();

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  return children;
};

// ─── EMAIL VERIFICATION PAGE ────────────────────────────

const EmailVerification = () => {
  const [status, setStatus] = useState('verifying');
  const [message, setMessage] = useState('');
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setMessage('Invalid verification link');
      return;
    }

    api.get(`/auth/verify-email/${token}`)
      .then(() => {
        setStatus('success');
        setMessage('Email verified! You can now log in.');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.response?.data?.error || 'Verification failed');
      });
  }, [searchParams]);

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div className="auth-header">
          <div className="auth-logo">Weave</div>
        </div>
        <div style={{ padding: 'var(--space-8) 0' }}>
          {status === 'verifying' && (
            <>
              <div className="spinner spinner-lg" style={{ margin: '0 auto var(--space-4)' }} />
              <p style={{ color: 'var(--text-secondary)' }}>Verifying your email...</p>
            </>
          )}
          {status === 'success' && (
            <>
              <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>✅</div>
              <p style={{ color: 'var(--success)', fontWeight: 500, marginBottom: 'var(--space-4)' }}>{message}</p>
              <Link to="/login" className="btn btn-primary">Go to Login</Link>
            </>
          )}
          {status === 'error' && (
            <>
              <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>❌</div>
              <p style={{ color: 'var(--danger)', fontWeight: 500, marginBottom: 'var(--space-4)' }}>{message}</p>
              <Link to="/signup" className="btn btn-secondary">Try Again</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const App = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#1e1e35',
              color: '#f0f0f5',
              border: '1px solid #2a2a44',
              borderRadius: '12px',
              fontSize: '14px',
              fontFamily: "'Inter', sans-serif",
            },
            success: {
              iconTheme: { primary: '#2ed573', secondary: '#1e1e35' },
            },
            error: {
              iconTheme: { primary: '#ff4757', secondary: '#1e1e35' },
            },
          }}
        />
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
          <Route path="/recover" element={<RecoverAccount />} />
          <Route path="/verify-email" element={<EmailVerification />} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
