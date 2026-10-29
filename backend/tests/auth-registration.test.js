import assert from 'node:assert/strict';
import test from 'node:test';
import { isDuplicateSignup } from '../src/services/authRegistration.js';

test('identifies existing-email errors returned by Supabase Auth', () => {
  assert.equal(isDuplicateSignup(null, { code: 'email_exists' }), true);
  assert.equal(isDuplicateSignup(null, { code: 'user_already_exists' }), true);
});

test('identifies Supabase obfuscated duplicate signup responses', () => {
  assert.equal(isDuplicateSignup({ user: { identities: [] } }, null), true);
});

test('does not classify a new signup response as a duplicate', () => {
  assert.equal(isDuplicateSignup({ user: { identities: [{ id: 'identity-id' }] } }, null), false);
  assert.equal(isDuplicateSignup({ user: { identities: null } }, null), false);
  assert.equal(isDuplicateSignup({ user: null }, null), false);
});
