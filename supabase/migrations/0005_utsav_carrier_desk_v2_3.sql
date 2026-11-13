-- =============================================================================
-- utsav_carrier_desk_v2_3 — carrier desk authentication and demand integrity
-- =============================================================================
-- Local mirror of a migration applied to project txbgovhxqxvlioszevbe. The
-- remote copy is authoritative; this file exists so the schema is reviewable in
-- git. It must not be re-applied.
--
-- WHAT WAS WRONG
--
-- 1. `utsav_carrier_bids` carried an INSERT policy `WITH CHECK (true)` for role
--    public. Any browser holding the publishable anon key could write a bid row
--    directly — including one already marked 'accepted', which the public board
--    renders as a confirmed block. Bids were also unattributed: `carrier_name`
--    and `desk_contact` were free text chosen by whoever wrote the row, so
--    nothing tied a block of seats to a carrier.
--
-- 2. `desk_contact` held a desk email address in a table whose SELECT policy is
--    `true`, i.e. world-readable, while the bid form told the carrier that field
--    was "not published". The form was lying.
--
-- 3. `utsav_upvote_request(uuid)` incremented a counter with no voter identity
--    and no limit. One caller in a loop could manufacture demand and re-order the
--    request board, which is what the board ranks on.
--
-- 4. `utsav_corridor_requests` was anon-insertable with no bounds: the client
--    sent `upvotes: 1`, but a direct POST could send any number, any group size,
--    any text. A row written that way is live on the production board today —
--    origin "Tirupati", window "01 jan 2027", requester "Team IT".
--
-- WHAT THIS DOES
--
-- Carrier desks become real identities: `utsav_carriers` holds the desk code and
-- a bcrypt passcode hash, `utsav_carrier_desk_signin` verifies it and mints a
-- short-lived random session token, and `utsav_submit_bid` writes bids only
-- against a live session. Carrier name, desk code and desk contact come from the
-- carrier row, never from the caller, and `bid_status` is forced to
-- 'under_review' — accepting a bid stays an operations action on the ledger, not
-- something the supply side can do to itself. Both anon INSERT policies are
-- dropped and the table-level INSERT privilege is revoked, so the RPC is the only
-- path in.
--
-- The desk email moves off the public table onto `utsav_carriers`, which has RLS
-- enabled and zero policies — the same shape already used for pledges and
-- watches, readable only through SECURITY DEFINER functions. The public bid row
-- keeps a non-personal `desk_ref` (the desk code) so attribution survives.
--
-- Demand gets a device-scoped throttle in two zero-policy side tables:
-- `utsav_request_votes` makes an upvote one-per-(request, device) and idempotent,
-- and `utsav_request_receipts` lets `utsav_submit_request` enforce a cooldown, a
-- retry window and a daily cap while forcing `upvotes` to start at the
-- submitter's own single vote. The device id is still browser-minted and therefore
-- still spoofable by a determined caller — it raises the cost of fabrication, it
-- does not make demand provable. That limit is stated in the README rather than
-- papered over.
--
-- Error SQLSTATEs follow the convention set by utsav_join_throttle_v2_2: UT429
-- means "refused the pace", UT401 means "not signed in / session expired".
-- Neither means "the network dropped", so the client never mirrors a refused
-- write into its local state as though it had landed.
--
-- THIS IS THE EXPAND HALF. It adds everything and removes nothing, so a browser
-- still running the previous bundle keeps working while the new one ships:
-- the anon INSERT policies stay, `desk_contact` stays (nullable now), and the
-- 1-argument `utsav_upvote_request` stays. The contract half — dropping those
-- three — is `utsav_carrier_desk_contract_v2_4.sql`, applied only once the
-- client that calls these functions is deployed.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Carrier desks
-- -----------------------------------------------------------------------------

create table if not exists public.utsav_carriers (
  id              uuid primary key default gen_random_uuid(),
  carrier_name    text not null,
  desk_code       text not null unique,
  passcode_hash   text not null,
  desk_contact    text not null,
  status          text not null default 'active',
  failed_attempts integer not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now(),
  constraint utsav_carriers_name_len      check (char_length(carrier_name) between 3 and 120),
  constraint utsav_carriers_desk_code_fmt check (desk_code ~ '^[A-Z0-9][A-Z0-9-]{2,31}$'),
  constraint utsav_carriers_hash_len      check (char_length(passcode_hash) between 20 and 200),
  constraint utsav_carriers_contact_fmt   check (desk_contact ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'),
  constraint utsav_carriers_status_chk    check (status in ('active', 'suspended')),
  constraint utsav_carriers_attempts_chk  check (failed_attempts between 0 and 1000)
);

comment on table public.utsav_carriers is
  'Carrier desks that may log bids. Passcodes are stored as bcrypt hashes and are never returned by any function.';

-- Desk sessions. The token is 32 random bytes, hex; it is a bearer credential for
-- the desk's own writes and nothing else, so it expires on a shift rather than
-- persisting.
create table if not exists public.utsav_carrier_desk_sessions (
  token      text primary key,
  carrier_id uuid not null references public.utsav_carriers (id) on delete cascade,
  device_id  uuid,
  issued_at  timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint utsav_desk_sessions_token_len  check (char_length(token) = 64),
  constraint utsav_desk_sessions_expiry_chk check (expires_at > issued_at)
);

create index if not exists utsav_desk_sessions_carrier_idx
  on public.utsav_carrier_desk_sessions (carrier_id, expires_at desc);

-- -----------------------------------------------------------------------------
-- 2. Demand side tables: votes and receipts, both RPC-only
-- -----------------------------------------------------------------------------

create table if not exists public.utsav_request_votes (
  request_id uuid not null references public.utsav_corridor_requests (id) on delete cascade,
  device_id  uuid not null,
  created_at timestamptz not null default now(),
  primary key (request_id, device_id)
);

create index if not exists utsav_request_votes_device_idx
  on public.utsav_request_votes (device_id, created_at desc);

create table if not exists public.utsav_request_receipts (
  device_id  uuid not null,
  request_id uuid not null references public.utsav_corridor_requests (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists utsav_request_receipts_device_idx
  on public.utsav_request_receipts (device_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 3. Bid rows: attribute them, and prepare to take the email off the table
-- -----------------------------------------------------------------------------

alter table public.utsav_carrier_bids
  add column if not exists carrier_id uuid references public.utsav_carriers (id) on delete set null,
  add column if not exists desk_ref   text;

-- Guarded, because ADD CONSTRAINT — unlike CREATE TABLE IF NOT EXISTS and ADD
-- COLUMN IF NOT EXISTS above — has no IF NOT EXISTS form.
do $guard$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'utsav_carrier_bids_desk_ref_fmt'
  ) then
    alter table public.utsav_carrier_bids
      add constraint utsav_carrier_bids_desk_ref_fmt
      check (desk_ref is null or desk_ref ~ '^[A-Z0-9][A-Z0-9-]{2,31}$');
  end if;
end;
$guard$;

create index if not exists utsav_carrier_bids_carrier_idx
  on public.utsav_carrier_bids (carrier_id, created_at desc);

-- `utsav_submit_bid` does not write a desk contact — it is not the caller's to
-- give — so the column has to stop being mandatory before the function can be
-- used. It stays readable until the contract half drops it; the public bid card
-- shows `desk_ref` from here on.
alter table public.utsav_carrier_bids alter column desk_contact drop not null;

comment on column public.utsav_carrier_bids.carrier_id is
  'The desk that logged this bid, set by utsav_submit_bid from the session — never from the caller.';
comment on column public.utsav_carrier_bids.desk_ref is
  'Public, non-personal desk code. Replaces the desk email that used to sit in a world-readable table.';

-- -----------------------------------------------------------------------------
-- 4. Seed the three desks already on the board, then backfill attribution
-- -----------------------------------------------------------------------------

-- The Air India desk passcode is published in the README as the demo credential:
-- this is a prototype board and reviewers need a way in. The other two desks get
-- random passcodes that are hashed here and never displayed, which is how a real
-- desk would be provisioned by operations.
insert into public.utsav_carriers (carrier_name, desk_code, passcode_hash, desk_contact)
values
  ('Air India Group Desk (South)', 'AI-SOUTH',
   crypt('MELAM-AI-2027', gen_salt('bf', 10)), 'groups.south@airindia-desk.in'),
  ('IndiGo 6E Series Desk', '6E-SERIES',
   crypt(encode(gen_random_bytes(12), 'hex'), gen_salt('bf', 10)), 'series.north@goindigo-corp.in'),
  ('Akasa Air Group Sales', 'AKASA-B2B',
   crypt(encode(gen_random_bytes(12), 'hex'), gen_salt('bf', 10)), 'charterdesk@akasa-b2b.in')
on conflict (desk_code) do nothing;

update public.utsav_carrier_bids b
set carrier_id = c.id,
    desk_ref   = c.desk_code
from public.utsav_carriers c
where b.carrier_id is null
  and b.carrier_name = c.carrier_name;


-- -----------------------------------------------------------------------------
-- 5. Close the anonymous write paths
-- -----------------------------------------------------------------------------

-- The new tables are RLS-on with zero policies and no grants: reachable only from
-- inside the SECURITY DEFINER functions below, which run as the table owner.
alter table public.utsav_carriers               enable row level security;
alter table public.utsav_carrier_desk_sessions  enable row level security;
alter table public.utsav_request_votes          enable row level security;
alter table public.utsav_request_receipts       enable row level security;

revoke all on public.utsav_carriers              from public, anon, authenticated;
revoke all on public.utsav_carrier_desk_sessions from public, anon, authenticated;
revoke all on public.utsav_request_votes         from public, anon, authenticated;
revoke all on public.utsav_request_receipts      from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Desk sign-in
-- -----------------------------------------------------------------------------

create or replace function public.utsav_carrier_desk_signin (
  p_desk_code text,
  p_passcode  text,
  p_device_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_code        text := upper(btrim(coalesce(p_desk_code, '')));
  v_carrier     public.utsav_carriers;
  v_token       text;
  v_expires     timestamptz;
  v_failures    integer;
  v_locked_secs integer;
begin
  if char_length(v_code) < 3 or coalesce(p_passcode, '') = '' then
    raise exception 'Those desk credentials were not recognised.'
      using errcode = 'UT401';
  end if;

  select * into v_carrier
  from public.utsav_carriers
  where desk_code = v_code
  for update;

  if not found then
    -- Same message as a bad passcode: the desk code is not an oracle.
    raise exception 'Those desk credentials were not recognised.'
      using errcode = 'UT401';
  end if;

  if v_carrier.status <> 'active' then
    raise exception 'That desk is suspended. Contact UtsavAir operations.'
      using errcode = 'UT401';
  end if;

  if v_carrier.locked_until is not null and v_carrier.locked_until > now() then
    v_locked_secs := greatest(1, ceil(extract(epoch from (v_carrier.locked_until - now())) / 60)::integer) * 60;
    raise exception 'That desk is locked after repeated failed sign-ins. Try again in % minutes.',
      (v_locked_secs / 60)
      using errcode = 'UT429';
  end if;

  if crypt(p_passcode, v_carrier.passcode_hash) <> v_carrier.passcode_hash then
    v_failures := v_carrier.failed_attempts + 1;
    update public.utsav_carriers
    set failed_attempts = v_failures,
        locked_until    = case when v_failures >= 5 then now() + interval '15 minutes' else locked_until end
    where id = v_carrier.id;

    if v_failures >= 5 then
      raise exception 'That desk is locked after repeated failed sign-ins. Try again in 15 minutes.'
        using errcode = 'UT429';
    end if;

    raise exception 'Those desk credentials were not recognised.'
      using errcode = 'UT401';
  end if;

  update public.utsav_carriers
  set failed_attempts = 0,
      locked_until    = null
  where id = v_carrier.id;

  -- One shift's worth of access, and never more than five live sessions per desk.
  v_token   := encode(gen_random_bytes(32), 'hex');
  v_expires := now() + interval '8 hours';

  insert into public.utsav_carrier_desk_sessions (token, carrier_id, device_id, expires_at)
  values (v_token, v_carrier.id, p_device_id, v_expires);

  delete from public.utsav_carrier_desk_sessions
  where carrier_id = v_carrier.id
    and revoked_at is null
    and expires_at > now()
    and token not in (
      select token
      from public.utsav_carrier_desk_sessions
      where carrier_id = v_carrier.id
        and revoked_at is null
        and expires_at > now()
      order by issued_at desc
      limit 5
    );

  return jsonb_build_object(
    'ok',           true,
    'session_token', v_token,
    'expires_at',   v_expires,
    'carrier_id',   v_carrier.id,
    'carrier_name', v_carrier.carrier_name,
    'desk_ref',     v_carrier.desk_code,
    'desk_contact', v_carrier.desk_contact
  );
end;
$function$;

comment on function public.utsav_carrier_desk_signin(text, text, uuid) is
  'Verifies a desk passcode against its bcrypt hash and mints an 8-hour session token. Five failures lock the desk for 15 minutes. Returns the desk contact to the signed-in caller only; it is not on the public bid row.';

-- Validates a stored session without exposing anything about the desk to a caller
-- that does not already hold the token.
create or replace function public.utsav_carrier_desk_session (
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row record;
begin
  select s.token, s.expires_at, c.id as carrier_id, c.carrier_name, c.desk_code, c.desk_contact, c.status
  into v_row
  from public.utsav_carrier_desk_sessions s
  join public.utsav_carriers c on c.id = s.carrier_id
  where s.token = p_session_token
    and s.revoked_at is null
    and s.expires_at > now();

  if not found or v_row.status <> 'active' then
    raise exception 'That desk session has ended. Sign in again.'
      using errcode = 'UT401';
  end if;

  return jsonb_build_object(
    'ok',           true,
    'session_token', v_row.token,
    'expires_at',   v_row.expires_at,
    'carrier_id',   v_row.carrier_id,
    'carrier_name', v_row.carrier_name,
    'desk_ref',     v_row.desk_code,
    'desk_contact', v_row.desk_contact
  );
end;
$function$;

create or replace function public.utsav_carrier_desk_signout (
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
begin
  update public.utsav_carrier_desk_sessions
  set revoked_at = now()
  where token = p_session_token
    and revoked_at is null;

  return jsonb_build_object('ok', true);
end;
$function$;

-- -----------------------------------------------------------------------------
-- 7. Bid submission
-- -----------------------------------------------------------------------------

create or replace function public.utsav_submit_bid (
  p_session_token     text,
  p_corridor_code     text,
  p_offered_seats     integer,
  p_net_group_fare    integer,
  p_baggage_terms     text,
  p_hold_window_hours integer,
  p_notes             text
)
returns public.utsav_carrier_bids
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_session   record;
  v_corridor  public.utsav_corridors;
  v_code      text := upper(btrim(coalesce(p_corridor_code, '')));
  v_terms     text := btrim(coalesce(p_baggage_terms, ''));
  v_notes     text := nullif(btrim(coalesce(p_notes, '')), '');
  v_existing  public.utsav_carrier_bids;
  v_recent    integer;
begin
  select s.expires_at, c.id as carrier_id, c.carrier_name, c.desk_code, c.desk_contact
  into v_session
  from public.utsav_carrier_desk_sessions s
  join public.utsav_carriers c on c.id = s.carrier_id
  where s.token = p_session_token
    and s.revoked_at is null
    and s.expires_at > now()
    and c.status = 'active'
  for update of s;

  if not found then
    raise exception 'That desk session has ended. Sign in again.'
      using errcode = 'UT401';
  end if;

  select * into v_corridor from public.utsav_corridors where code = v_code;
  if not found then
    raise exception 'Corridor not found: %', v_code using errcode = '22023';
  end if;

  if p_offered_seats is null or p_offered_seats < 10 or p_offered_seats > 400 then
    raise exception 'A block must offer between 10 and 400 seats.' using errcode = '22023';
  end if;

  if p_net_group_fare is null or p_net_group_fare < 100 or p_net_group_fare > 200000 then
    raise exception 'Net group fare per seat must be between 100 and 200000 rupees.' using errcode = '22023';
  end if;

  if p_hold_window_hours is null or p_hold_window_hours < 6 or p_hold_window_hours > 336 then
    raise exception 'Hold window must be between 6 and 336 hours.' using errcode = '22023';
  end if;

  if char_length(v_terms) > 160 then
    raise exception 'Baggage terms must be one line, at most 160 characters.' using errcode = '22023';
  end if;

  if v_notes is not null and char_length(v_notes) > 600 then
    raise exception 'Desk notes must be at most 600 characters.' using errcode = '22023';
  end if;

  -- Retry idempotency: the same desk re-sending the same block inside two minutes
  -- gets the row it already wrote, so a double-click cannot double the offer.
  select * into v_existing
  from public.utsav_carrier_bids
  where carrier_id = v_session.carrier_id
    and corridor_code = v_code
    and offered_seats = p_offered_seats
    and net_group_fare = p_net_group_fare
    and created_at > now() - interval '120 seconds'
  order by created_at desc
  limit 1;

  if found then
    return v_existing;
  end if;

  -- Pace: one bid a minute, six an hour, per desk.
  select count(*) into v_recent
  from public.utsav_carrier_bids
  where carrier_id = v_session.carrier_id
    and created_at > now() - interval '60 seconds';
  if v_recent >= 1 then
    raise exception 'Wait a moment before logging another bid — this desk just logged one.'
      using errcode = 'UT429';
  end if;

  select count(*) into v_recent
  from public.utsav_carrier_bids
  where carrier_id = v_session.carrier_id
    and created_at > now() - interval '1 hour';
  if v_recent >= 6 then
    raise exception 'This desk has logged 6 bids in the last hour. Wait before logging another.'
      using errcode = 'UT429';
  end if;

  insert into public.utsav_carrier_bids (
    corridor_id, corridor_code, carrier_name, desk_ref, carrier_id,
    offered_seats, net_group_fare, baggage_terms, hold_window_hours, notes, bid_status
  ) values (
    v_corridor.id, v_code, v_session.carrier_name, v_session.desk_code, v_session.carrier_id,
    p_offered_seats, p_net_group_fare,
    case when v_terms = '' then 'Standard allowance' else v_terms end,
    p_hold_window_hours, v_notes, 'under_review'
  )
  returning * into v_existing;

  return v_existing;
end;
$function$;

comment on function public.utsav_submit_bid(text, text, integer, integer, text, integer, text) is
  'Writes a bid against a live desk session. Carrier name, desk code and carrier id come from the session; bid_status is always under_review. Accepting a bid remains an operations action on the ledger.';

-- -----------------------------------------------------------------------------
-- 8. Demand: throttled requests, one vote per device
-- -----------------------------------------------------------------------------

create or replace function public.utsav_submit_request (
  p_device_id      uuid,
  p_origin_city    text,
  p_dest_city      text,
  p_festival       text,
  p_mode           text,
  p_travel_window  text,
  p_requester_name text,
  p_group_size     integer
)
returns public.utsav_corridor_requests
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_origin   text := btrim(coalesce(p_origin_city, ''));
  v_dest     text := btrim(coalesce(p_dest_city, ''));
  v_window   text := btrim(coalesce(p_travel_window, ''));
  v_name     text := btrim(coalesce(p_requester_name, ''));
  v_festival text := btrim(coalesce(p_festival, ''));
  v_existing public.utsav_corridor_requests;
  v_row      public.utsav_corridor_requests;
  v_count    integer;
begin
  if p_device_id is null then
    raise exception 'A device id is required to post a request.' using errcode = '22023';
  end if;

  if char_length(v_origin) < 2 or char_length(v_origin) > 80 then
    raise exception 'Origin city must be between 2 and 80 characters.' using errcode = '22023';
  end if;
  if char_length(v_dest) < 2 or char_length(v_dest) > 80 then
    raise exception 'Destination city must be between 2 and 80 characters.' using errcode = '22023';
  end if;
  if char_length(v_festival) < 3 or char_length(v_festival) > 80 then
    raise exception 'Pick the festival this request is for.' using errcode = '22023';
  end if;
  if char_length(v_window) < 3 or char_length(v_window) > 120 then
    raise exception 'Travel window must be between 3 and 120 characters.' using errcode = '22023';
  end if;
  if char_length(v_name) < 3 or char_length(v_name) > 80 then
    raise exception 'Requester name must be at least 3 characters.' using errcode = '22023';
  end if;
  if p_mode is null or p_mode not in ('flight', 'bus') then
    raise exception 'Mode must be flight or bus.' using errcode = '22023';
  end if;
  if p_group_size is null or p_group_size < 1 or p_group_size > 200 then
    raise exception 'Group size must be between 1 and 200 travellers.' using errcode = '22023';
  end if;

  -- Retry idempotency: same device, same ask, inside two minutes.
  select r.* into v_existing
  from public.utsav_request_receipts rc
  join public.utsav_corridor_requests r on r.id = rc.request_id
  where rc.device_id = p_device_id
    and rc.created_at > now() - interval '120 seconds'
    and lower(r.origin_city) = lower(v_origin)
    and lower(r.dest_city) = lower(v_dest)
    and r.mode = p_mode
  order by rc.created_at desc
  limit 1;

  if found then
    return v_existing;
  end if;

  select count(*) into v_count
  from public.utsav_request_receipts
  where device_id = p_device_id
    and created_at > now() - interval '60 seconds';
  if v_count >= 1 then
    raise exception 'Wait a moment before posting another request — this device just posted one.'
      using errcode = 'UT429';
  end if;

  select count(*) into v_count
  from public.utsav_request_receipts
  where device_id = p_device_id
    and created_at > now() - interval '24 hours';
  if v_count >= 3 then
    raise exception 'This device has posted 3 requests in the last 24 hours. Upvote an existing one instead.'
      using errcode = 'UT429';
  end if;

  insert into public.utsav_corridor_requests (
    origin_city, dest_city, festival, mode, travel_window, requester_name, group_size, upvotes
  ) values (
    v_origin, v_dest, v_festival, p_mode, v_window, v_name, p_group_size, 0
  )
  returning * into v_row;

  insert into public.utsav_request_receipts (device_id, request_id)
  values (p_device_id, v_row.id);

  -- The person asking is the first person asking for it.
  insert into public.utsav_request_votes (request_id, device_id)
  values (v_row.id, p_device_id)
  on conflict do nothing;

  update public.utsav_corridor_requests
  set upvotes = 1
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$function$;

comment on function public.utsav_submit_request(uuid, text, text, text, text, text, text, integer) is
  'Writes a corridor request with upvotes forced to the submitter''s own single vote, bounded fields, a 60-second cooldown, a two-minute retry window and a cap of three per device per day.';

-- A second overload, not a replacement: the 1-argument version stays callable so
-- the deployed bundle does not break. The two are unambiguous because neither
-- parameter has a default.
create or replace function public.utsav_upvote_request (
  p_request_id uuid,
  p_device_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row       public.utsav_corridor_requests;
  v_inserted  uuid;
  v_already   boolean;
  v_count     integer;
begin
  if p_device_id is null then
    raise exception 'A device id is required to upvote.' using errcode = '22023';
  end if;

  select * into v_row from public.utsav_corridor_requests where id = p_request_id for update;
  if not found then
    raise exception 'That request is no longer listed.' using errcode = '22023';
  end if;

  -- One vote per device per request, forever. A repeat is not an error, it is a
  -- no-op the caller is told about so the UI can say "you already asked for this".
  insert into public.utsav_request_votes (request_id, device_id)
  values (p_request_id, p_device_id)
  on conflict do nothing
  returning request_id into v_inserted;

  v_already := v_inserted is null;

  if not v_already then
    select count(*) into v_count
    from public.utsav_request_votes
    where device_id = p_device_id
      and created_at > now() - interval '5 seconds'
      and request_id <> p_request_id;
    if v_count >= 1 then
      raise exception 'Wait a moment before upvoting another request.'
        using errcode = 'UT429';
    end if;

    select count(*) into v_count
    from public.utsav_request_votes
    where device_id = p_device_id
      and created_at > now() - interval '1 hour';
    if v_count > 20 then
      raise exception 'This device has upvoted 20 requests in the last hour. Come back later.'
        using errcode = 'UT429';
    end if;

    update public.utsav_corridor_requests
    set upvotes = upvotes + 1
    where id = p_request_id
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'ok',             true,
    'already_voted',  v_already,
    'request',        to_jsonb(v_row)
  );
end;
$function$;

comment on function public.utsav_upvote_request(uuid, uuid) is
  'One upvote per (request, device), recorded in a zero-policy table. A repeat returns already_voted true instead of inflating the count.';

-- The 1-argument version is deliberately left in place for now: the deployed
-- bundle still calls it. The contract half drops it.
-- -----------------------------------------------------------------------------
-- 9. Grants
-- -----------------------------------------------------------------------------

grant execute on function public.utsav_carrier_desk_signin(text, text, uuid)       to anon, authenticated;
grant execute on function public.utsav_carrier_desk_session(text)                  to anon, authenticated;
grant execute on function public.utsav_carrier_desk_signout(text)                  to anon, authenticated;
grant execute on function public.utsav_submit_bid(text, text, integer, integer, text, integer, text) to anon, authenticated;
grant execute on function public.utsav_submit_request(uuid, text, text, text, text, text, text, integer) to anon, authenticated;
grant execute on function public.utsav_upvote_request(uuid, uuid)                  to anon, authenticated;
