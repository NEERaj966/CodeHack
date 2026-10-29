import app from './app.js';
import { env } from './config/env.js';
import { startScheduledJobs } from './services/scheduledJobs.js';

const port = env.port;

app.listen(port, () => {
  console.log(`Campus Resource Intelligence API running on http://localhost:${port}`);
  startScheduledJobs();
});
