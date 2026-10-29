import express from 'express';
import cors from 'cors';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import resourceRoutes from './routes/resources.js';
import bookingRoutes from './routes/bookings.js';
import operationRoutes from './routes/operations.js';
import adminRoutes from './routes/admin.js';
import trainingRoutes from './routes/training.js';
import { env } from './config/env.js';
import { requireOrigin } from './services/http.js';

const app = express();

app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  }),
);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requireOrigin);

app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', trainingRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api', operationRoutes);

app.get('/', (req, res) => {
  res.json({
    app: 'Campus Resource Intelligence API',
    status: 'running',
    database: 'Supabase',
    docs: '/api/health',
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error(err);
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
  const message = status === 413
    ? 'Request payload is too large.'
    : status === 400
      ? 'Malformed request body.'
      : 'Something went wrong on the server.';
  res.status(status).json({
    success: false,
    message,
  });
});

export default app;
