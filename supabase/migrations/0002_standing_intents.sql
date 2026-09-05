-- Standing Intents and attributable Rule Adoption.
--
-- A controller resolving one exception can say "always do this". That is not a
-- Rule and must never behave like one - the evidence gate still needs a second
-- corroborating Correction. This table is where the instruction waits.

create table standing_intents (
  id           uuid primary key default gen_random_uuid(),
  entity_id    uuid not null references entities(id) on delete cascade,
  period_id    uuid not null references periods(id) on delete cascade,
  -- the correction that raised it; the intent is meaningless without it
  correction_id uuid not null references corrections(id) on delete cascade,
  kind         text not null check (kind in ('coding','matching','accrual')),
  -- what the controller wants generalised, e.g. {"vendor":"Amazon Web Services"}
  scope        jsonb not null,
  actor        text not null,
  status       text not null default 'open'
               check (status in ('open','seconded','withdrawn','superseded')),
  seconded_by_correction_id uuid references corrections(id),
  seconded_at  timestamptz,
  became_rule_id uuid references rules(id),
  created_at   timestamptz not null default now(),
  -- one open intent per scope per kind; saying it twice is not more evidence
  unique (entity_id, kind, scope, status)
);

create index on standing_intents (entity_id, status, kind);

-- Invariant 9: adoption is attributable.
alter table rules add column adopted_by     text;
-- Every citation came from the person who adopted it. Never blocking - the
-- backtest is the gate - but an auditor should not have to reconstruct this.
alter table rules add column self_evidenced boolean not null default false;

create or replace function rules_adoption_is_attributable() returns trigger
language plpgsql as $fn$
begin
  if new.status = 'active' and coalesce(new.adopted_by, '') = '' then
    raise exception 'rule % cannot be active without naming who adopted it', new.name;
  end if;
  return new;
end;
$fn$;

create trigger rules_attributable before insert or update on rules
  for each row execute function rules_adoption_is_attributable();

alter table standing_intents enable row level security;
grant all privileges on standing_intents to service_role;
