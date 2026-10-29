import { createClient } from '@supabase/supabase-js';
import { env, isSupabaseAdminConfigured, isSupabaseConfigured } from './env.js';

export const supabase = isSupabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

export const supabaseAdmin = isSupabaseAdminConfigured
  ? createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;
