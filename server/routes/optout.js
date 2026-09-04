/**
 * routes/optout.js — NDPA 2023 right to withdraw consent (opt out).
 *
 *   POST /api/optout/request-otp  { phone_number }        -> sends a 6-digit code
 *   POST /api/optout              { phone_number, otp }   -> verifies, withdraws consent
 *
 * OTP-gated so only the number's owner can opt out (prevents malicious opt-out
 * of other people). The confirm step always reports success and never reveals
 * whether the number was registered (avoids enumeration of the volunteer list).
 */
const express = require('express');
const { db } = require('../db');
const { normalizePhone } = require('../validate');
const { sendOtpMessage } = require('../notify');
const { issueOtp, verifyOtp, isDevMode } = require('../otp');

const router = express.Router();

/* ---- Step 1: send a confirmation code to the number ---- */
router.post('/request-otp', async (req, res) => {
  const phone = normalizePhone(typeof req.body.phone_number === 'string' ? req.body.phone_number : '');
  if (!phone) {
    return res.status(400).json({ ok: false, error: 'Enter a valid Nigerian mobile number, e.g. 0803 123 4567.' });
  }
  const code = issueOtp(phone);
  await sendOtpMessage({ phone, code });
  const payload = { ok: true, message: `Confirmation code sent to ${phone}.`, phone_number: phone };
  if (isDevMode()) payload.dev_otp = code; // dev convenience only
  return res.json(payload);
});

/* ---- Step 2: verify the code and withdraw consent ---- */
router.post('/', async (req, res) => {
  const phone = normalizePhone(typeof req.body.phone_number === 'string' ? req.body.phone_number : '');
  if (!phone) {
    return res.status(400).json({ ok: false, error: 'Enter a valid Nigerian mobile number.' });
  }
  const otpResult = verifyOtp(phone, String(req.body.otp || ''));
  if (otpResult !== 'ok') {
    const messages = {
      missing: 'Code expired or not requested. Please request a new one.',
      wrong: 'Incorrect code. Please check and try again.',
      locked: 'Too many incorrect attempts. Please request a new code.',
    };
    return res.status(401).json({ ok: false, error: messages[otpResult], otp_status: otpResult });
  }
  try {
    await db.optOutByPhone(phone);
    // Uniform success response whether or not the number was on file (no enumeration).
    return res.json({
      ok: true,
      message: 'You have been opted out. You will no longer receive campaign messages from us.',
    });
  } catch (err) {
    console.error('[optout] Failed:', err.message);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again shortly.' });
  }
});

module.exports = router;
