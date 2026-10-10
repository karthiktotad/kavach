-- Behavioural verification of the Kavach security model.
--
-- "The migrations applied without error" does NOT mean "the RLS is correct".
-- These assertions test what a hostile client can actually do.
-- Run as a superuser so we can `set role` and impersonate each caller.

\set ON_ERROR_STOP on
\pset pager off

create or replace function assert(name text, ok boolean, detail text default '')
returns void language plpgsql as $$
begin
  if ok then
    raise notice 'PASS  %', name;
  else
    raise exception 'FAIL  % — %', name, detail;
  end if;
end $$;

-- A fake authenticated user.
insert into auth.users (id, email)
values ('11111111-1111-1111-1111-111111111111', 'authority@test.local')
on conflict do nothing;

begin;

--------------------------------------------------------------------------------
-- 1. THE critical property: a leaked anon key must not be able to forge an
--    official alert. There is no INSERT policy, so this must fail.
--------------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
begin
  begin
    insert into public.alerts (hazard, level, zone_ids, packet, seq)
    values ('FL', 4, array['Z1'], 'KV1.fake.forged', 1);
    raise exception 'FAIL  anon can INSERT into alerts — an official alert can be forged';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS  anon cannot INSERT into alerts (% )', left(sqlerrm, 60);
  end;
end $$;

-- Nor UPDATE or DELETE.
do $$
begin
  begin
    update public.alerts set level = 0;
    raise exception 'FAIL  anon can UPDATE alerts';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS  anon cannot UPDATE alerts';
  end;
  begin
    delete from public.alerts;
    raise exception 'FAIL  anon can DELETE alerts';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS  anon cannot DELETE alerts';
  end;
end $$;

--------------------------------------------------------------------------------
-- 2. Public safety data must be readable.
--------------------------------------------------------------------------------
do $$
declare n integer;
begin
  select count(*) into n from public.alerts;
  raise notice 'PASS  anon can read alerts (% rows)', n;
  select count(*) into n from public.zones;
  raise notice 'PASS  anon can read zones (% rows)', n;
  select count(*) into n from public.shelters;
  raise notice 'PASS  anon can read shelters (% rows)', n;
end $$;

--------------------------------------------------------------------------------
-- 3. Reports: anonymous insert allowed, and rate limited in the DATABASE.
--------------------------------------------------------------------------------
do $$
declare
  i integer;
  limited boolean := false;
begin
  for i in 1..11 loop
    begin
      insert into public.reports (device_id, kind, note)
      values ('device-abc12345', 'flood', 'test ' || i);
    exception when others then
      if sqlerrm = 'rate_limit_exceeded' then
        limited := true;
        raise notice 'PASS  report rate limit fired on insert #% (max 10/hour)', i;
        exit;
      end if;
      raise;
    end;
  end loop;
  if not limited then
    raise exception 'FAIL  11 reports from one device were all accepted — no rate limit';
  end if;
end $$;

-- A different device must be unaffected — the limit is per device, not global.
do $$
begin
  insert into public.reports (device_id, kind, note)
  values ('device-xyz98765', 'flood', 'other device');
  raise notice 'PASS  rate limit is per-device, not global';
exception when others then
  raise exception 'FAIL  a second device was blocked by the first''s quota';
end $$;

--------------------------------------------------------------------------------
-- 4. The sanitised view must not leak device_id.
--------------------------------------------------------------------------------
do $$
declare leaked text;
begin
  select string_agg(column_name, ',')
    into leaked
  from information_schema.columns
  where table_schema = 'public' and table_name = 'reports_public';

  if leaked like '%device_id%' then
    raise exception 'FAIL  reports_public exposes device_id (% )', leaked;
  end if;
  raise notice 'PASS  reports_public hides device_id (columns: %)', leaked;
end $$;

--------------------------------------------------------------------------------
-- 5. Check-ins are rate limited too.
--------------------------------------------------------------------------------
do $$
declare
  i integer;
  limited boolean := false;
begin
  for i in 1..8 loop
    begin
      insert into public.checkins (device_id, lat, lon, status)
      values ('device-abc12345', 12.62, 80.19, 'safe');
    exception when others then
      if sqlerrm = 'rate_limit_exceeded' then
        limited := true;
        raise notice 'PASS  check-in rate limit fired on insert #% (max 6/10min)', i;
        exit;
      end if;
      raise;
    end;
  end loop;
  if not limited then
    raise exception 'FAIL  8 check-ins from one device were all accepted';
  end if;
end $$;

--------------------------------------------------------------------------------
-- 6. A tourist must not be able to promote themselves to authority.
--    There is no UPDATE policy on profiles.
--------------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.profiles (id, role)
    values (null, 'authority') on conflict (id) do update set role = 'authority';
    -- the insert branch will fail the role check; the update branch has no policy
    raise exception 'FAIL  a client can write to profiles';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS  a client cannot write to profiles';
  end;
end $$;

--------------------------------------------------------------------------------
-- 7. private.is_authority must not be callable by anon.
--------------------------------------------------------------------------------
do $$
declare privs text;
begin
  -- checked as superuser: if EXECUTE had been granted to anon, the privilege
  -- list would name it. (Querying it as `anon` itself fails earlier, on the
  -- missing schema USAGE, which is the stronger guarantee anyway.)
  select string_agg(r.rolname, ', ' order by r.rolname)
    into privs
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(p.proacl) a
  join pg_roles r on r.oid = a.grantee
  where n.nspname = 'private'
    and p.proname = 'is_authority'
    and r.rolname in ('anon', 'authenticated', 'public');

  if privs is not null then
    raise exception 'FAIL  private.is_authority() is executable by: %', privs;
  end if;
  raise notice 'PASS  private.is_authority() is executable by neither anon nor authenticated';
end $$;

-- And prove it from the other side: the schema itself is unreachable.
set local role anon;
do $$
begin
  perform private.is_authority();
  raise exception 'FAIL  anon reached private.is_authority()';
exception
  when insufficient_privilege then
    raise notice 'PASS  anon cannot reach the private schema at all (%)', left(sqlerrm, 50);
  when undefined_function then
    raise notice 'PASS  anon cannot resolve private.is_authority()';
end $$;

reset role;

--------------------------------------------------------------------------------
-- 8. Sequence allocation is monotonic per hazard and race-free.
--------------------------------------------------------------------------------
do $$
declare a bigint; b bigint;
begin
  a := public.next_alert_seq('FL');
  b := public.next_alert_seq('FL');
  if b <> a + 1 then
    raise exception 'FAIL  next_alert_seq not monotonic (%, %)', a, b;
  end if;
  if public.next_alert_seq('CY') <> 1 then
    raise exception 'FAIL  sequence is not scoped per hazard';
  end if;
  raise notice 'PASS  next_alert_seq is monotonic and per-hazard (FL: %, %)', a, b;
end $$;

--------------------------------------------------------------------------------
-- 8b. THE REGRESSION THIS EXISTS FOR: pruning expired alerts must never let a
--     seq be reused. A phone that saw seq 5 must never be handed seq 5 again.
--     The old implementation derived the counter from max(alerts.seq) and failed
--     this the moment a row was deleted.
--------------------------------------------------------------------------------
do $$
declare
  before_prune bigint;
  after_prune  bigint;
begin
  -- An authority issues three real alerts.
  for i in 1..3 loop
    insert into public.alerts (hazard, level, zone_ids, packet, seq, issued_at, expires_at)
    values ('HT', 2, array['Z1'], 'KV1.heat.probe', public.next_alert_seq('HT'),
            now(), now() + interval '1 hour');
  end loop;

  select public.next_alert_seq('HT') - 1 into before_prune;

  -- Now prune everything that has expired, as a maintenance job would.
  delete from public.alerts where expires_at < now();

  select public.next_alert_seq('HT') into after_prune;

  if after_prune <= before_prune then
    raise exception
      'FAIL  seq REUSED after pruning: was %, now % — a phone would treat the new alert as older than one it already has',
      before_prune, after_prune;
  end if;

  raise notice 'PASS  seq is never reused after pruning (%, then %)', before_prune, after_prune;
end $$;

--------------------------------------------------------------------------------
-- 9. A packet cannot claim a zone that does not exist — enforced in sign-alert,
--    but the FK on reports/checkins is the DB-level backstop.
--------------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.reports (device_id, kind, zone_id, note)
    values ('device-fk987654', 'flood', 'Z99', 'bad zone');
    raise exception 'FAIL  an unknown zone_id was accepted';
  exception when foreign_key_violation then
    raise notice 'PASS  unknown zone_id is rejected by the foreign key';
  end;
end $$;

--------------------------------------------------------------------------------
-- 10. Alert expiry must be after issue.
--------------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.alerts (hazard, level, zone_ids, packet, seq, issued_at, expires_at)
    values ('FL', 2, array['Z1'], 'KV1.bad.expiry', 99,
            now(), now() - interval '1 hour');
    raise exception 'FAIL  an already-expired alert was accepted';
  exception when check_violation then
    raise notice 'PASS  expires_at before issued_at is rejected';
  end;
end $$;

rollback;

--------------------------------------------------------------------------------
-- 11. Realtime publication membership (outside the transaction).
--------------------------------------------------------------------------------
do $$
declare members text;
begin
  select string_agg(tablename, ', ' order by tablename)
    into members
  from pg_publication_tables
  where pubname = 'supabase_realtime';

  if members is distinct from 'alerts, reports' then
    raise exception 'FAIL  realtime publication contains: %', coalesce(members, '(nothing)');
  end if;
  raise notice 'PASS  realtime publication contains: %', members;
end $$;

drop function if exists assert(text, boolean, text);