// apps/web/src/store/auth.store.ts
// Zustand store for auth state. JWT is kept in memory only (not localStorage).

import { create } from 'zustand';
import type { Profile } from '@heqcis/types';
import { supabase } from '../services/supabase.js';

interface AuthState {
  user:        Profile | null;
  accessToken: string | null;
  loading:     boolean;
  setAuth:     (user: Profile, token: string) => void;
  clearAuth:   () => void;
  initialize:  () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user:        null,
  accessToken: null,
  loading:     true,

  setAuth: (user, accessToken) => set({ user, accessToken, loading: false }),
  clearAuth: () => set({ user: null, accessToken: null, loading: false }),

  initialize: async () => {
    set({ loading: true });

    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user && session.access_token) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profile) {
        set({ user: profile as Profile, accessToken: session.access_token, loading: false });
      } else {
        set({ loading: false });
      }
    } else {
      set({ loading: false });
    }

    // Keep auth state in sync with Supabase
    supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();
        if (profile) {
          set({ user: profile as Profile, accessToken: session.access_token, loading: false });
        } else {
          // Token refreshed but profile already in store — just update the token
          set((state) => state.user ? { accessToken: session.access_token } : {});
        }
      } else if (event === 'SIGNED_OUT') {
        set({ user: null, accessToken: null, loading: false });
      }
    });
  },
}));
