import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const port = 5051;
const backendDir = fileURLToPath(new URL('..', import.meta.url));

async function waitForHealth() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://localhost:${port}/api/health`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      // Server still starting
    }

    await delay(500);
  }

  throw new Error(`Backend did not become healthy on port ${port}`);
}

async function main() {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      SUPABASE_URL: '',
      SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  try {
    const health = await waitForHealth();

    assert.equal(health.status, 'ok');
    assert.equal(health.service, 'campus-resource-intelligence-backend');
    assert.equal(health.database, 'not_configured');
    const readinessResponse = await fetch(`http://localhost:${port}/api/health/ready`);
    assert.equal(readinessResponse.status, 503);
    assert.equal((await readinessResponse.json()).database, 'not_configured');

    console.log('Backend sanity test passed');
    console.log(`Health response: ${JSON.stringify(health)}`);
  } finally {
    let closed = false;
    child.once('close', () => { closed = true; });
    child.kill('SIGTERM');

    setTimeout(() => {
      if (!closed) {
        child.kill('SIGKILL');
      }
    }, 2000).unref();

    if (stderr && !stdout.includes('Campus Resource Intelligence API running')) {
      console.error(stderr);
    }
  }
}

main().catch((error) => {
  console.error('Backend sanity test failed');
  console.error(error);
  process.exit(1);
});
