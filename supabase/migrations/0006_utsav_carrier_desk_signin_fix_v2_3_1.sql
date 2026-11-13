-- =============================================================================
-- utsav_carrier_desk_signin_fix_v2_3_1 — qualify the pgcrypto calls
-- =============================================================================
-- Local mirror of a migration applied to project txbgovhxqxvlioszevbe. The
-- remote copy is authoritative; this file exists so the schema is reviewable in
-- git. It must not be re-applied.
--
-- `utsav_carrier_desk_v2_3` created `utsav_carrier_desk_signin` with
-- `SET search_path = public`, which is the right default for a SECURITY DEFINER
-- function — it stops anyone who can create an object in `public` from shadowing
-- a name the function relies on. It was also wrong here, because pgcrypto is
-- installed in the `extensions` schema on this project, not in `public`. Every
-- sign-in therefore died on `function crypt(text, text) does not exist`
-- (SQLSTATE 42883) before it could check a passcode.
--
-- A rolled-back probe caught it: seeding the desks worked, because the seed
-- INSERT ran under the migration's own search_path, so all three rows carry valid
-- bcrypt hashes — only verification was broken. That is the worst shape this bug
-- could have taken: nothing looked wrong in the data, and the failure only
-- appeared when a desk tried to sign in.
--
-- The fix qualifies both extension calls instead of widening the search path.
-- `SET search_path = public, extensions` would also resolve them, but it would
-- re-open the shadowing hole the pinned path was there to close; an explicit
-- schema prefix cannot be shadowed at all. `gen_random_bytes` was wrong for the
-- same reason and is fixed in the same place — the function would have failed on
-- it a few lines later even with `crypt` qualified.
--
-- `gen_random_uuid()` needs no qualifier: it is in pg_catalog since Postgres 13.
-- =============================================================================

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

  -- Same message for an unknown desk and a wrong passcode: the desk code is not
  -- an oracle for which desks exist.
  if not found then
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

  if extensions.crypt(p_passcode, v_carrier.passcode_hash) <> v_carrier.passcode_hash then
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
  v_token   := encode(extensions.gen_random_bytes(32), 'hex');
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
    'ok',            true,
    'session_token', v_token,
    'expires_at',    v_expires,
    'carrier_id',    v_carrier.id,
    'carrier_name',  v_carrier.carrier_name,
    'desk_ref',      v_carrier.desk_code,
    'desk_contact',  v_carrier.desk_contact
  );
end;
$function$;

comment on function public.utsav_carrier_desk_signin(text, text, uuid) is
  'Verifies a desk passcode against its bcrypt hash and mints an 8-hour session token. Five failures lock the desk for 15 minutes. pgcrypto calls are schema-qualified because it is installed in extensions, not public.';
