/**
 * config.js — central environment configuration.
 * All process.env access happens here so the rest of the codebase
 * consumes a single, validated config object.
 */
const path = require('path');
// Resolve .env relative to this file, not the process cwd — the server can be
// launched from the project root (e.g. `node server/server.js`) or from server/.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database — when unset, db.js falls back to a volatile in-memory store (dev only)
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // CORS — origins allowed to call the API cross-origin (blank = same-origin only)
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Admin dashboard credentials (dashboard is disabled until both are set)
  adminUsername: process.env.ADMIN_USERNAME || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',

  // Welcome-message dispatch
  notifyProvider: (process.env.NOTIFY_PROVIDER || 'none').toLowerCase(),
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || '',
  },
  meta: {
    accessToken: process.env.META_WA_ACCESS_TOKEN || '',
    phoneNumberId: process.env.META_WA_PHONE_NUMBER_ID || '',
  },

  // ContactZero Console bridge (the "Campaign Line Contact Center" platform).
  // Disabled unless CONTACTZERO_ENABLED=true. See server/CONTACTZERO_INTEGRATION.md.
  contactzero: {
    enabled: (process.env.CONTACTZERO_ENABLED || '').toLowerCase() === 'true',
    baseUrl: (process.env.CONTACTZERO_BASE_URL || 'https://contact.192-248-146-231.nip.io').replace(/\/$/, ''),
    tenantId: process.env.CONTACTZERO_TENANT_ID || '',
    authMode: (process.env.CONTACTZERO_AUTH_MODE || 'login').toLowerCase(), // 'login' | 'bearer'
    bearerToken: process.env.CONTACTZERO_BEARER_TOKEN || '',
    loginPath: process.env.CONTACTZERO_LOGIN_PATH || '/api/v1/auth/login',
    email: process.env.CONTACTZERO_EMAIL || '',
    password: process.env.CONTACTZERO_PASSWORD || '',
    totp: process.env.CONTACTZERO_TOTP || '',
    contactsPath: process.env.CONTACTZERO_CONTACTS_PATH || '/api/v1/contacts',
  },
};

/* Startup sanity warnings — loud in the log, but never crash the server */
if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
  console.warn(
    '[config] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — ' +
      'running with a VOLATILE in-memory store. Data is lost on restart. Dev only!'
  );
}
if (!config.adminUsername || !config.adminPassword) {
  console.warn('[config] ADMIN_USERNAME / ADMIN_PASSWORD not set — /admin routes are disabled.');
}
if (!config.contactzero.enabled) {
  console.warn('[config] CONTACTZERO_ENABLED not true — leads are stored locally but NOT synced to ContactZero.');
} else if (!config.contactzero.tenantId) {
  console.warn('[config] CONTACTZERO_ENABLED=true but CONTACTZERO_TENANT_ID is blank — sync will fail until set.');
}

module.exports = config;
