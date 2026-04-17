// packages/types/src/user.ts

export type Role = 'admin' | 'engineer' | 'analyst' | 'viewer';

export interface Profile {
  id:            string;
  full_name:     string | null;
  role:          Role;
  department:    string | null;
  phone:         string | null;
  is_active:     boolean;
  last_login_at: string | null;
  invited_by:    string | null;
  created_at:    string;
  updated_at:    string;
}
