// apps/web/src/pages/Login.tsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase.js';
import { useAuthStore } from '../store/auth.store.js';
import { logUserActivity } from '../services/activityLogger.js';
import type { Profile } from '@heqcis/types';

export function Login() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  const navigate  = useNavigate();
  const { setAuth } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(authError.message);
        logUserActivity('login_failed', {
          email:    email.trim(),
          metadata: { reason: authError.message },
        });
        return;
      }

      if (!data.session) {
        setError('No session returned. Please try again.');
        return;
      }

      // Fetch profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.session.user.id)
        .maybeSingle();

      if (profileError || !profile) {
        setError('Could not load user profile. Contact your administrator.');
        await supabase.auth.signOut();
        return;
      }

      setAuth(profile as Profile, data.session.access_token);
      logUserActivity('login', {
        user_id: data.session.user.id,
        email:   email.trim(),
      });
      navigate('/dashboard', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-vh-100 d-flex align-items-center justify-content-center"
      style={{ background: 'var(--che-primary)' }}
    >
      <div className="card shadow-lg" style={{ width: '100%', maxWidth: 420 }}>
        <div className="card-body p-5">
          {/* Logo */}
          <div className="text-center mb-4">
            <div
              className="rounded-circle bg-primary d-inline-flex align-items-center justify-content-center mb-3"
              style={{ width: 60, height: 60 }}
            >
              <span className="text-white fw-bold fs-5">CHE</span>
            </div>
            <h4 className="fw-bold mb-1">HEQCIS Operations Portal</h4>
            <p className="text-muted small">Council on Higher Education</p>
          </div>

          {error && (
            <div className="alert alert-danger py-2 small" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label htmlFor="email" className="form-label fw-semibold">
                Email address
              </label>
              <input
                id="email"
                type="email"
                className="form-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@che.ac.za"
              />
            </div>

            <div className="mb-4">
              <label htmlFor="password" className="form-label fw-semibold">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-100 fw-semibold"
              disabled={loading}
            >
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2" />Signing in…</>
                : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
