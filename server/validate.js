/**
 * validate.js — input sanitization and validation for the volunteer API.
 * All user-supplied strings pass through here before touching the database.
 */
const { WARD_NAMES } = require('./wards');

/** Allowed values for interest_area — must match the frontend <select> options. */
const INTEREST_AREAS = [
  'Door-to-Door Canvassing',
  'Social Media Advocacy',
  'Event Logistics',
  'Polling Unit Agent',
];

/**
 * Sanitize a free-text string: coerce to string, strip control characters,
 * collapse internal whitespace, trim, and cap the length.
 */
function sanitizeString(value, maxLength = 120) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, '') // strip control characters
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Normalize a Nigerian mobile number to E.164 (+234XXXXXXXXXX).
 * Accepts: 08031234567, 8031234567 (rare), 2348031234567, +234 803 123 4567.
 * Returns the normalized number, or null if invalid.
 */
function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  let digits = raw.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+234')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('234')) digits = '0' + digits.slice(3);
  // Nigerian mobile: 0 + [789] + [01] + 8 digits (e.g. 0803..., 0701..., 0912...)
  if (!/^0[789][01]\d{8}$/.test(digits)) return null;
  return '+234' + digits.slice(1);
}

/**
 * Validate a raw volunteer registration payload.
 * Returns { ok: true, data } with a clean record, or { ok: false, errors }.
 */
function validateVolunteerPayload(body) {
  const errors = {};
  const src = body && typeof body === 'object' ? body : {};

  const fullName = sanitizeString(src.full_name, 120);
  if (fullName.length < 2) errors.full_name = 'Full name is required (min. 2 characters).';

  const phone = normalizePhone(typeof src.phone_number === 'string' ? src.phone_number : '');
  if (!phone) errors.phone_number = 'Enter a valid Nigerian mobile number, e.g. 0803 123 4567.';

  const ward = sanitizeString(src.ward, 40);
  if (!WARD_NAMES.includes(ward)) errors.ward = 'Select one of the 16 wards of Ado-Odo/Ota.';

  const interest = sanitizeString(src.interest_area, 40);
  if (!INTEREST_AREAS.includes(interest)) errors.interest_area = 'Select a valid area of interest.';

  /* Email is OPTIONAL — validated only when provided */
  let email = sanitizeString(src.email, 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    errors.email = 'Enter a valid email address, or leave it blank.';
  }
  if (!email) email = null;

  /* NDPR / NDPA 2023 — consent is MANDATORY and must be recorded */
  const consentGiven = src.consent === true || src.consent === 'true' || src.consent === 'on';
  if (!consentGiven) errors.consent = 'Consent is required before we can store your details.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      full_name: fullName,
      phone_number: phone,
      ward,
      interest_area: interest,
      email,
      consent_given: true,
    },
  };
}

module.exports = { INTEREST_AREAS, sanitizeString, normalizePhone, validateVolunteerPayload };
