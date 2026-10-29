import assert from 'node:assert/strict';
import test from 'node:test';
import { sendSupabaseError } from '../src/services/http.js';

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('explains how to resolve a missing Supabase schema column', () => {
  const originalError = console.error;
  let loggedError;
  console.error = (error) => {
    loggedError = error;
  };

  try {
    const response = createResponse();
    const supabaseError = {
      code: 'PGRST204',
      message: "Could not find the 'ownership_attested_at' column of 'resources' in the schema cache",
    };

    sendSupabaseError(response, supabaseError);

    assert.equal(response.statusCode, 503);
    assert.match(response.body.message, /Apply the latest database migrations/);
    assert.equal(loggedError, supabaseError);
  } finally {
    console.error = originalError;
  }
});

test('returns the database rule message for booking validation errors', () => {
  const response = createResponse();

  sendSupabaseError(response, {
    code: 'P0001',
    message: 'FairShare limit reached: maximum active bookings',
  });

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.message, 'FairShare limit reached: maximum active bookings');
});

test('uses a clear fallback when a booking validation error has no message', () => {
  const response = createResponse();

  sendSupabaseError(response, { code: '22023' });

  assert.equal(response.statusCode, 422);
  assert.match(response.body.message, /booking rule/);
});
