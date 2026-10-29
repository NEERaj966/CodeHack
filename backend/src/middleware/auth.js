import { supabase, supabaseAdmin } from '../config/supabase.js';
import { isSupabaseAdminConfigured, isSupabaseConfigured } from '../config/env.js';

const authCookie = 'cri_session';
const administratorRole = 'administrator';

export function readSessionToken(req) {
  const cookie = req.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${authCookie}=`));

  if (cookie) return decodeURIComponent(cookie.slice(authCookie.length + 1));
  const authorization = req.headers.authorization;
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
}

export function setSessionCookie(res, token, maxAgeSeconds = 60 * 60) {
  const flags = [
    `${authCookie}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (process.env.NODE_ENV === 'production') flags.push('Secure');
  res.setHeader('Set-Cookie', flags.join('; '));
}

export function clearSessionCookie(res) {
  const flags = [`${authCookie}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];
  if (process.env.NODE_ENV === 'production') flags.push('Secure');
  res.setHeader('Set-Cookie', flags.join('; '));
}

export async function requireAuth(req, res, next) {
  if (!isSupabaseConfigured || !isSupabaseAdminConfigured || !supabase || !supabaseAdmin) {
    return res.status(503).json({
      success: false,
      message: 'Authentication is unavailable until Supabase URL, anon key, and service-role key are configured.',
    });
  }

  let token;
  try {
    token = readSessionToken(req);
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid session cookie.' });
  }
  if (!token) return res.status(401).json({ success: false, message: 'Sign in is required.' });

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return res.status(401).json({ success: false, message: 'Session is invalid or expired.' });
  }
  if (!authData.user.email_confirmed_at) {
    return res.status(403).json({ success: false, message: 'Verify your college email before continuing.' });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id,email,full_name,role,account_status,department,student_year,training_codes')
    .eq('id', authData.user.id)
    .single();
  if (profileError) return next(profileError);
  if (profile.account_status === 'suspended') {
    return res.status(403).json({ success: false, message: 'This account is suspended.' });
  }
  if (profile.account_status !== 'verified') {
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ account_status: 'verified', updated_at: new Date().toISOString() })
      .eq('id', authData.user.id);
    if (updateError) return next(updateError);
    profile.account_status = 'verified';
  }

  req.user = { auth: authData.user, profile };
  next();
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.profile.role)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

export function isAdministrator(user) {
  return user?.profile?.role === administratorRole;
}

export const authCookieName = authCookie;
