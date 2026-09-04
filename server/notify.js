/**
 * notify.js — optional welcome-message dispatch after successful registration.
 *
 * Supports two providers behind one function (chosen via NOTIFY_PROVIDER):
 *   - "twilio": Twilio WhatsApp/SMS REST API
 *   - "meta":   Meta WhatsApp Cloud API (Graph API)
 *   - "none":   no-op (default)
 *
 * Called fire-and-forget from the registration route: a delivery failure is
 * logged but NEVER fails the registration itself.
 */
const config = require('./config');

/** Build the welcome text sent to a new volunteer. */
function welcomeText({ fullName, ward, inviteUrl }) {
  const firstName = fullName.split(' ')[0];
  return (
    `Welcome to the movement, ${firstName}! ` +
    `You are registered as a Larrybash 2027 volunteer for ${ward} Ward. ` +
    `Join your ward mobilization group here: ${inviteUrl} ` +
    `— Larrybash Campaign Organization (Adele Adoko).`
  );
}

/** Dispatch via Twilio's REST API (WhatsApp channel). */
async function sendViaTwilio(toPhone, body) {
  const { accountSid, authToken, whatsappFrom } = config.twilio;
  if (!accountSid || !authToken || !whatsappFrom) {
    throw new Error('Twilio credentials not configured');
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const params = new URLSearchParams({
    From: whatsappFrom,
    To: `whatsapp:${toPhone}`,
    Body: body,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Twilio API responded ${res.status}`);
}

/** Dispatch via Meta's WhatsApp Cloud API. */
async function sendViaMeta(toPhone, body) {
  const { accessToken, phoneNumberId } = config.meta;
  if (!accessToken || !phoneNumberId) {
    throw new Error('Meta WhatsApp Cloud API credentials not configured');
  }
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toPhone.replace('+', ''), // Meta expects digits without "+"
      type: 'text',
      text: { body },
    }),
  });
  if (!res.ok) throw new Error(`Meta WhatsApp API responded ${res.status}`);
}

/**
 * Send the welcome message. Safe to call fire-and-forget:
 * resolves { sent: boolean }, never throws.
 */
async function sendWelcomeMessage({ fullName, phone, ward, inviteUrl }) {
  const body = welcomeText({ fullName, ward, inviteUrl });
  try {
    switch (config.notifyProvider) {
      case 'twilio':
        await sendViaTwilio(phone, body);
        break;
      case 'meta':
        await sendViaMeta(phone, body);
        break;
      default:
        console.log(`[notify] Provider "none" — skipped welcome message to ${phone}.`);
        return { sent: false };
    }
    console.log(`[notify] Welcome message sent to ${phone} via ${config.notifyProvider}.`);
    return { sent: true };
  } catch (err) {
    console.error(`[notify] Failed to send welcome message to ${phone}: ${err.message}`);
    return { sent: false };
  }
}

/**
 * Send a phone-verification OTP. Returns { sent: boolean }, never throws.
 * With provider "none" (dev), it only logs — the route handles dev display.
 */
async function sendOtpMessage({ phone, code }) {
  const body =
    `Larrybash 2027: your verification code is ${code}. ` +
    `It expires in 10 minutes. Never share this code with anyone.`;
  try {
    switch (config.notifyProvider) {
      case 'twilio':
        await sendViaTwilio(phone, body);
        break;
      case 'meta':
        await sendViaMeta(phone, body);
        break;
      default:
        console.log(`[notify] DEV OTP for ${phone}: ${code}`);
        return { sent: false };
    }
    console.log(`[notify] OTP sent to ${phone} via ${config.notifyProvider}.`);
    return { sent: true };
  } catch (err) {
    console.error(`[notify] Failed to send OTP to ${phone}: ${err.message}`);
    return { sent: false };
  }
}

module.exports = { sendWelcomeMessage, sendOtpMessage };
