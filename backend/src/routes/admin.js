import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { fail, sendSupabaseError, writeAudit } from '../services/http.js';

const router = express.Router();
const administrator = requireRoles('administrator');
const incidentStatuses = ['reported', 'under_review', 'awaiting_repair', 'resolved', 'closed'];
const accountStatuses = ['unverified', 'verified', 'suspended'];

function dbUnavailable(res) {
  return fail(res, 503, 'Supabase service-role access is not configured.');
}

router.get('/users', requireAuth, administrator, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id,email,full_name,role,account_status,department,created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return sendSupabaseError(res, error);
  res.json({ success: true, data });
});

router.patch('/users/:id', requireAuth, administrator, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const { role, account_status: accountStatus } = req.body ?? {};
  if (!['member', 'administrator'].includes(role) || !accountStatuses.includes(accountStatus)) {
    return fail(res, 400, 'Choose member or administrator and a valid account status.');
  }
  const { data, error } = await supabaseAdmin.rpc('admin_update_profile', {
    p_actor_id: req.user.profile.id,
    p_target_id: req.params.id,
    p_role: role,
    p_account_status: accountStatus,
  });
  if (error) return sendSupabaseError(res, error);
  res.json({ success: true, data });
});

router.get('/incidents', requireAuth, administrator, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const { data, error } = await supabaseAdmin
    .from('incidents')
    .select('id,booking_id,resource_id,reporter_id,kind,description,status,created_at,resources(name,asset_code)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return sendSupabaseError(res, error);
  res.json({ success: true, data });
});

router.patch('/incidents/:id', requireAuth, administrator, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const { status, reason } = req.body ?? {};
  if (!incidentStatuses.includes(status) || typeof reason !== 'string' || reason.trim().length < 3) {
    return fail(res, 400, 'Choose a valid incident status and provide a reason of at least three characters.');
  }
  const { data, error } = await supabaseAdmin
    .from('incidents')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select('id,resource_id,kind,status')
    .single();
  if (error) return sendSupabaseError(res, error);
  try {
    await writeAudit(supabaseAdmin, {
      actor_id: req.user.profile.id,
      action: 'incident.status_changed',
      record_type: 'incident',
      record_id: data.id,
      reason: reason.trim(),
      details: { status: data.status },
    });
  } catch (auditError) {
    return sendSupabaseError(res, auditError);
  }
  res.json({ success: true, data });
});

export default router;
