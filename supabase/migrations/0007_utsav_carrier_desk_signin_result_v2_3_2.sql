-- =============================================================================
-- utsav_carrier_desk_signin_result_v2_3_2 — sign-in returns its refusals
-- =============================================================================
-- Local mirror of a migration applied to project txbgovhxqxvlioszevbe. The
-- remote copy is authoritative; this file exists so the schema is reviewable in
-- git. It must not be re-applied.
--
-- THE BUG
--
-- `utsav_carrier_desk_signin` counted failed passcode attempts by updating
-- `utsav_carriers.failed_attempts` and then raising, so that the fifth failure
-- could lock the desk for fifteen minutes. Raising undoes the update. A call
-- through PostgREST is one transaction: when the function raises, everything it
-- wrote is rolled back and the caller gets an error, so `failed_attempts` went
-- back to zero on every attempt and the lockout branch was unreachable. A desk
-- could be brute-forced at any speed, and the migration that claimed otherwise
-- was wrong.
--
-- A rolled-back probe showed it: six consecutive wrong passcodes all returned
-- `UT401 Those desk credentials were not recognised` and none returned the
-- `UT429` lock, because no attempt ever survived to be counted.
--
-- THE FIX
--
-- Postgres has no autonomous transaction, so a write that must survive a refusal
-- cannot live in the same statement as the refusal. Sign-in therefore stops
-- raising for the paths that need the counter: it returns its answer as data —
-- `{ok: false, code, error}` — which commits normally, and `{ok: true, …}` on
-- success. The client branches on `ok` rather than on `error`, and reads `code`
-- for the same `UT401`/`UT429` distinction it already uses elsewhere.
--
-- This is why sign-in is the only desk function that behaves this way.
-- `utsav_carrier_desk_session`, `utsav_carrier_desk_signout`, `utsav_submit_bid`,
-- `utsav_submit_request` and `utsav_upvote_request` all still raise, because
-- their refusals are computed from rows that are already committed — bid pace
-- counts bids, request cooldown counts receipts, the vote cap counts votes — so
-- there is nothing to lose when the transaction rolls back.
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
  v_locked_for  integer;
begin
  if char_length(v_code) < 3 or coalesce(p_passcode, '') = '' then
    return jsonb_build_object(
      'ok', false, 'code', 'UT401',
      'error', 'Those desk credentials were not recognised.'
    );
  end if;

  select * into v_carrier
  from public.utsav_carriers
  where desk_code = v_code
  for update;

  -- Same answer for an unknown desk and a wrong passcode: the desk code is not an
  -- oracle for which desks exist. Nothing is written on this path, so there is no
  -- counter to protect.
  if not found then
    return jsonb_build_object(
      'ok', false, 'code', 'UT401',
      'error', 'Those desk credentials were not recognised.'
    );
  end if;

  if v_carrier.status <> 'active' then
    return jsonb_build_object(
      'ok', false, 'code', 'UT401',
      'error', 'That desk is suspended. Contact UtsavAir operations.'
    );
  end if;

  if v_carrier.locked_until is not null and v_carrier.locked_until > now() then
    v_locked_for := greatest(1, ceil(extract(epoch from (v_carrier.locked_until - now())) / 60)::integer);
    return jsonb_build_object(
      'ok', false, 'code', 'UT429',
      'error', format('That desk is locked after repeated failed sign-ins. Try again in %s minutes.', v_locked_for),
      'locked_for_minutes', v_locked_for
    );
  end if;

  if extensions.crypt(p_passcode, v_carrier.passcode_hash) <> v_carrier.passcode_hash then
    v_failures := v_carrier.failed_attempts + 1;

    update public.utsav_carriers
    set failed_attempts = v_failures,
        locked_until    = case when v_failures >= 5 then now() + interval '15 minutes' else locked_until end
    where id = v_carrier.id;

    -- Returned, not raised: raising would roll the increment back and the lock
    -- would never be reached.
    if v_failures >= 5 then
      return jsonb_build_object(
        'ok', false, 'code', 'UT429',
        'error', 'That desk is locked after repeated failed sign-ins. Try again in 15 minutes.',
        'locked_for_minutes', 15
      );
    end if;

    return jsonb_build_object(
      'ok', false, 'code', 'UT401',
      'error', 'Those desk credentials were not recognised.',
      'attempts_left', greatest(0, 5 - v_failures)
    );
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
  'Verifies a desk passcode against its bcrypt hash and mints an 8-hour session token. Refusals are returned as {ok:false, code, error} rather than raised, because raising would roll back the failed-attempt counter that drives the 15-minute lockout after five failures.';
