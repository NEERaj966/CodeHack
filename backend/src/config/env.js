import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  collegeEmailDomains: (process.env.COLLEGE_EMAIL_DOMAINS || '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean),
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
};

function isConfiguredValue(value) {
  return Boolean(value && !/\byour[-_ ]/i.test(value.trim()));
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

const validSupabaseUrl = isConfiguredValue(env.supabaseUrl) && isHttpUrl(env.supabaseUrl);
export const isSupabaseConfigured = validSupabaseUrl && isConfiguredValue(env.supabaseAnonKey);
export const isSupabaseAdminConfigured = validSupabaseUrl && isConfiguredValue(env.supabaseServiceRoleKey);
