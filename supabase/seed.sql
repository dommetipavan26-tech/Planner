-- =============================================================================
-- seed.sql — what `supabase db reset` runs after supabase/migrations/
-- =============================================================================
-- This file is almost empty on purpose. The demo data — the eight corridors,
-- the public feed rows, the seeded corridor requests and the three carrier
-- desks, including the AI-SOUTH desk whose passcode the README publishes as
-- the demo credential — travels inside the numbered migrations, because that
-- data is not fixture data: it is the board the product shows, and the remote
-- project carries the same rows.
--
-- Keeping the seed inside the migrations means a fresh local database after
-- `db reset` is not "schema with no data to look at" but the board itself, and
-- it means there is exactly one place where a corridor's numbers are defined.
--
-- What remains here is the one thing a local database can drift from the demo:
-- the AI-SOUTH passcode. Anyone experimenting with the desk locally may have
-- changed or locked it, and a reset should hand back the credential the README
-- documents. This statement is idempotent, so running this file twice, or
-- running it against a database that never drifted, changes nothing.

update public.utsav_carriers
set passcode_hash  = extensions.crypt('MELAM-AI-2027', extensions.gen_salt('bf', 10)),
    failed_attempts = 0,
    locked_until    = null
where desk_code = 'AI-SOUTH';

-- Re-seed nothing else. If a corridor or a desk needs different numbers for a
-- local experiment, change it through the app or a scratch SQL file, not here:
-- this file is part of the documented path to a working local board.
