-- Tenancy: books belong to the people who imported them.
--
-- entity_members has existed since 0001 but nothing used it, so every signed-in
-- user could read and act on every entity, and an import that reused another
-- company's name wrote into that company's books. From here on the app reads
-- an entity only if it is a public demo or the viewer is a member, writes only
-- where the viewer is a member, and creates entities through
-- create_owned_entity so an import can never land in someone else's books.

-- An explicit flag rather than "an entity nobody belongs to": an orphaned
-- customer entity must stay private, not become public by accident.
alter table entities add column public_demo boolean not null default false;
comment on column entities.public_demo is
  'Readable by anyone, including signed-out visitors. Only for synthetic books.';

-- The bundled sample company is the public demo on existing deployments.
-- Fresh databases get the flag from `npm run ingest -- --sample`.
update entities set public_demo = true where name = 'Northwind Robotics, Inc.';

create index entity_members_user on entity_members (clerk_user_id);

-- Find the caller's entity with this name, or create it with the caller as
-- its controller. One transaction, serialised per user, so two imports in
-- flight cannot create the same company twice or leave an entity with no owner.
create or replace function create_owned_entity(p_user text, p_name text, p_materiality_cents bigint)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  found uuid;
begin
  if coalesce(trim(p_user), '') = '' then
    raise exception 'create_owned_entity needs a user';
  end if;
  perform pg_advisory_xact_lock(hashtext('tickmark:entity:' || p_user));

  select e.id into found
    from entities e
    join entity_members m on m.entity_id = e.id
   where m.clerk_user_id = p_user and e.name = p_name
   order by e.created_at
   limit 1;
  if found is not null then
    return found;
  end if;

  insert into entities (name, materiality_cents)
  values (p_name, p_materiality_cents)
  returning id into found;
  insert into entity_members (entity_id, clerk_user_id, role)
  values (found, p_user, 'controller');
  return found;
end;
$$;

-- Closes a person started, so a public deployment can cap model spend per
-- person. Written before the close runs: a close that fails still counts,
-- because its model calls were still paid for.
create table close_requests (
  id            uuid primary key default gen_random_uuid(),
  entity_id     uuid not null references entities(id) on delete cascade,
  clerk_user_id text not null,
  period_code   text not null,
  requested_at  timestamptz not null default now()
);
create index close_requests_user_time on close_requests (clerk_user_id, requested_at desc);
alter table close_requests enable row level security;

-- Claim one of the caller's closes for the rolling 24 hours. The count and the
-- insert happen under one per-user lock, so parallel clicks cannot all pass.
create or replace function claim_close_slot(p_user text, p_entity uuid, p_period text, p_limit int)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  used int;
begin
  perform pg_advisory_xact_lock(hashtext('tickmark:close:' || p_user));
  select count(*) into used
    from close_requests
   where clerk_user_id = p_user
     and requested_at > now() - interval '24 hours';
  if used >= p_limit then
    return false;
  end if;
  insert into close_requests (entity_id, clerk_user_id, period_code)
  values (p_entity, p_user, p_period);
  return true;
end;
$$;

-- These take the user as an argument, so only server code holding the service
-- role may call them. Postgres grants EXECUTE to PUBLIC by default and
-- Supabase exposes functions over its REST API; without this, anyone with the
-- anon key could create an entity in another user's name.
revoke execute on function create_owned_entity(text, text, bigint) from public, anon, authenticated;
revoke execute on function claim_close_slot(text, uuid, text, int) from public, anon, authenticated;
grant execute on function create_owned_entity(text, text, bigint) to service_role;
grant execute on function claim_close_slot(text, uuid, text, int) to service_role;

-- A decided journal entry is final. Without this, a posted entry could be
-- "rejected" after the fact, or approved again under another name, rewriting
-- the approver of record. Only the decision columns are frozen, so clearing
-- close_run_id when a run is deleted still works.
create or replace function journal_entries_decision_is_final() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status in ('posted', 'rejected')
     and (new.status, new.approver, new.lines, new.posted_at, new.memo)
         is distinct from (old.status, old.approver, old.lines, old.posted_at, old.memo) then
    raise exception 'journal entry % is already %: the decision is final', old.id, old.status;
  end if;
  return new;
end;
$$;

create trigger journal_entries_final before update on journal_entries
  for each row execute function journal_entries_decision_is_final();
