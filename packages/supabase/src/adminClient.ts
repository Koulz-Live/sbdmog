// packages/supabase/src/adminClient.ts
// Service-role Supabase client — SERVER-SIDE ONLY.
// NEVER import this in any browser bundle. Used only in api/ Vercel Functions.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl         = process.env['SUPABASE_URL'] as string;
const supabaseServiceRole = process.env['SUPABASE_SERVICE_ROLE_KEY'] as string;

if (!supabaseUrl || !supabaseServiceRole) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check server environment variables.',
  );
}

export const adminClient = createClient(supabaseUrl, supabaseServiceRole, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
