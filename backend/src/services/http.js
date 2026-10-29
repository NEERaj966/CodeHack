export function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

export function sendSupabaseError(res, error) {
  if (error?.code === 'PGRST116') return fail(res, 404, 'The requested record was not found.');
  if (error?.code === '23505') return fail(res, 409, 'A record with the same unique value already exists.');
  if (error?.code === '23P01') return fail(res, 409, 'This booking conflicts with another confirmed reservation.');
  if (error?.code === '42501') return fail(res, 403, 'The requested operation is not permitted.');
  if (error?.code === 'PGRST204') {
    console.error(error);
    return fail(res, 503, 'Supabase schema is out of date. Apply the latest database migrations and reload the PostgREST schema cache.');
  }
  if (error?.code === 'P0001' || error?.code === '22023') {
    return fail(res, 422, error.message || 'The request could not be completed because of a booking rule.');
  }
  console.error(error);
  return fail(res, 500, 'Database operation failed. Check server logs for details.');
}

export async function writeAudit(admin, event) {
  const { error } = await admin.from('audit_events').insert(event);
  if (error) throw error;
}

export async function notify(admin, notification) {
  const { error } = await admin.from('notifications').insert(notification);
  if (error) throw error;
}

export function requireOrigin(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  const expected = process.env.CORS_ORIGIN || 'http://localhost:5173';
  if (origin && origin !== expected) {
    return fail(res, 403, 'Request origin is not allowed.');
  }
  next();
}
