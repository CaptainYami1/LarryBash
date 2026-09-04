/**
 * db.js — data-access layer for the `volunteers` table.
 *
 * Two drivers behind one interface:
 *   - Supabase (PostgreSQL) when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set
 *   - A volatile in-memory store otherwise (DEV ONLY — data lost on restart)
 *
 * Interface:
 *   insertVolunteer(record) -> { id, ...record, created_at }  (throws DuplicatePhoneError)
 *   getStats()              -> { total, byWard: { [ward]: count } }
 *   getAllVolunteers()      -> [ records ordered by created_at desc ]
 *   driverName              -> 'supabase' | 'memory'
 */
const crypto = require('crypto');
const config = require('./config');
const { WARD_NAMES } = require('./wards');

class DuplicatePhoneError extends Error {
  constructor() {
    super('phone_number already registered');
    this.name = 'DuplicatePhoneError';
  }
}

/* ---------------- Supabase driver (production) ---------------- */
function createSupabaseDriver() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  return {
    driverName: 'supabase',

    async insertVolunteer(record) {
      const { data, error } = await supabase
        .from('volunteers')
        .insert(record)
        .select()
        .single();
      if (error) {
        // 23505 = PostgreSQL unique_violation (duplicate phone number)
        if (error.code === '23505') throw new DuplicatePhoneError();
        throw new Error(`Supabase insert failed: ${error.message}`);
      }
      return data;
    },

    async getStats() {
      const { data, error } = await supabase.from('volunteers').select('ward');
      if (error) throw new Error(`Supabase stats query failed: ${error.message}`);
      const byWard = Object.fromEntries(WARD_NAMES.map((w) => [w, 0]));
      for (const row of data) {
        if (byWard[row.ward] !== undefined) byWard[row.ward] += 1;
      }
      return { total: data.length, byWard };
    },

    async getAllVolunteers() {
      const { data, error } = await supabase
        .from('volunteers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Supabase export query failed: ${error.message}`);
      return data;
    },

    /* NDPA right to withdraw consent — flip consent off + flag opted out so the
       record is retained as proof of opt-out but excluded from all contact. */
    async optOutByPhone(phone) {
      const { data, error } = await supabase
        .from('volunteers')
        .update({ consent_given: false, opted_out: true, opted_out_at: new Date().toISOString() })
        .eq('phone_number', phone)
        .select('id');
      if (error) throw new Error(`Supabase opt-out failed: ${error.message}`);
      return { found: Array.isArray(data) && data.length > 0 };
    },
  };
}

/* ---------------- In-memory driver (development fallback) ---------------- */
function createMemoryDriver() {
  const rows = []; // newest first

  return {
    driverName: 'memory',

    async insertVolunteer(record) {
      if (rows.some((r) => r.phone_number === record.phone_number)) {
        throw new DuplicatePhoneError();
      }
      const row = {
        id: crypto.randomUUID(),
        ...record,
        opted_out: false,
        opted_out_at: null,
        created_at: new Date().toISOString(),
      };
      rows.unshift(row);
      return row;
    },

    async getStats() {
      const byWard = Object.fromEntries(WARD_NAMES.map((w) => [w, 0]));
      for (const row of rows) {
        if (byWard[row.ward] !== undefined) byWard[row.ward] += 1;
      }
      return { total: rows.length, byWard };
    },

    async getAllVolunteers() {
      return [...rows];
    },

    async optOutByPhone(phone) {
      let found = false;
      for (const row of rows) {
        if (row.phone_number === phone) {
          row.consent_given = false;
          row.opted_out = true;
          row.opted_out_at = new Date().toISOString();
          found = true;
        }
      }
      return { found };
    },
  };
}

const db =
  config.supabaseUrl && config.supabaseServiceRoleKey
    ? createSupabaseDriver()
    : createMemoryDriver();

console.log(`[db] Using "${db.driverName}" driver.`);

module.exports = { db, DuplicatePhoneError };
