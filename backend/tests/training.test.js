import test from 'node:test';
import assert from 'node:assert/strict';
import {
  documentExtension,
  eligibleTrainingCodes,
  isValidTrainingCode,
  normalizeTrainingCode,
} from '../src/services/training.js';

test('normalizes and validates approved training-code identifiers', () => {
  assert.equal(normalizeTrainingCode(' lab-safety-101 '), 'LAB-SAFETY-101');
  assert.equal(isValidTrainingCode('LAB-SAFETY-101'), true);
  assert.equal(isValidTrainingCode('A'), false);
  assert.equal(isValidTrainingCode('LAB SAFETY'), false);
  assert.equal(isValidTrainingCode('x'.repeat(41)), false);
});

test('accepts only files whose signatures match supported certificate types', () => {
  assert.equal(documentExtension('application/pdf', Buffer.from('%PDF-1.7')), 'pdf');
  assert.equal(documentExtension('application/pdf', Buffer.from('not a pdf')), null);
  assert.equal(documentExtension('image/jpeg', Buffer.from([0xff, 0xd8, 0xff])), 'jpg');
  assert.equal(documentExtension('image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
  assert.equal(documentExtension('image/png', Buffer.from('not an image')), null);
  assert.equal(documentExtension('text/plain', Buffer.from('plain text')), null);
});

test('only approved certifications for active catalog codes count toward eligibility', () => {
  assert.deepEqual(eligibleTrainingCodes([
    { training_code: 'APPROVED-1', status: 'approved', training_catalog: { active: true } },
    { training_code: 'PENDING-1', status: 'pending', training_catalog: { active: true } },
    { training_code: 'REJECTED-1', status: 'rejected', training_catalog: { active: true } },
    { training_code: 'INACTIVE-1', status: 'approved', training_catalog: { active: false } },
  ]), ['APPROVED-1']);
});
