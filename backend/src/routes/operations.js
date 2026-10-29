import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth, isAdministrator } from '../middleware/auth.js';
import { fail, sendSupabaseError, writeAudit } from '../services/http.js';

const router = express.Router();

function dbUnavailable(res) {
  return fail(res, 503, 'Supabase service-role access is not configured.');
}

router.post('/incidents', requireAuth, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const { booking_id: bookingId, resource_id: resourceId, kind, description } = req.body ?? {};
  if (!['damage', 'loss', 'overdue', 'other'].includes(kind)
      || typeof description !== 'string' || description.trim().length < 5 || description.length > 2000) {
    return fail(res, 400, 'Provide an incident type and a description of at least five characters.');
  }

  let incidentResourceId = resourceId;
  if (bookingId) {
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select('id,resource_id,student_id,resources(created_by)')
      .eq('id', bookingId)
      .single();
    if (bookingError) return sendSupabaseError(res, bookingError);
    if (!isAdministrator(req.user)
        && booking.student_id !== req.user.profile.id
        && booking.resources?.created_by !== req.user.profile.id) {
      return fail(res, 403, 'You can only report against your own booking or a resource you listed.');
    }
    incidentResourceId = booking.resource_id;
  }
  if (typeof incidentResourceId !== 'string') return fail(res, 400, 'Provide a resource or booking to report.');

  const { data, error } = await supabaseAdmin
    .from('incidents')
    .insert({
      booking_id: bookingId || null,
      resource_id: incidentResourceId,
      reporter_id: req.user.profile.id,
      kind,
      description: description.trim(),
    })
    .select()
    .single();
  if (error) return sendSupabaseError(res, error);
  try {
    await writeAudit(supabaseAdmin, {
      actor_id: req.user.profile.id,
      action: 'incident.reported',
      record_type: 'incident',
      record_id: data.id,
      details: { bookingId: bookingId || null, resourceId: incidentResourceId, kind },
    });
  } catch (auditError) {
    return sendSupabaseError(res, auditError);
  }
  res.status(201).json({ success: true, data, message: 'Incident recorded for human review; no fault or penalty was assigned.' });
});

router.get('/timeline', requireAuth, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  let ownedResourceIds = [];
  if (!isAdministrator(req.user)) {
    const { data: ownedResources, error: resourcesError } = await supabaseAdmin
      .from('resources')
      .select('id')
      .eq('created_by', req.user.profile.id);
    if (resourcesError) return sendSupabaseError(res, resourcesError);
    ownedResourceIds = (ownedResources ?? []).map((resource) => resource.id);
  }
  let bookingQuery = supabaseAdmin
    .from('bookings')
    .select('id,resource_id,student_id,status,decision_reason,start_at,end_at,purpose,created_at,picked_up_at,returned_at,overdue,disputed,resources(name,asset_code,created_by)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (!isAdministrator(req.user)) {
    bookingQuery = ownedResourceIds.length
      ? bookingQuery.or(`student_id.eq.${req.user.profile.id},resource_id.in.(${ownedResourceIds.join(',')})`)
      : bookingQuery.eq('student_id', req.user.profile.id);
  }
  const { data: bookings, error: bookingError } = await bookingQuery;
  if (bookingError) return sendSupabaseError(res, bookingError);

  const bookingIds = (bookings ?? []).map((booking) => booking.id);
  let incidentQuery = supabaseAdmin.from('incidents')
    .select('id,booking_id,resource_id,kind,description,status,created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (!isAdministrator(req.user)) {
    const filters = [`reporter_id.eq.${req.user.profile.id}`];
    if (bookingIds.length) filters.push(`booking_id.in.(${bookingIds.join(',')})`);
    if (ownedResourceIds.length) filters.push(`resource_id.in.(${ownedResourceIds.join(',')})`);
    incidentQuery = incidentQuery.or(filters.join(','));
  }
  const [reportResult, incidentResult, eventResult] =
    await Promise.all([
      bookingIds.length
        ? supabaseAdmin.from('condition_reports').select('*').in('booking_id', bookingIds).order('created_at')
        : Promise.resolve({ data: [], error: null }),
      incidentQuery,
      bookingIds.length
        ? supabaseAdmin.from('audit_events').select('id,actor_id,action,record_type,record_id,reason,details,created_at')
          .eq('record_type', 'booking').in('record_id', bookingIds).order('created_at')
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (reportResult.error) return sendSupabaseError(res, reportResult.error);
  if (incidentResult.error) return sendSupabaseError(res, incidentResult.error);
  if (eventResult.error) return sendSupabaseError(res, eventResult.error);

  const timeline = [
    ...(bookings ?? []).map((item) => ({ type: 'booking', occurred_at: item.created_at, data: item })),
    ...(reportResult.data ?? []).map((item) => ({ type: `condition_${item.stage}`, occurred_at: item.created_at, data: item })),
    ...(incidentResult.data ?? []).map((item) => ({ type: 'incident', occurred_at: item.created_at, data: item })),
    ...(eventResult.data ?? []).map((item) => ({ type: 'audit', occurred_at: item.created_at, data: item })),
  ].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
  res.json({ success: true, data: timeline });
});

router.get('/notifications', requireAuth, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('id,kind,title,message,booking_id,read_at,created_at')
    .eq('user_id', req.user.profile.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return sendSupabaseError(res, error);
  res.json({ success: true, data });
});

router.patch('/notifications/:id/read', requireAuth, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', req.user.profile.id)
    .select('id,read_at')
    .single();
  if (error) return sendSupabaseError(res, error);
  res.json({ success: true, data });
});

router.get('/audit', requireAuth, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  let query = supabaseAdmin
    .from('audit_events')
    .select('id,actor_id,action,record_type,record_id,reason,details,created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (!isAdministrator(req.user)) query = query.eq('actor_id', req.user.profile.id);
  const { data, error } = await query;
  if (error) return sendSupabaseError(res, error);
  res.json({ success: true, data });
});

router.get('/dashboard', requireAuth, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const profile = req.user.profile;
  let ownedResourceIds = [];
  if (!isAdministrator({ profile })) {
    const { data: ownedResources, error: resourcesError } = await supabaseAdmin
      .from('resources')
      .select('id')
      .eq('created_by', profile.id);
    if (resourcesError) return sendSupabaseError(res, resourcesError);
    ownedResourceIds = (ownedResources ?? []).map((resource) => resource.id);
  }
  const [resourcesResult, pendingResult, activeResult, incidentsResult, overdueResult] = await Promise.all([
    supabaseAdmin.from('resources').select('id', { count: 'exact', head: true }).eq('active', true),
    isAdministrator({ profile })
      ? supabaseAdmin.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval')
      : ownedResourceIds.length
        ? supabaseAdmin.from('bookings').select('id', { count: 'exact', head: true })
          .in('resource_id', ownedResourceIds).eq('status', 'pending_approval')
        : Promise.resolve({ count: 0, error: null }),
    supabaseAdmin.from('bookings').select('id', { count: 'exact', head: true })
      .eq('student_id', profile.id).in('status', ['confirmed', 'checked_out']),
    supabaseAdmin.from('incidents').select('id', { count: 'exact', head: true }).in('status', ['reported', 'under_review']),
    (() => {
      let query = supabaseAdmin.from('bookings').select('id', { count: 'exact', head: true })
        .eq('status', 'checked_out').eq('overdue', true);
      if (!isAdministrator({ profile })) query = query.eq('student_id', profile.id);
      return query;
    })(),
  ]);
  if (resourcesResult.error) return sendSupabaseError(res, resourcesResult.error);
  if (pendingResult.error) return sendSupabaseError(res, pendingResult.error);
  if (activeResult.error) return sendSupabaseError(res, activeResult.error);
  if (incidentsResult.error) return sendSupabaseError(res, incidentsResult.error);
  if (overdueResult.error) return sendSupabaseError(res, overdueResult.error);

  const result = {
    resources: resourcesResult.count ?? 0,
    pending_requests: pendingResult.count ?? 0,
    active_bookings: activeResult.count ?? 0,
    incidents_under_review: isAdministrator({ profile }) ? incidentsResult.count ?? 0 : undefined,
    overdue: overdueResult.count ?? 0,
  };
  res.json({ success: true, data: result });
});

export default router;
