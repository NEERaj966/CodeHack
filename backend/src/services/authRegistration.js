const duplicateSignupCodes = new Set(['email_exists', 'user_already_exists']);

export function isDuplicateSignup(data, error) {
  return duplicateSignupCodes.has(error?.code)
    || (Array.isArray(data?.user?.identities) && data.user.identities.length === 0);
}
