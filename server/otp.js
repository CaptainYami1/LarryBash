/**
 * otp.js — one-time-password phone verification for volunteer registration.
 *
 * Codes are stored in memory (per process) keyed by normalized phone number:
 *   { code, expiresAt, attempts }
 *
 * Delivery rides the same notify.js provider used for welcome messages
 * (Twilio / Meta WhatsApp Cloud API). With provider "none" (dev mode), the
 * code is logged to the server console AND returned to the caller as
 * `dev_otp` so the flow stays demoable without an SMS provider — the route
 * only exposes it when no real provider is configured.
 */
const crypto = require('crypto');
const config = require('./config');

const OTP_TTL_MS = 10 * 60 * 1000; // codes valid for 10 minutes
const MAX_ATTEMPTS = 5;            // wrong guesses before the code is burned

const store = new Map(); // phone -> { code, expiresAt, attempts }

/** Cryptographically random 6-digit code. */
function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

/** Create (or replace) the OTP for a phone number. Returns the code. */
function issueOtp(phone) {
  const code = generateCode();
  store.set(phone, { code, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
  return code;
}

/**
 * Check a submitted code. Returns one of:
 *   'ok' | 'missing' (never requested / expired) | 'wrong' | 'locked'
 * A correct code is consumed (single use).
 */
function verifyOtp(phone, code) {
  const entry = store.get(phone);
  if (!entry || Date.now() > entry.expiresAt) {
    store.delete(phone);
    return 'missing';
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    store.delete(phone);
    return 'locked';
  }
  entry.attempts += 1;
  const match =
    typeof code === 'string' &&
    /^\d{6}$/.test(code) &&
    crypto.timingSafeEqual(Buffer.from(entry.code), Buffer.from(code));
  if (!match) {
    return entry.attempts >= MAX_ATTEMPTS ? 'locked' : 'wrong';
  }
  store.delete(phone); // single use
  return 'ok';
}

/** True when no real delivery provider is configured (dev mode). */
function isDevMode() {
  return config.notifyProvider !== 'twilio' && config.notifyProvider !== 'meta';
}

/* Periodic sweep so expired codes don't accumulate. */
setInterval(() => {
  const now = Date.now();
  for (const [phone, entry] of store) {
    if (now > entry.expiresAt) store.delete(phone);
  }
}, 60 * 1000).unref();

module.exports = { issueOtp, verifyOtp, isDevMode };
