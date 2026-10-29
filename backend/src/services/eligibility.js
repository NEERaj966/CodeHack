export function getEligibilityFailure(profile, resource) {
  const rules = resource.eligibility_rules ?? {};
  const allowedDepartments = rules.allowed_departments ?? [];
  if (allowedDepartments.length && !allowedDepartments.includes(profile.department)) {
    return 'This resource is restricted to approved departments.';
  }
  if (rules.minimum_year && (!profile.student_year || profile.student_year < rules.minimum_year)) {
    return `This resource requires members to be in year ${rules.minimum_year} or later.`;
  }
  const requiredTraining = rules.required_training ?? [];
  const completedTraining = profile.training_codes ?? [];
  const missingTraining = requiredTraining.filter((code) => !completedTraining.includes(code));
  if (missingTraining.length) {
    return `Required training is missing: ${missingTraining.join(', ')}.`;
  }
  return null;
}

export function isAdministrator(role) {
  return role === 'administrator';
}
