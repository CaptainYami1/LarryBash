-- ============================================================
-- LARRYBASH 2027 — SUPABASE (POSTGRESQL) MIGRATION
-- volunteers table for the Ado-Odo/Ota volunteer platform.
-- Run in the Supabase SQL Editor, or via: supabase db push
-- ============================================================

-- gen_random_uuid() lives in pgcrypto (pre-enabled on Supabase, safe to re-run)
create extension if not exists pgcrypto;

create table if not exists public.volunteers (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null
                constraint volunteers_full_name_len
                check (char_length(full_name) between 2 and 120),

  -- Stored normalized to E.164 (+234XXXXXXXXXX); unique = one signup per number
  phone_number  text not null unique
                constraint volunteers_phone_format
                check (phone_number ~ '^\+234[789][01]\d{8}$'),

  -- Must be one of the 16 wards of Ado-Odo/Ota LG (per adoodootalg.org.ng)
  ward          text not null
                constraint volunteers_ward_valid
                check (ward in (
                  'Ota 1', 'Ota 2', 'Ota 3', 'Sango', 'Ijoko', 'Atan',
                  'Iju', 'Ilogbo', 'Ado-Odo 1', 'Ado-Odo 2', 'Ere',
                  'Alapoti', 'Igbesa', 'Agbara 1', 'Agbara 2', 'Ketu'
                )),

  interest_area text not null
                constraint volunteers_interest_valid
                check (interest_area in (
                  'Door-to-Door Canvassing', 'Social Media Advocacy',
                  'Event Logistics', 'Polling Unit Agent'
                )),

  -- Optional contact email (lowercased by the API; null when not provided)
  email         text
                constraint volunteers_email_format
                check (email is null or email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),

  -- Set true by the backend only after the phone passed OTP verification
  phone_verified boolean not null default false,

  -- NDPR / NDPA 2023 — recorded consent to store & contact (with timestamp)
  consent_given  boolean not null default false,
  consent_at     timestamptz not null default now(),

  -- NDPA right to withdraw consent — set when a data subject opts out
  opted_out      boolean not null default false,
  opted_out_at   timestamptz,

  -- ContactZero sync tracking: false until the lead is pushed to the contact
  -- center; cz_ref holds the ContactZero contact id once synced.
  cz_synced     boolean not null default false,
  cz_ref        text,

  created_at    timestamptz not null default now()
);

-- Migration for tables created before these features (safe to re-run):
-- alter table public.volunteers add column if not exists email text;
-- alter table public.volunteers add column if not exists phone_verified boolean not null default false;
-- alter table public.volunteers add column if not exists cz_synced boolean not null default false;
-- alter table public.volunteers add column if not exists cz_ref text;
-- alter table public.volunteers add column if not exists consent_given boolean not null default false;
-- alter table public.volunteers add column if not exists consent_at timestamptz not null default now();
-- alter table public.volunteers add column if not exists opted_out boolean not null default false;
-- alter table public.volunteers add column if not exists opted_out_at timestamptz;

-- Fast ward-by-ward aggregation for the admin dashboard
create index if not exists volunteers_ward_idx on public.volunteers (ward);
create index if not exists volunteers_created_at_idx on public.volunteers (created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- Enable RLS and define NO policies: the anon/authenticated keys can
-- read or write NOTHING. Only the backend's service-role key (which
-- bypasses RLS) can touch this table. Volunteer PII never reaches
-- the browser.
-- ============================================================
alter table public.volunteers enable row level security;
