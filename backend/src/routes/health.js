import express from 'express';
import { isSupabaseAdminConfigured } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'campus-resource-intelligence-backend',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: isSupabaseAdminConfigured ? 'configured' : 'not_configured',
  });
});

router.get('/health/ready', async (req, res, next) => {
  if (!supabaseAdmin) {
    return res.status(503).json({
      status: 'not_ready',
      database: 'not_configured',
      message: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env.',
    });
  }

  const { error } = await supabaseAdmin.from('booking_policies').select('singleton').limit(1);
  if (error) return next(error);

  res.status(200).json({ status: 'ready', database: 'connected' });
});

export default router;
