import assert from 'node:assert/strict';
import test from 'node:test';
import { sendSupabaseError } from '../src/services/http.js';

test('explains how to resolve a missing Supabase schema column', () => {
  const originalError = console.error;
  let loggedError;
  console.error = (error) => {
    loggedError = error;
  };

  try {
    let responseStatus;
    let responseBody;
    const response = {
      status(status) {
        responseStatus = status;
        return this;
      },
      json(body) {
        responseBody = body;
        return this;
      },
    };
    const supabaseError = {
      code: 'PGRST204',
      message: "Could not find the 'ownership_attested_at' column of 'resources' in the schema cache",
    };

    sendSupabaseError(response, supabaseError);

    assert.equal(responseStatus, 503);
    assert.match(responseBody.message, /Apply the latest database migrations/);
    assert.equal(loggedError, supabaseError);
  } finally {
    console.error = originalError;
  }
});
