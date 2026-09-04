/**
 * routes/volunteer.js — two-step, OTP-verified volunteer registration.
 *
 *   POST /api/volunteer/request-otp  { ...full payload }        -> sends a 6-digit code
 *   POST /api/volunteer              { ...full payload, otp }   -> verifies code, stores record
 *
 * The full payload is validated at BOTH steps so no invalid data ever
 * receives an OTP. Codes are delivered via notify.js (Twilio / Meta WhatsApp);
 * in dev mode (no provider configured) the code is returned as `dev_otp` so
 * the flow stays demoable.
 */
const express = require('express');
const { db, DuplicatePhoneError } = require('../db');
const { validateVolunteerPayload } = require('../validate');
const { whatsappLinkFor } = require('../wards');
const { sendWelcomeMessage, sendOtpMessage } = require('../notify');
const { issueOtp, verifyOtp, isDevMode } = require('../otp');
const { pushContact } = require('../contactzero');

const router = express.Router();

/* ---- Step 1: validate payload, issue + dispatch the OTP ---- */
router.post('/request-otp', async (req, res) => {
  const result = validateVolunteerPayload(req.body);
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: 'Validation failed.', fields: result.errors });
  }
  const phone = result.data.phone_number;
  const code = issueOtp(phone);
  await sendOtpMessage({ phone, code });

  const payload = {
    ok: true,
    message: `Verification code sent to ${phone} via WhatsApp/SMS.`,
    phone_number: phone,
  };
  // Dev convenience ONLY — never present once a real SMS provider is configured
  if (isDevMode()) payload.dev_otp = code;
  return res.json(payload);
});

/* ---- Step 2: verify the OTP, then persist ---- */
router.post('/', async (req, res) => {
  const result = validateVolunteerPayload(req.body);
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: 'Validation failed.', fields: result.errors });
  }
  const record = result.data;
  const inviteUrl = whatsappLinkFor(record.ward);

  /* Phone must be OTP-verified before anything touches the database */
  const otpResult = verifyOtp(record.phone_number, String(req.body.otp || ''));
  if (otpResult !== 'ok') {
    const messages = {
      missing: 'Verification code expired or not requested. Tap "Resend code" to get a new one.',
      wrong: 'Incorrect verification code. Please check and try again.',
      locked: 'Too many incorrect attempts. Tap "Resend code" to get a new one.',
    };
    return res.status(401).json({ ok: false, error: messages[otpResult], otp_status: otpResult });
  }

  try {
    const saved = await db.insertVolunteer({ ...record, phone_verified: true });

    sendWelcomeMessage({
      fullName: record.full_name,
      phone: record.phone_number,
      ward: record.ward,
      inviteUrl,
    });

    /* Fire-and-forget sync into the ContactZero campaign contact center.
       No-op (and never throws) unless CONTACTZERO_ENABLED=true. */
    pushContact(saved);

    return res.status(201).json({
      ok: true,
      message: `Registration successful. Welcome to the ${record.ward} Ward team!`,
      volunteer_id: saved.id,
      ward: record.ward,
      whatsapp_link: inviteUrl,
    });
  } catch (err) {
    if (err instanceof DuplicatePhoneError) {
      return res.status(409).json({
        ok: false,
        error: 'This phone number is already registered. You are part of the movement!',
        ward: record.ward,
        whatsapp_link: inviteUrl,
      });
    }
    console.error('[volunteer] Insert failed:', err.message);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again shortly.' });
  }
});

module.exports = router;
