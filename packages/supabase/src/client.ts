// packages/supabase/src/client.ts
// Anon-key Supabase client — safe for browser/server-side use.
// Reads from process.env. In Vite apps, use apps/web/src/services/supabase.ts instead.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = process.env['SUPABASE_URL'] as string;
const supabaseAnon = process.env['SUPABASE_ANON_KEY'] as string;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_ANON_KEY. Check your environment variables.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
