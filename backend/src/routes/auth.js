import express from 'express';
import { env, isSupabaseAdminConfigured, isSupabaseConfigured } from '../config/env.js';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { clearSessionCookie, requireAuth, setSessionCookie } from '../middleware/auth.js';
import { isDuplicateSignup } from '../services/authRegistration.js';
import { fail, sendSupabaseError } from '../services/http.js';

const router = express.Router();
const passwordMinimum = 10;

function isAllowedCollegeEmail(email) {
  if (env.collegeEmailDomains.length === 0) return false;
  const domain = email.split('@').at(-1)?.toLowerCase();
  return Boolean(domain && env.collegeEmailDomains.includes(domain));
}

router.post('/register', async (req, res) => {
  if (!isSupabaseConfigured || !supabase || !isSupabaseAdminConfigured || !supabaseAdmin) {
    return fail(res, 503, 'Set Supabase URL, anon key, and service-role key before registration.');
  }
  const { email, password, full_name: fullName, department, student_year: studentYear } = req.body ?? {};
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const parsedStudentYear = studentYear === '' || studentYear === null ? undefined : studentYear;
  if (!normalizedEmail || !normalizedEmail.includes('@') || typeof fullName !== 'string' || fullName.trim().length < 2) {
    return fail(res, 400, 'Provide a valid college email address and full name.');
  }
  if (!isAllowedCollegeEmail(normalizedEmail)) {
    return fail(res, 403, 'Registration is limited to the configured college email domains.');
  }
  if (typeof password !== 'string' || password.length < passwordMinimum) {
    return fail(res, 400, `Password must contain at least ${passwordMinimum} characters.`);
  }
  if (parsedStudentYear !== undefined
      && (!Number.isInteger(parsedStudentYear) || parsedStudentYear < 1 || parsedStudentYear > 10)) {
    return fail(res, 400, 'Student year must be an integer between 1 and 10.');
  }

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      emailRedirectTo: env.frontendUrl,
      data: {
        full_name: fullName.trim(),
        department: typeof department === 'string' ? department.trim() : null,
        student_year: parsedStudentYear ?? null,
      },
    },
  });
  if (isDuplicateSignup(data, error)) {
    return fail(res, 409, 'An account with this email already exists. Please sign in instead.');
  }
  if (error) return fail(res, 400, error.message);
  if (!data.user) return fail(res, 502, 'Supabase did not return a registration record.');

  if (isSupabaseAdminConfigured && supabaseAdmin && parsedStudentYear) {
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ student_year: parsedStudentYear, department: department?.trim() || null })
      .eq('id', data.user.id);
    if (profileError) return sendSupabaseError(res, profileError);
  }

  if (data.session) {
    setSessionCookie(res, data.session.access_token, data.session.expires_in);
  }
  return res.status(201).json({
    success: true,
    authenticated: Boolean(data.session),
    message: data.session
      ? 'Account created. Your college email is verified and you are signed in.'
      : 'If this is a new account, check your college email for a verification link. If you have registered before, sign in instead.',
    user: { id: data.user.id, email: data.user.email },
  });
});

router.post('/login', async (req, res) => {
  if (!isSupabaseConfigured || !supabase || !isSupabaseAdminConfigured || !supabaseAdmin) {
    return fail(res, 503, 'Set Supabase URL, anon key, and service-role key before signing in.');
  }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body?.password;
  if (!email || typeof password !== 'string') return fail(res, 400, 'Email and password are required.');

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) return fail(res, 401, 'Email or password is incorrect.');
  if (!data.user.email_confirmed_at) return fail(res, 403, 'Verify your college email before signing in.');

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id,email,full_name,role,account_status')
    .eq('id', data.user.id)
    .single();
  if (profileError) return sendSupabaseError(res, profileError);
  if (profile.account_status === 'suspended') return fail(res, 403, 'This account is suspended.');

  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ account_status: 'verified', updated_at: new Date().toISOString() })
    .eq('id', data.user.id);
  if (updateError) return sendSupabaseError(res, updateError);

  setSessionCookie(res, data.session.access_token, data.session.expires_in);
  return res.json({
    success: true,
    authenticated: true,
    user: { ...profile, account_status: 'verified' },
  });
});

router.post('/logout', async (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, user: req.user.profile });
});

export default router;
