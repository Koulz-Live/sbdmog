// apps/web/src/hooks/useAuth.ts
// Thin hook that reads from the Zustand auth store and exposes role helpers.

import { useAuthStore } from '../store/auth.store.js';
import { supabase } from '../services/supabase.js';
import { useNavigate } from 'react-router-dom';

export function useAuth() {
  const { user, accessToken, loading } = useAuthStore();
  const navigate = useNavigate();

  const role = user?.role ?? null;

  const isAdmin    = role === 'admin';
  const isEngineer = role === 'engineer' || role === 'admin';
  const isAnalyst  = role === 'analyst'  || role === 'admin';

  const signOut = async () => {
    await supabase.auth.signOut();
    useAuthStore.getState().clearAuth();
    navigate('/login', { replace: true });
  };

  return {
    user,
    accessToken,
    loading,
    role,
    isAdmin,
    isEngineer,
    isAnalyst,
    signOut,
  };
}
