/**
 * server.js — Larrybash 2027 campaign backend (Express).
 *
 * Serves:
 *   GET  /                    the campaign site (index.html from the project root)
 *   GET  /health              liveness probe
 *   POST /api/volunteer       volunteer registration (rate-limited)
 *   GET  /admin/*             protected analytics dashboard + CSV export
 *
 * Security: helmet (CSP tuned for the Tailwind/FontAwesome CDNs), CORS
 * allow-list, JSON body size cap, per-IP rate limiting on the public form.
 */
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const volunteerRouter = require('./routes/volunteer');
const optoutRouter = require('./routes/optout');
const adminRouter = require('./routes/admin');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // behind one reverse proxy (nginx/Render/Railway) for real client IPs

/* ---------- Security headers ---------- */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // index.html loads Tailwind + FontAwesome from CDNs and uses inline script/styles
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://cdnjs.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        // Secretariat map embed (loaded only when the visitor taps the facade)
        frameSrc: ["'self'", 'https://www.openstreetmap.org'],
        frameAncestors: ["'none'"],
      },
    },
  })
);

/* ---------- CORS ----------
   Same-origin requests are unaffected. Cross-origin is denied unless the
   origin is on the ALLOWED_ORIGINS allow-list. */
app.use(
  cors({
    origin: config.allowedOrigins.length > 0 ? config.allowedOrigins : false,
    methods: ['GET', 'POST'],
  })
);

/* ---------- Body parsing (small cap — the form payload is tiny) ---------- */
app.use(express.json({ limit: '10kb' }));

/* ---------- Rate limiting on the public volunteer form ---------- */
const volunteerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 12,                // OTP flow uses ~2-3 requests per registration
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Too many attempts from this device. Please try again later.' },
});

/* ---------- Routes ---------- */
app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.use('/api/volunteer', volunteerLimiter, volunteerRouter);
app.use('/api/optout', volunteerLimiter, optoutRouter);
app.use('/admin', adminRouter);

/* Campaign site: serve ONLY index.html and the optimized assets folder from
   the project root (never the server directory — keeps .env and source files
   off the wire). Images get long-lived caching for repeat 3G visits. */
const INDEX_HTML = path.join(__dirname, '..', 'index.html');
app.get('/', (_req, res) => res.sendFile(INDEX_HTML));
app.use(
  '/assets',
  express.static(path.join(__dirname, '..', 'assets'), {
    immutable: true,
    maxAge: '7d',
    fallthrough: false,
  })
);

/* ---------- 404 + error handling ---------- */
app.use((_req, res) => res.status(404).json({ ok: false, error: 'Not found.' }));

app.use((err, _req, res, _next) => {
  // Malformed JSON body from express.json() lands here
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'Invalid JSON payload.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: 'Payload too large.' });
  }
  if (err.status === 404) {
    // e.g. a missing /assets file (express.static with fallthrough: false)
    return res.status(404).json({ ok: false, error: 'Not found.' });
  }
  console.error('[server] Unhandled error:', err);
  return res.status(500).json({ ok: false, error: 'Internal server error.' });
});

app.listen(config.port, () => {
  console.log(`[server] Larrybash 2027 backend listening on http://localhost:${config.port} (${config.nodeEnv})`);
});
