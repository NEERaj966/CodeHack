import crypto from 'node:crypto';
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { isAdministrator, requireAuth } from '../middleware/auth.js';
import { fail, sendSupabaseError, writeAudit } from '../services/http.js';

const router = express.Router();
const categories = ['laboratory', 'IT', 'sports', 'facilities', 'event_equipment'];
const resourceTypes = ['equipment', 'space', 'facility'];
const resourceStatuses = ['available', 'reserved', 'in_use', 'under_maintenance', 'unavailable', 'retired'];
const approvalModes = ['auto', 'manual'];
const handoverModes = ['staff_attended', 'self_service'];
function dbUnavailable(res) {
  return fail(res, 503, 'Supabase service-role access is not configured.');
}

function validateResource(body, creating = false) {
  const required = ['name', 'category', 'location', 'department', 'institution'];
  if (creating && required.some((key) => typeof body[key] !== 'string' || !body[key].trim())) {
    return 'Name, category, location, department, and institution are required.';
  }
  for (const field of ['name', 'asset_code', 'location', 'department', 'institution']) {
    if (typeof body[field] === 'string' && body[field].length > 160) return `${field} must be 160 characters or fewer.`;
  }
  if (typeof body.description === 'string' && body.description.length > 5000) return 'description must be 5000 characters or fewer.';
  if (body.category !== undefined && !categories.includes(body.category)) return 'Unsupported resource category.';
  if (body.resource_type !== undefined && !resourceTypes.includes(body.resource_type)) return 'Unsupported resource type.';
  if (body.status !== undefined && !resourceStatuses.includes(body.status)) return 'Unsupported resource status.';
  if (body.approval_mode !== undefined && !approvalModes.includes(body.approval_mode)) return 'Unsupported approval mode.';
  if (body.handover_mode !== undefined && !handoverModes.includes(body.handover_mode)) return 'Unsupported handover mode.';
  if (body.active !== undefined && typeof body.active !== 'boolean') return 'active must be true or false.';
  if (body.restricted !== undefined && typeof body.restricted !== 'boolean') return 'restricted must be true or false.';
  if (body.high_value !== undefined && typeof body.high_value !== 'boolean') return 'high_value must be true or false.';
  if (body.eligibility_rules !== undefined
      && (!body.eligibility_rules || typeof body.eligibility_rules !== 'object' || Array.isArray(body.eligibility_rules))) {
    return 'Eligibility rules must be an object.';
  }
  const rules = body.eligibility_rules ?? {};
  if (rules.allowed_departments !== undefined
      && (!Array.isArray(rules.allowed_departments) || rules.allowed_departments.some((value) => typeof value !== 'string'))) {
    return 'Eligibility allowed_departments must be an array of names.';
  }
  if (rules.required_training !== undefined
      && (!Array.isArray(rules.required_training) || rules.required_training.some((value) => typeof value !== 'string'))) {
    return 'Eligibility required_training must be an array of codes.';
  }
  if (rules.minimum_year !== undefined
      && (!Number.isInteger(rules.minimum_year) || rules.minimum_year < 1 || rules.minimum_year > 10)) {
    return 'Eligibility minimum_year must be an integer from 1 to 10.';
  }
  if (body.restricted && body.approval_mode === 'auto') return 'Restricted resources must use manual approval.';
  if (body.restricted && body.handover_mode === 'self_service') return 'Restricted resources must use staff-attended handover.';
  if (body.high_value && body.handover_mode === 'self_service') return 'High-value resources must use staff-attended handover.';
  return null;
}

router.get('/', async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  let query = supabaseAdmin
    .from('resources')
    .select('id,asset_code,name,description,category,resource_type,location,department,institution,condition,status,approval_mode,handover_mode,restricted,high_value,eligibility_rules,usage_terms,available_from,available_until,photo_path,created_by', { count: 'exact' })
    .eq('active', true)
    .neq('status', 'retired');

  if (typeof req.query.category === 'string' && !categories.includes(req.query.category)) {
    return fail(res, 400, 'Unsupported resource category filter.');
  }
  if (typeof req.query.resource_type === 'string' && !resourceTypes.includes(req.query.resource_type)) {
    return fail(res, 400, 'Unsupported resource type filter.');
  }
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    const term = req.query.q.trim().slice(0, 100).replace(/[,%()"'\\.*_]/g, ' ').replace(/\s+/g, ' ').trim();
    if (term) query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%,asset_code.ilike.%${term}%`);
  }
  if (typeof req.query.category === 'string') query = query.eq('category', req.query.category);
  if (typeof req.query.location === 'string' && req.query.location.trim()) {
    const locationFilter = req.query.location.trim().slice(0, 100).replace(/[%_,()"'\\]/g, ' ');
    query = query.ilike('location', `%${locationFilter}%`);
  }
  if (typeof req.query.resource_type === 'string') query = query.eq('resource_type', req.query.resource_type);

  const { data, error, count } = await query
    .order('name')
    .range((page - 1) * limit, page * limit - 1);
  if (error) return sendSupabaseError(res, error);

  let resources = data ?? [];
  const startAt = typeof req.query.start_at === 'string' ? req.query.start_at : null;
  const endAt = typeof req.query.end_at === 'string' ? req.query.end_at : null;
  if (startAt || endAt) {
    const start = Date.parse(startAt ?? '');
    const end = Date.parse(endAt ?? '');
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      return fail(res, 400, 'Provide a valid start_at and end_at window.');
    }
    const ids = resources.map((resource) => resource.id);
    if (ids.length) {
      const { data: overlaps, error: overlapError } = await supabaseAdmin
        .from('bookings')
        .select('resource_id')
        .in('resource_id', ids)
        .in('status', ['confirmed', 'checked_out'])
        .lt('start_at', new Date(end).toISOString())
        .gt('end_at', new Date(start).toISOString());
      if (overlapError) return sendSupabaseError(res, overlapError);
      const unavailable = new Set((overlaps ?? []).map((booking) => booking.resource_id));
      resources = resources.filter((resource) => (
        !unavailable.has(resource.id)
        && (!resource.available_from || Date.parse(resource.available_from) <= start)
        && (!resource.available_until || Date.parse(resource.available_until) >= end)
      ));
    }
  }

  res.json({ success: true, data: resources, page, limit, total: count ?? 0 });
});

router.get('/mine', requireAuth, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const { data, error } = await supabaseAdmin
    .from('resources')
    .select('id,asset_code,name,category,resource_type,location,status,approval_mode,created_at')
    .eq('created_by', req.user.profile.id)
    .order('created_at', { ascending: false });
  if (error) return sendSupabaseError(res, error);
  res.json({ success: true, data });
});

router.get('/:id/details', requireAuth, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const { data: resource, error: resourceError } = await supabaseAdmin
    .from('resources')
    .select('*,lister:profiles!resources_created_by_fkey(id,full_name)')
    .eq('id', req.params.id)
    .single();
  if (resourceError) return sendSupabaseError(res, resourceError);

  const isOwnerOrAdmin = isAdministrator(req.user) || resource.created_by === req.user.profile.id;
  const { data: bookings, error: bookingsError } = await supabaseAdmin
    .from('bookings')
    .select('id,student_id,start_at,end_at,status,purpose,decision_reason,created_at,picked_up_at,returned_at,requester:profiles!bookings_student_id_fkey(id,full_name)')
    .eq('resource_id', resource.id)
    .in('status', ['pending_approval', 'confirmed', 'checked_out', 'waitlisted', 'returned'])
    .order('created_at', { ascending: true });
  if (bookingsError) return sendSupabaseError(res, bookingsError);

  const { data: conditionReports, error: reportsError } = await supabaseAdmin
    .from('condition_reports')
    .select('id,booking_id,stage,notes,checklist,author_id,created_at,author:profiles!condition_reports_author_id_fkey(id,full_name)')
    .eq('resource_id', resource.id)
    .order('created_at', { ascending: false })
    .limit(20);
  if (reportsError) return sendSupabaseError(res, reportsError);

  const visibleBookings = (bookings ?? []).filter((booking) => (
    isOwnerOrAdmin || booking.student_id === req.user.profile.id
  ));
  const currentBooking = (bookings ?? []).find((booking) => booking.status === 'checked_out') ?? null;
  const recentReturn = (bookings ?? [])
    .filter((booking) => booking.status === 'returned' && booking.returned_at)
    .sort((a, b) => Date.parse(b.returned_at) - Date.parse(a.returned_at))[0] ?? null;
  const now = Date.now();
  const hasCurrentReservation = (bookings ?? []).some((booking) => (
    booking.status === 'confirmed'
      && Date.parse(booking.start_at) <= now
      && Date.parse(booking.end_at) > now
  ));
  res.json({
    success: true,
    data: {
      resource: {
        ...resource,
        lister: resource.lister,
        available_window: {
          from: resource.available_from,
          until: resource.available_until,
        },
      },
      current_renter: currentBooking
        ? {
          booking_id: currentBooking.id,
          name: isOwnerOrAdmin || currentBooking.student_id === req.user.profile.id
            ? currentBooking.requester?.full_name
            : null,
          start_at: currentBooking.start_at,
          scheduled_end_at: currentBooking.end_at,
          returned_early: Boolean(currentBooking.returned_at && Date.parse(currentBooking.returned_at) < Date.parse(currentBooking.end_at)),
        }
        : null,
      recent_return: recentReturn
        ? {
          returned_at: recentReturn.returned_at,
          scheduled_end_at: recentReturn.end_at,
          returned_early: Date.parse(recentReturn.returned_at) < Date.parse(recentReturn.end_at),
        }
        : null,
      available_now: resource.status === 'available' && !currentBooking && !hasCurrentReservation,
      bookings: visibleBookings,
      waitlist: isOwnerOrAdmin
        ? (bookings ?? []).filter((booking) => booking.status === 'waitlisted')
        : [],
      waitlist_count: (bookings ?? []).filter((booking) => booking.status === 'waitlisted').length,
      condition_reports: isOwnerOrAdmin
        ? conditionReports
        : (conditionReports ?? []).filter((report) => visibleBookings.some((booking) => booking.id === report.booking_id)),
      can_manage: isOwnerOrAdmin,
    },
  });
});

router.get('/:id/photo', async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const { data: resource, error } = await supabaseAdmin
    .from('resources')
    .select('photo_path')
    .eq('id', req.params.id)
    .eq('active', true)
    .single();
  if (error) return sendSupabaseError(res, error);
  if (!resource.photo_path) return fail(res, 404, 'No photo is available for this resource.');
  const { data, error: storageError } = await supabaseAdmin.storage
    .from('resource-photos')
    .createSignedUrl(resource.photo_path, 300);
  if (storageError) return sendSupabaseError(res, storageError);
  res.json({ success: true, url: data.signedUrl, expires_in: 300 });
});

router.post('/', requireAuth, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const issue = validateResource(req.body ?? {}, true);
  if (issue) return fail(res, 400, issue);
  const body = req.body;
  if (body.institutional_ownership_confirmed !== true) {
    return fail(res, 400, 'Confirm that you are authorized to list this college-owned resource.');
  }
  const record = {
    asset_code: typeof body.asset_code === 'string' && body.asset_code.trim()
      ? body.asset_code.trim().toUpperCase()
      : `CRI-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    name: body.name.trim(),
    description: typeof body.description === 'string' ? body.description.trim() : '',
    category: body.category,
    resource_type: body.resource_type || 'equipment',
    location: body.location.trim(),
    department: body.department.trim(),
    institution: body.institution.trim(),
    condition: typeof body.condition === 'string' ? body.condition.trim() : 'good',
    status: body.status || 'available',
    approval_mode: body.approval_mode || 'manual',
    handover_mode: body.handover_mode || 'staff_attended',
    restricted: Boolean(body.restricted),
    high_value: Boolean(body.high_value),
    eligibility_rules: body.eligibility_rules ?? {},
    usage_terms: typeof body.usage_terms === 'string' ? body.usage_terms.trim() : '',
    available_from: body.available_from || null,
    available_until: body.available_until || null,
    created_by: req.user.profile.id,
    ownership_attested_by: req.user.profile.id,
    ownership_attested_at: new Date().toISOString(),
  };
  if (record.restricted && record.approval_mode === 'auto') return fail(res, 400, 'Restricted resources must use manual approval.');
  if ((record.restricted || record.high_value) && record.handover_mode !== 'staff_attended') {
    return fail(res, 400, 'Restricted and high-value resources require staff-attended handover.');
  }

  const { data, error } = await supabaseAdmin.from('resources').insert(record).select().single();
  if (error) return sendSupabaseError(res, error);
  try {
    await writeAudit(supabaseAdmin, {
      actor_id: req.user.profile.id,
      action: 'resource.created',
      record_type: 'resource',
      record_id: data.id,
      details: { assetCode: data.asset_code, institutionalOwnershipConfirmed: true },
    });
  } catch (auditError) {
    return sendSupabaseError(res, auditError);
  }
  res.status(201).json({ success: true, data });
});

async function requireResourceOwnerOrAdmin(req, res, next) {
  if (!supabaseAdmin) return dbUnavailable(res);
  if (isAdministrator(req.user)) return next();
  const { data: resource, error } = await supabaseAdmin
    .from('resources')
    .select('created_by')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) return sendSupabaseError(res, error);
  if (!resource) return fail(res, 404, 'Resource not found.');
  if (resource.created_by !== req.user.profile.id) {
    return fail(res, 403, 'Only the resource lister or an administrator can manage this resource.');
  }
  next();
}

router.patch('/:id', requireAuth, requireResourceOwnerOrAdmin, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const issue = validateResource(req.body ?? {});
  if (issue) return fail(res, 400, issue);
  const editable = [
    'name', 'description', 'category', 'resource_type', 'location', 'department', 'institution',
    'condition', 'status', 'active', 'approval_mode', 'handover_mode', 'restricted', 'high_value',
    'eligibility_rules', 'usage_terms', 'available_from', 'available_until',
  ];
  const update = Object.fromEntries(Object.entries(req.body).filter(([key]) => editable.includes(key)));
  if (!Object.keys(update).length) return fail(res, 400, 'No supported resource fields were supplied.');
  const { data: currentResource, error: currentResourceError } = await supabaseAdmin
    .from('resources')
    .select('restricted,high_value,approval_mode,handover_mode')
    .eq('id', req.params.id)
    .single();
  if (currentResourceError) return sendSupabaseError(res, currentResourceError);
  const restricted = update.restricted ?? currentResource.restricted;
  const highValue = update.high_value ?? currentResource.high_value;
  const approvalMode = update.approval_mode ?? currentResource.approval_mode;
  const handoverMode = update.handover_mode ?? currentResource.handover_mode;
  if (restricted && approvalMode === 'auto') return fail(res, 400, 'Restricted resources must use manual approval.');
  if ((restricted || highValue) && handoverMode === 'self_service') {
    return fail(res, 400, 'Restricted and high-value resources require staff-attended handover.');
  }
  if (update.status === 'retired') update.active = false;
  update.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('resources')
    .update(update)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return sendSupabaseError(res, error);
  try {
    await writeAudit(supabaseAdmin, {
      actor_id: req.user.profile.id,
      action: update.status === undefined ? 'resource.updated' : 'resource.status_changed',
      record_type: 'resource',
      record_id: data.id,
      reason: typeof req.body.reason === 'string' ? req.body.reason.trim() : null,
      details: { changedFields: Object.keys(update).filter((key) => key !== 'updated_at') },
    });
  } catch (auditError) {
    return sendSupabaseError(res, auditError);
  }
  res.json({ success: true, data });
});

router.post(
  '/:id/photo',
  requireAuth,
  requireResourceOwnerOrAdmin,
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }),
  async (req, res) => {
    if (!supabaseAdmin) return dbUnavailable(res);
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return fail(res, 415, 'Upload a JPEG, PNG, or WebP image no larger than 5 MB.');
    }
    const { data: resource, error: resourceError } = await supabaseAdmin
      .from('resources')
      .select('id')
      .eq('id', req.params.id)
      .single();
    if (resourceError) return sendSupabaseError(res, resourceError);

    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[req.get('content-type')];
    if (!extension) return fail(res, 415, 'Unsupported image type.');
    const bytes = req.body;
    const validSignature = extension === 'jpg'
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : extension === 'png'
        ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
    if (!validSignature) return fail(res, 415, 'The uploaded file does not match its declared image type.');
    const objectPath = `${resource.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('resource-photos')
      .upload(objectPath, req.body, { contentType: req.get('content-type'), upsert: false });
    if (uploadError) return sendSupabaseError(res, uploadError);
    const { error: updateError } = await supabaseAdmin
      .from('resources')
      .update({ photo_path: objectPath, updated_at: new Date().toISOString() })
      .eq('id', resource.id);
    if (updateError) return sendSupabaseError(res, updateError);

    res.status(201).json({ success: true, message: 'Resource photo uploaded.', path: objectPath });
  },
);

export default router;
