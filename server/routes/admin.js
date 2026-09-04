/**
 * routes/admin.js — protected campaign-manager area.
 *
 *   GET /admin/dashboard      HTML analytics dashboard
 *   GET /admin/api/stats      JSON: total volunteers + ward-by-ward breakdown
 *   GET /admin/api/export.csv CSV download of the volunteer database
 *
 * All routes require HTTP Basic Auth against ADMIN_USERNAME / ADMIN_PASSWORD.
 * The whole area is disabled (503) until credentials are configured.
 */
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const { db } = require('../db');
const { WARD_NAMES } = require('../wards');

const router = express.Router();

/** Timing-safe string comparison (hash both sides to equalize length first). */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** HTTP Basic Auth middleware. */
function requireAdmin(req, res, next) {
  if (!config.adminUsername || !config.adminPassword) {
    return res.status(503).json({ ok: false, error: 'Admin area not configured on this server.' });
  }
  const header = req.headers.authorization || '';
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);
    if (sep > 0 && safeEqual(user, config.adminUsername) && safeEqual(pass, config.adminPassword)) {
      return next();
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="Larrybash Campaign Admin", charset="UTF-8"');
  return res.status(401).json({ ok: false, error: 'Authentication required.' });
}

router.use(requireAdmin);

/* ---- Dashboard page ---- */
router.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'dashboard.html'));
});

/* ---- Stats JSON: total + ward-by-ward breakdown ---- */
router.get('/api/stats', async (_req, res) => {
  try {
    const stats = await db.getStats();
    res.json({ ok: true, driver: db.driverName, wards: WARD_NAMES, ...stats });
  } catch (err) {
    console.error('[admin] Stats failed:', err.message);
    res.status(500).json({ ok: false, error: 'Could not load statistics.' });
  }
});

/* ---- CSV export for offline coordination ---- */
const CSV_COLUMNS = ['id', 'full_name', 'phone_number', 'phone_verified', 'email', 'ward', 'interest_area', 'consent_given', 'opted_out', 'created_at'];

/** Escape one CSV cell: quote it, and neutralize spreadsheet formula injection. */
function csvCell(value) {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // prevent =SUM()-style injection in Excel
  return `"${s.replace(/"/g, '""')}"`;
}

router.get('/api/export.csv', async (req, res) => {
  try {
    const all = await db.getAllVolunteers();
    // NDPA: people who withdrew consent must NOT appear in the contactable list.
    // Default export excludes them; ?include_opted_out=1 gives a full audit export.
    const includeOptedOut = req.query.include_opted_out === '1';
    const rows = includeOptedOut ? all : all.filter((r) => !r.opted_out);
    const lines = [CSV_COLUMNS.join(',')];
    for (const row of rows) {
      lines.push(CSV_COLUMNS.map((col) => csvCell(row[col])).join(','));
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const suffix = includeOptedOut ? 'audit-all' : 'contactable';
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="larrybash-volunteers-${suffix}-${stamp}.csv"`);
    res.send('﻿' + lines.join('\r\n')); // BOM so Excel opens UTF-8 correctly
  } catch (err) {
    console.error('[admin] CSV export failed:', err.message);
    res.status(500).json({ ok: false, error: 'Could not export volunteers.' });
  }
});

module.exports = router;
