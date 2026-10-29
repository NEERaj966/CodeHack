import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth, isAdministrator } from '../middleware/auth.js';
import { getEligibilityFailure } from '../services/eligibility.js';
import { fail, sendSupabaseError } from '../services/http.js';

const router = express.Router();
function dbUnavailable(res) {
  return fail(res, 503, 'Supabase service-role access is not configured.');
}

router.get('/', requireAuth, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  if (isAdministrator(req.user)) {
    const { data, error } = await supabaseAdmin
      .from('bookings')
      .select('*,resources(name,asset_code,category,location,handover_mode,approval_mode,created_by)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return sendSupabaseError(res, error);
    return res.json({ success: true, data });
  }

  const { data: ownedResources, error: resourcesError } = await supabaseAdmin
    .from('resources')
    .select('id')
    .eq('created_by', req.user.profile.id);
  if (resourcesError) return sendSupabaseError(res, resourcesError);
  const ownedIds = (ownedResources ?? []).map((resource) => resource.id);
  let query = supabaseAdmin
    .from('bookings')
    .select('*,resources(name,asset_code,category,location,handover_mode,approval_mode,created_by)')
    .order('created_at', { ascending: false })
    .limit(100);
  query = ownedIds.length
    ? query.or(`student_id.eq.${req.user.profile.id},resource_id.in.(${ownedIds.join(',')})`)
    : query.eq('student_id', req.user.profile.id);
  const { data, error } = await query;
  if (error) return sendSupabaseError(res, error);
  res.json({ success: true, data });
});

router.post('/', requireAuth, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  if (!['member', 'administrator'].includes(req.user.profile.role)) {
    return fail(res, 403, 'A verified member account is required to request resources.');
  }
  const { resource_id: resourceId, start_at: startAt, end_at: endAt, purpose } = req.body ?? {};
  const starts = Date.parse(startAt);
  const ends = Date.parse(endAt);
  if (typeof resourceId !== 'string' || !Number.isFinite(starts) || !Number.isFinite(ends) || starts >= ends) {
    return fail(res, 400, 'Provide a resource and valid start/end timestamps.');
  }
  if (starts <= Date.now()) return fail(res, 400, 'Booking start time must be in the future.');
  if (typeof purpose !== 'string' || purpose.trim().length < 3 || purpose.length > 1000) {
    return fail(res, 400, 'Explain the booking purpose (3-1000 characters).');
  }

  const { data: resource, error: resourceError } = await supabaseAdmin
    .from('resources')
    .select('id,created_by,active,status,eligibility_rules,approval_mode,restricted')
    .eq('id', resourceId)
    .single();
  if (resourceError) return sendSupabaseError(res, resourceError);
  if (!resource.active || !['available', 'reserved'].includes(resource.status)) {
    return fail(res, 409, 'This resource is not currently bookable.');
  }
  if (resource.created_by === req.user.profile.id) {
    return fail(res, 403, 'You cannot book a resource that you listed.');
  }
  const eligibilityReason = getEligibilityFailure(req.user.profile, resource);
  if (eligibilityReason) return fail(res, 403, eligibilityReason);

  const { data, error } = await supabaseAdmin.rpc('request_booking', {
    p_student_id: req.user.profile.id,
    p_resource_id: resourceId,
    p_start_at: new Date(starts).toISOString(),
    p_end_at: new Date(ends).toISOString(),
    p_purpose: purpose.trim(),
  });
  if (error) return sendSupabaseError(res, error);
  res.status(201).json({ success: true, data });
});

router.patch('/:id/decision', requireAuth, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const { approve, reason } = req.body ?? {};
  if (typeof approve !== 'boolean' || typeof reason !== 'string' || reason.trim().length < 3) {
    return fail(res, 400, 'Provide an approve boolean and a decision reason.');
  }
  const { data, error } = await supabaseAdmin.rpc('decide_booking', {
    p_booking_id: req.params.id,
    p_actor_id: req.user.profile.id,
    p_approve: approve,
    p_reason: reason.trim(),
  });
  if (error) return sendSupabaseError(res, error);
  res.json({ success: true, data });
});

router.post('/:id/pickup', requireAuth, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const { asset_code: assetCode, notes = '' } = req.body ?? {};
  if (typeof assetCode !== 'string' || typeof notes !== 'string') {
    return fail(res, 400, 'Provide the resource asset code and condition notes.');
  }
  const { data, error } = await supabaseAdmin.rpc('record_pickup', {
    p_booking_id: req.params.id,
    p_actor_id: req.user.profile.id,
    p_asset_code: assetCode.trim().toUpperCase(),
    p_notes: notes.trim(),
  });
  if (error) return sendSupabaseError(res, error);
  res.json({ success: true, data });
});

router.post('/:id/return', requireAuth, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const { asset_code: assetCode, notes = '' } = req.body ?? {};
  if (typeof assetCode !== 'string' || typeof notes !== 'string') {
    return fail(res, 400, 'Provide the resource asset code and condition notes.');
  }
  const { data, error } = await supabaseAdmin.rpc('record_return', {
    p_booking_id: req.params.id,
    p_actor_id: req.user.profile.id,
    p_asset_code: assetCode.trim().toUpperCase(),
    p_notes: notes.trim(),
  });
  if (error) return sendSupabaseError(res, error);
  res.json({ success: true, data });
});

export default router;
