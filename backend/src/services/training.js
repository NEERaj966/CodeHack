export function normalizeTrainingCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export function isValidTrainingCode(value) {
  return /^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(value);
}

export function eligibleTrainingCodes(certifications) {
  return certifications
    .filter((certification) => (
      certification.status === 'approved' && certification.training_catalog?.active === true
    ))
    .map((certification) => certification.training_code);
}

export function documentExtension(contentType, bytes) {
  if (contentType === 'application/pdf' && bytes.subarray(0, 5).toString() === '%PDF-') return 'pdf';
  if (contentType === 'image/jpeg'
      && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (contentType === 'image/png'
      && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return null;
}
