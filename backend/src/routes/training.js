import crypto from 'node:crypto';
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { isAdministrator, requireAuth, requireRoles } from '../middleware/auth.js';
import { fail, sendSupabaseError, writeAudit } from '../services/http.js';
import { documentExtension, isValidTrainingCode, normalizeTrainingCode } from '../services/training.js';

const router = express.Router();
const administrator = requireRoles('administrator');
const trainingBucket = 'member-certifications';

function dbUnavailable(res) {
  return fail(res, 503, 'Supabase service-role access is not configured.');
}

router.get('/training-codes', requireAuth, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  let query = supabaseAdmin
    .from('training_catalog')
    .select('code,title,description,active')
    .order('title');
  if (!isAdministrator(req.user)) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) return sendSupabaseError(res, error);
  res.json({ success: true, data });
});

router.get('/profile', requireAuth, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const { data: certifications, error } = await supabaseAdmin
    .from('training_certifications')
    .select('id,training_code,status,review_reason,reviewed_at,created_at,training_catalog!inner(title,active)')
    .eq('user_id', req.user.profile.id)
    .order('created_at', { ascending: false });
  if (error) return sendSupabaseError(res, error);
  res.json({
    success: true,
    data: {
      profile: req.user.profile,
      certifications: certifications ?? [],
    },
  });
});

router.post(
  '/profile/certifications',
  requireAuth,
  express.raw({ type: ['application/pdf', 'image/jpeg', 'image/png'], limit: '5mb' }),
  async (req, res) => {
    if (!supabaseAdmin) return dbUnavailable(res);
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return fail(res, 415, 'Upload a PDF, JPEG, or PNG certificate no larger than 5 MB.');
    }
    const trainingCode = normalizeTrainingCode(req.get('x-training-code'));
    if (!trainingCode) return fail(res, 400, 'Choose an approved training code.');
    const { data: catalogEntry, error: catalogError } = await supabaseAdmin
      .from('training_catalog')
      .select('code')
      .eq('code', trainingCode)
      .eq('active', true)
      .maybeSingle();
    if (catalogError) return sendSupabaseError(res, catalogError);
    if (!catalogEntry) return fail(res, 400, 'Choose an active approved training code from the catalog.');

    const extension = documentExtension(req.get('content-type'), req.body);
    if (!extension) return fail(res, 415, 'The certificate file does not match its PDF, JPEG, or PNG content type.');
    const documentPath = `${req.user.profile.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(trainingBucket)
      .upload(documentPath, req.body, { contentType: req.get('content-type'), upsert: false });
    if (uploadError) return sendSupabaseError(res, uploadError);

    const { data, error } = await supabaseAdmin
      .from('training_certifications')
      .insert({
        user_id: req.user.profile.id,
        training_code: trainingCode,
        document_path: documentPath,
      })
      .select('id,training_code,status,created_at')
      .single();
    if (error) {
      const { error: cleanupError } = await supabaseAdmin.storage.from(trainingBucket).remove([documentPath]);
      if (cleanupError) {
        console.error('Unable to remove an unclaimed training certificate upload:', cleanupError);
        return fail(res, 500, 'The certificate record could not be saved, and its uploaded file could not be cleaned up. Contact an administrator.');
      }
      if (error.code === '23505') {
        return fail(res, 409, 'A certification for this training code already exists. Remove the existing entry before submitting a replacement.');
      }
      return sendSupabaseError(res, error);
    }
    try {
      await writeAudit(supabaseAdmin, {
        actor_id: req.user.profile.id,
        action: 'training_certification.submitted',
        record_type: 'training_certification',
        record_id: data.id,
        details: { trainingCode },
      });
    } catch (auditError) {
      return sendSupabaseError(res, auditError);
    }
    res.status(201).json({ success: true, data });
  },
);

router.get('/profile/certifications/:id/document', requireAuth, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  let query = supabaseAdmin
    .from('training_certifications')
    .select('document_path,user_id')
    .eq('id', req.params.id);
  if (!isAdministrator(req.user)) query = query.eq('user_id', req.user.profile.id);
  const { data: certification, error } = await query.single();
  if (error) return sendSupabaseError(res, error);
  const { data, error: storageError } = await supabaseAdmin.storage
    .from(trainingBucket)
    .createSignedUrl(certification.document_path, 300);
  if (storageError) return sendSupabaseError(res, storageError);
  res.json({ success: true, url: data.signedUrl, expires_in: 300 });
});

router.delete('/profile/certifications/:id', requireAuth, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const { data: certification, error: lookupError } = await supabaseAdmin
    .from('training_certifications')
    .select('id,training_code,document_path')
    .eq('id', req.params.id)
    .eq('user_id', req.user.profile.id)
    .single();
  if (lookupError) return sendSupabaseError(res, lookupError);

  const { error: deleteError } = await supabaseAdmin
    .from('training_certifications')
    .delete()
    .eq('id', certification.id);
  if (deleteError) return sendSupabaseError(res, deleteError);
  try {
    await writeAudit(supabaseAdmin, {
      actor_id: req.user.profile.id,
      action: 'training_certification.removed',
      record_type: 'training_certification',
      record_id: certification.id,
      details: { trainingCode: certification.training_code },
    });
  } catch (auditError) {
    return sendSupabaseError(res, auditError);
  }
  const { error: storageError } = await supabaseAdmin.storage
    .from(trainingBucket)
    .remove([certification.document_path]);
  if (storageError) {
    console.error('Unable to remove a deleted training certificate document:', storageError);
    return fail(res, 500, 'The certification was removed, but its private file could not be deleted. Contact an administrator.');
  }
  res.json({ success: true, message: 'Certification and its uploaded document were removed.' });
});

router.post('/admin/training-codes', requireAuth, administrator, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const code = normalizeTrainingCode(req.body?.code);
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  if (!isValidTrainingCode(code) || title.length < 2 || title.length > 120 || description.length > 1000) {
    return fail(res, 400, 'Provide a valid training code, a 2-120 character title, and a description no longer than 1000 characters.');
  }
  const { data, error } = await supabaseAdmin
    .from('training_catalog')
    .insert({ code, title, description, created_by: req.user.profile.id })
    .select('code,title,description,active')
    .single();
  if (error) return sendSupabaseError(res, error);
  try {
    await writeAudit(supabaseAdmin, {
      actor_id: req.user.profile.id,
      action: 'training_code.created',
      record_type: 'training_code',
      record_id: data.code,
      details: { title: data.title },
    });
  } catch (auditError) {
    return sendSupabaseError(res, auditError);
  }
  res.status(201).json({ success: true, data });
});

router.patch('/admin/training-codes/:code', requireAuth, administrator, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const code = normalizeTrainingCode(req.params.code);
  const { active } = req.body ?? {};
  if (!isValidTrainingCode(code) || typeof active !== 'boolean') {
    return fail(res, 400, 'Provide a valid training code and active boolean.');
  }
  const { data, error } = await supabaseAdmin
    .from('training_catalog')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('code', code)
    .select('code,title,description,active')
    .single();
  if (error) return sendSupabaseError(res, error);
  try {
    await writeAudit(supabaseAdmin, {
      actor_id: req.user.profile.id,
      action: active ? 'training_code.activated' : 'training_code.deactivated',
      record_type: 'training_code',
      record_id: data.code,
      details: { active },
    });
  } catch (auditError) {
    return sendSupabaseError(res, auditError);
  }
  res.json({ success: true, data });
});

router.get('/admin/training-certifications', requireAuth, administrator, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const { data: certifications, error } = await supabaseAdmin
    .from('training_certifications')
    .select('id,user_id,training_code,status,created_at,document_path,profiles!training_certifications_user_id_fkey(full_name,email),training_catalog!inner(title)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) return sendSupabaseError(res, error);
  const data = (certifications ?? []).map((certification) => ({
    id: certification.id,
    user_id: certification.user_id,
    training_code: certification.training_code,
    status: certification.status,
    created_at: certification.created_at,
    profiles: certification.profiles,
    training_catalog: certification.training_catalog,
  }));
  res.json({ success: true, data });
});

router.patch('/admin/training-certifications/:id', requireAuth, administrator, async (req, res) => {
  if (!supabaseAdmin) return dbUnavailable(res);
  const { status, reason } = req.body ?? {};
  if (!['approved', 'rejected'].includes(status)
      || typeof reason !== 'string'
      || reason.trim().length < 3
      || reason.trim().length > 1000) {
    return fail(res, 400, 'Choose approved or rejected and provide a review reason of 3-1000 characters.');
  }
  if (status === 'approved') {
    const { data: certification, error: certificationError } = await supabaseAdmin
      .from('training_certifications')
      .select('training_catalog!inner(active)')
      .eq('id', req.params.id)
      .eq('status', 'pending')
      .single();
    if (certificationError) return sendSupabaseError(res, certificationError);
    if (!certification.training_catalog.active) {
      return fail(res, 409, 'This training code is inactive. Reactivate it before approving its certifications.');
    }
  }
  const { data, error } = await supabaseAdmin
    .from('training_certifications')
    .update({
      status,
      reviewer_id: req.user.profile.id,
      reviewed_at: new Date().toISOString(),
      review_reason: reason.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .eq('status', 'pending')
    .select('id,user_id,training_code,status,review_reason,reviewed_at')
    .single();
  if (error) return sendSupabaseError(res, error);
  try {
    await writeAudit(supabaseAdmin, {
      actor_id: req.user.profile.id,
      action: `training_certification.${status}`,
      record_type: 'training_certification',
      record_id: data.id,
      reason: reason.trim(),
      details: { userId: data.user_id, trainingCode: data.training_code },
    });
    const { error: notificationError } = await supabaseAdmin.from('notifications').insert({
      user_id: data.user_id,
      kind: 'training_certification.review',
      title: `Training certification ${status}`,
      message: `${data.training_code}: ${reason.trim()}`,
    });
    if (notificationError) throw notificationError;
  } catch (writeError) {
    return sendSupabaseError(res, writeError);
  }
  res.json({ success: true, data });
});

export default router;
