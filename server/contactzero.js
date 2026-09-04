/**
 * contactzero.js — server-to-server bridge to the ContactZero Console
 * (the "Campaign Line Contact Center" agent platform).
 *
 * WHY server-to-server (not browser -> ContactZero):
 *   ContactZero's API is authenticated with `Authorization: Bearer <token>` +
 *   `X-Tenant-Id`, gated by Spring Security (every /api/** returns 401 until
 *   authenticated). A public browser page cannot safely hold those secrets, and
 *   no unauthenticated public intake / webhook / widget endpoint is exposed.
 *   So our Express backend — which already captures OTP-verified volunteers —
 *   forwards each lead into ContactZero as a CONTACT, so campaign agents can
 *   work it across their WhatsApp / SMS / voice / email queues.
 *
 * SAFETY: disabled by default. With CONTACTZERO_ENABLED unset/false this module
 * is a pure no-op that reports { synced:false, queued:true } and sends nothing.
 * It is called fire-and-forget and NEVER throws into the request path.
 *
 * ⚠ The endpoint paths and payload shape below are BEST-GUESS defaults and are
 * fully env-overridable. They MUST be confirmed against the ContactZero API
 * contract before go-live — see server/CONTACTZERO_INTEGRATION.md.
 */
const config = require('./config');

const cz = config.contactzero;

/* Cached bearer token when using login auth mode: { token, expiresAt } */
let tokenCache = null;

/** Obtain a bearer token: static token, or by logging in a service account. */
async function getBearer() {
  if (cz.authMode === 'bearer') {
    return cz.bearerToken || null;
  }
  // authMode === 'login'
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }
  const res = await fetch(cz.baseUrl + cz.loginPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cz.email, password: cz.password, totp: cz.totp || undefined }),
  });
  if (!res.ok) throw new Error(`ContactZero login failed: HTTP ${res.status}`);
  const data = await res.json();
  const token = data.bearer || data.token || data.accessToken;
  if (!token) throw new Error('ContactZero login returned no bearer token');
  // Refresh a minute before the stated expiry, or default to 10 minutes.
  const ttl = (data.expiresInSeconds ? data.expiresInSeconds - 60 : 600) * 1000;
  tokenCache = { token, expiresAt: Date.now() + Math.max(ttl, 60000) };
  return token;
}

/**
 * Map an internal volunteer record to a ContactZero contact payload.
 * Field names follow those observed in the ContactZero client bundle
 * (displayName / phone / email / channel / direction) — CONFIRM before go-live.
 */
function toContactPayload(record) {
  return {
    displayName: record.full_name,
    phone: record.phone_number, // E.164, e.g. +234803...
    email: record.email || undefined,
    source: 'larrybash-2027-website',
    // Ward + interest become tags/attributes so agents can route & filter.
    tags: ['volunteer', record.ward, record.interest_area].filter(Boolean),
    attributes: {
      ward: record.ward,
      interest_area: record.interest_area,
      phone_verified: record.phone_verified === true,
      registered_at: record.created_at,
    },
    // Preferred first-contact channel — WhatsApp is the campaign's primary line.
    preferredChannel: 'whatsapp',
    consent: { channel: 'whatsapp', basis: 'opt-in', capturedAt: record.created_at },
  };
}

/**
 * Push one volunteer into ContactZero. Fire-and-forget safe:
 * always resolves, never throws. Returns a small status object.
 */
async function pushContact(record) {
  if (!cz.enabled) {
    // Outbox semantics: the row stays in our DB (cz_synced=false) for a later
    // drain once ContactZero credentials are configured. Nothing leaves here.
    return { synced: false, queued: true, reason: 'contactzero_disabled' };
  }
  try {
    const bearer = await getBearer();
    if (!bearer) throw new Error('No ContactZero bearer token available');

    const res = await fetch(cz.baseUrl + cz.contactsPath, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearer}`,
        'X-Tenant-Id': cz.tenantId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toContactPayload(record)),
    });
    if (!res.ok) throw new Error(`ContactZero contact push HTTP ${res.status}`);

    let ref = null;
    try {
      const data = await res.json();
      ref = data.id || data.contactId || null;
    } catch (_) {
      /* non-JSON success body is fine */
    }
    console.log(`[contactzero] Synced volunteer ${record.id || record.phone_number} -> contact ${ref || '(no id)'}.`);
    return { synced: true, ref };
  } catch (err) {
    // Never fail registration because of a downstream sync problem.
    console.error(`[contactzero] Sync failed for ${record.phone_number}: ${err.message}`);
    return { synced: false, queued: true, error: err.message };
  }
}

/** Small status object for the admin dashboard / health checks. */
function status() {
  return {
    enabled: cz.enabled,
    baseUrl: cz.enabled ? cz.baseUrl : null,
    authMode: cz.authMode,
    tenantConfigured: Boolean(cz.tenantId),
  };
}

module.exports = { pushContact, status, toContactPayload };
