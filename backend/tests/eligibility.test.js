import assert from 'node:assert/strict';
import test from 'node:test';
import { getEligibilityFailure, isAdministrator } from '../src/services/eligibility.js';

const member = {
  department: 'Engineering',
  student_year: 2,
  training_codes: ['LAB-INTRO'],
};

test('allows a verified member profile that meets resource eligibility rules', () => {
  assert.equal(getEligibilityFailure(member, {
    eligibility_rules: {
      allowed_departments: ['Engineering'],
      minimum_year: 2,
      required_training: ['LAB-INTRO'],
    },
  }), null);
});

test('explains department, year, and training eligibility failures', () => {
  assert.match(getEligibilityFailure({ ...member, department: 'Arts' }, {
    eligibility_rules: { allowed_departments: ['Engineering'] },
  }), /approved departments/);
  assert.match(getEligibilityFailure({ ...member, student_year: 1 }, {
    eligibility_rules: { minimum_year: 2 },
  }), /year 2/);
  assert.match(getEligibilityFailure({ ...member, training_codes: [] }, {
    eligibility_rules: { required_training: ['LAB-INTRO'] },
  }), /LAB-INTRO/);
});

test('recognizes only administrators for global administrative operations', () => {
  assert.equal(isAdministrator('administrator'), true);
  assert.equal(isAdministrator('member'), false);
  assert.equal(isAdministrator('student'), false);
});
