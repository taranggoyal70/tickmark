-- Tickmark: month-end close agent. Initial schema.
-- Money is stored as integer cents. Never floats.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────── reference data

create table entities (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  base_currency           text not null default 'USD',
  -- hard gate: above this, a human reviews regardless of confidence
  materiality_cents       bigint not null default 500000,
  -- agent may self-tickmark at or above this confidence
  auto_tickmark_threshold numeric(4,3) not null default 0.900,
  created_at              timestamptz not null default now()
);

create table entity_members (
  entity_id  uuid not null references entities(id) on delete cascade,
  clerk_user_id text not null,
  role       text not null default 'controller'
             check (role in ('controller','preparer','approver','auditor')),
  created_at timestamptz not null default now(),
  primary key (entity_id, clerk_user_id)
);

create table gl_accounts (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid not null references entities(id) on delete cascade,
  code           text not null,
  name           text not null,
  type           text not null check (type in ('asset','liability','equity','revenue','expense')),
  normal_balance text not null check (normal_balance in ('debit','credit')),
  unique (entity_id, code)
);

create table departments (
  id        uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entities(id) on delete cascade,
  code      text not null,
  name      text not null,
  unique (entity_id, code)
);

create table vendors (
  id            uuid primary key default gen_random_uuid(),
  entity_id     uuid not null references entities(id) on delete cascade,
  name          text not null,
  -- how this vendor actually shows up on a bank statement, which is never its legal name
  bank_aliases  text[] not null default '{}',
  payment_terms int not null default 30,
  -- set when the vendor bills on a predictable cadence; drives accrual completeness
  recurring     boolean not null default false,
  cadence       text check (cadence in ('monthly','quarterly','annual')),
  unique (entity_id, name)
);

create table periods (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid not null references entities(id) on delete cascade,
  code        text not null,                    -- '2026-01'
  start_date  date not null,
  end_date    date not null,
  cutoff_date date not null,
  status      text not null default 'open' check (status in ('open','in_close','closed')),
  unique (entity_id, code)
);

-- ─────────────────────────────────────────────────────────── transactional

create table bank_lines (
  id               uuid primary key default gen_random_uuid(),
  entity_id        uuid not null references entities(id) on delete cascade,
  period_id        uuid not null references periods(id) on delete cascade,
  posted_date      date not null,
  description      text not null,               -- raw, ugly, as the bank sends it
  amount_cents     bigint not null,             -- negative = money out
  currency         text not null default 'USD',
  fx_rate          numeric(12,6),
  external_id      text not null,
  unique (entity_id, external_id)
);

create table ledger_entries (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid not null references entities(id) on delete cascade,
  period_id      uuid not null references periods(id) on delete cascade,
  entry_date     date not null,
  gl_account_id  uuid references gl_accounts(id),
  department_id  uuid references departments(id),
  vendor_id      uuid references vendors(id),
  amount_cents   bigint not null,
  memo           text not null default '',
  source         text not null check (source in ('ap','ar','payroll','manual','bank_fee')),
  external_id    text not null,
  unique (entity_id, external_id)
);

create table ap_invoices (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid not null references entities(id) on delete cascade,
  period_id      uuid not null references periods(id) on delete cascade,
  vendor_id      uuid not null references vendors(id),
  invoice_number text not null,
  invoice_date   date not null,
  due_date       date not null,
  amount_cents   bigint not null,
  currency       text not null default 'USD',
  description    text not null default '',
  line_items     jsonb not null default '[]'::jsonb,
  -- null until coded. this is the work.
  gl_account_id  uuid references gl_accounts(id),
  department_id  uuid references departments(id),
  status         text not null default 'uncoded'
                 check (status in ('uncoded','coded','paid')),
  unique (entity_id, vendor_id, invoice_number)
);

-- ─────────────────────────────────────────────────────────── the agent

create table close_runs (
  id               uuid primary key default gen_random_uuid(),
  entity_id        uuid not null references entities(id) on delete cascade,
  period_id        uuid not null references periods(id) on delete cascade,
  -- reproducibility: which weights were loaded for this forward pass
  rulebook_version int not null,
  status           text not null default 'running'
                   check (status in ('running','succeeded','failed')),
  model            text,
  tokens_in        bigint not null default 0,
  tokens_out       bigint not null default 0,
  -- micro-dollars. $1.00 = 1_000_000
  cost_micros      bigint not null default 0,
  llm_calls        int not null default 0,
  -- decisions closed by a compiled Rule, costing zero tokens
  rule_hits        int not null default 0,
  duration_ms      int,
  stats            jsonb not null default '{}'::jsonb,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz
);

create table matches (
  id                 uuid primary key default gen_random_uuid(),
  entity_id          uuid not null references entities(id) on delete cascade,
  period_id          uuid not null references periods(id) on delete cascade,
  close_run_id       uuid references close_runs(id) on delete cascade,
  bank_line_ids      uuid[] not null,
  ledger_entry_ids   uuid[] not null,
  cardinality        text not null check (cardinality in ('1:1','1:many','many:1','many:many')),
  amount_delta_cents bigint not null default 0,
  delta_reason       text,                       -- 'fx' | 'bank_fee' | 'partial' | 'timing' | null
  confidence         numeric(4,3) not null,
  decided_by         text not null check (decided_by in ('rule','agent','human')),
  rule_id            uuid,
  reasoning          text,
  created_at         timestamptz not null default now()
);

-- Append-only. Superseded, never updated or deleted. Enforced by trigger below.
create table tickmarks (
  id           uuid primary key default gen_random_uuid(),
  entity_id    uuid not null references entities(id) on delete cascade,
  period_id    uuid not null references periods(id) on delete cascade,
  close_run_id uuid references close_runs(id) on delete set null,
  subject_type text not null check (subject_type in ('bank_line','ap_invoice','ledger_entry','journal_entry')),
  subject_id   uuid not null,
  asserted_by  text not null check (asserted_by in ('rule','agent','human')),
  actor        text not null,
  confidence   numeric(4,3),
  rule_id      uuid,
  evidence     jsonb not null default '[]'::jsonb,
  supersedes   uuid references tickmarks(id),
  created_at   timestamptz not null default now()
);

create table exceptions (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid not null references entities(id) on delete cascade,
  period_id      uuid not null references periods(id) on delete cascade,
  close_run_id   uuid not null references close_runs(id) on delete cascade,
  subject_type   text not null,
  subject_id     uuid not null,
  -- an exception is not an error; it is the system correctly asking for judgment
  cause          text not null check (cause in ('low_confidence','over_materiality','policy_requires_human','no_candidate','ambiguous_candidates')),
  amount_cents   bigint not null default 0,
  confidence     numeric(4,3),
  agent_proposal jsonb not null default '{}'::jsonb,
  options        jsonb not null default '[]'::jsonb,
  status         text not null default 'open' check (status in ('open','resolved','dismissed')),
  opened_at      timestamptz not null default now(),
  resolved_at    timestamptz
);

-- ─────────────────────────────────────────────────────────── the learning loop

-- The loss signal. One structured human judgment.
create table corrections (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid not null references entities(id) on delete cascade,
  period_id      uuid not null references periods(id) on delete cascade,
  exception_id   uuid not null references exceptions(id) on delete cascade,
  action         text not null check (action in ('accept','amend','reject')),
  agent_proposal jsonb not null default '{}'::jsonb,
  human_decision jsonb not null default '{}'::jsonb,
  note           text,
  actor          text not null,
  -- seconds the human spent; the number a CFO actually cares about
  touch_seconds  int not null default 0,
  created_at     timestamptz not null default now()
);

-- The weights. Deterministic, versioned, inspectable, zero-token to execute.
create table rules (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid not null references entities(id) on delete cascade,
  kind           text not null check (kind in ('coding','matching','accrual','materiality')),
  name           text not null,
  predicate      jsonb not null,
  action         jsonb not null,
  status         text not null default 'proposed'
                 check (status in ('proposed','active','disabled','rejected')),
  version        int not null default 1,
  -- >= 2 distinct corrections, quoted verbatim. an auditor can trace any
  -- automated decision back to the human judgment that authorised it.
  evidence       jsonb not null default '[]'::jsonb,
  -- a rule that has never been backtested cannot be activated (trigger below)
  backtest       jsonb,
  gradient_step_id uuid,
  supersedes     uuid references rules(id),
  created_at     timestamptz not null default now(),
  activated_at   timestamptz,
  hit_count      int not null default 0
);

create table gradient_steps (
  id                     uuid primary key default gen_random_uuid(),
  entity_id              uuid not null references entities(id) on delete cascade,
  period_id              uuid not null references periods(id) on delete cascade,
  corrections_considered int not null default 0,
  rules_proposed         int not null default 0,
  rules_accepted         int not null default 0,
  rules_rejected         int not null default 0,
  cost_micros            bigint not null default 0,
  rulebook_version_from  int not null,
  rulebook_version_to    int,
  summary                jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now()
);

create table journal_entries (
  id           uuid primary key default gen_random_uuid(),
  entity_id    uuid not null references entities(id) on delete cascade,
  period_id    uuid not null references periods(id) on delete cascade,
  close_run_id uuid references close_runs(id) on delete set null,
  kind         text not null check (kind in ('accrual','reclass','fx','bank_fee','prepaid')),
  memo         text not null,
  -- [{ gl_account_id, department_id, debit_cents, credit_cents }]
  lines        jsonb not null,
  preparer     text not null,
  approver     text,
  status       text not null default 'draft'
               check (status in ('draft','pending_approval','approved','posted','rejected')),
  created_at   timestamptz not null default now(),
  posted_at    timestamptz
);

-- ─────────────────────────────────────────────────────────── invariants

-- Invariant 2: no tickmark is ever mutated or deleted, only superseded.
create or replace function tickmarks_are_immutable() returns trigger
language plpgsql as $fn$
begin
  raise exception 'tickmarks are append-only: supersede it with a new tickmark instead of %', tg_op;
end;
$fn$;

create trigger tickmarks_no_update before update on tickmarks
  for each row execute function tickmarks_are_immutable();
create trigger tickmarks_no_delete before delete on tickmarks
  for each row execute function tickmarks_are_immutable();

-- Invariant 1: debits equal credits. Arithmetic, never model output.
create or replace function journal_entries_must_balance() returns trigger
language plpgsql as $fn$
declare dr bigint; cr bigint;
begin
  select coalesce(sum((l->>'debit_cents')::bigint), 0),
         coalesce(sum((l->>'credit_cents')::bigint), 0)
    into dr, cr
    from jsonb_array_elements(new.lines) l;
  if dr <> cr then
    raise exception 'journal entry does not balance: debits % <> credits %', dr, cr;
  end if;
  return new;
end;
$fn$;

create trigger journal_entries_balance before insert or update on journal_entries
  for each row execute function journal_entries_must_balance();

-- Invariant 4: preparer != approver (segregation of duties).
create or replace function journal_entries_segregation() returns trigger
language plpgsql as $fn$
begin
  if new.approver is not null and new.approver = new.preparer then
    raise exception 'segregation of duties: preparer and approver must differ (%)', new.preparer;
  end if;
  return new;
end;
$fn$;

create trigger journal_entries_sod before insert or update on journal_entries
  for each row execute function journal_entries_segregation();

-- Invariant 6: a rule that has never been backtested cannot be activated.
create or replace function rules_require_backtest() returns trigger
language plpgsql as $fn$
begin
  if new.status = 'active' and new.backtest is null then
    raise exception 'rule % cannot be activated without a backtest', new.name;
  end if;
  if new.status = 'active' and jsonb_array_length(coalesce(new.evidence, '[]'::jsonb)) < 2 then
    raise exception 'rule % needs evidence from at least 2 distinct corrections', new.name;
  end if;
  return new;
end;
$fn$;

create trigger rules_backtest_gate before insert or update on rules
  for each row execute function rules_require_backtest();

-- ─────────────────────────────────────────────────────────── indexes

create index on bank_lines (entity_id, period_id);
create index on ledger_entries (entity_id, period_id);
create index on ap_invoices (entity_id, period_id, status);
create index on exceptions (entity_id, period_id, status);
create index on corrections (entity_id, period_id);
create index on tickmarks (entity_id, subject_type, subject_id);
create index on rules (entity_id, status, kind);
create index on close_runs (entity_id, period_id);

-- ─────────────────────────────────────────────────────────── access

-- Every read and write goes through Next.js server code authenticated by Clerk,
-- using the service role. RLS is on with no permissive policy, so the anon key
-- cannot reach any row directly.
alter table entities        enable row level security;
alter table entity_members  enable row level security;
alter table gl_accounts     enable row level security;
alter table departments     enable row level security;
alter table vendors         enable row level security;
alter table periods         enable row level security;
alter table bank_lines      enable row level security;
alter table ledger_entries  enable row level security;
alter table ap_invoices     enable row level security;
alter table close_runs      enable row level security;
alter table matches         enable row level security;
alter table tickmarks       enable row level security;
alter table exceptions      enable row level security;
alter table corrections     enable row level security;
alter table rules           enable row level security;
alter table gradient_steps  enable row level security;
alter table journal_entries enable row level security;

-- Report artifacts from headless eval runs, so the dashboard reads the same
-- numbers the harness measured.
create table simulation_reports (
  id           uuid primary key default gen_random_uuid(),
  entity_name  text not null,
  model        text not null,
  generated_at timestamptz not null,
  payload      jsonb not null,
  created_at   timestamptz not null default now()
);
create index on simulation_reports (generated_at desc);
alter table simulation_reports enable row level security;
-- Data API grants.
--
-- The project was created with "automatically expose new tables" OFF, so no
-- API role has privileges by default. That is the posture we want: the anon and
-- authenticated roles must never reach a ledger row. Only service_role - which
-- is server-side only, held by Next.js route handlers behind Clerk - is granted
-- anything. RLS stays enabled on every table as defence in depth.
revoke all on all tables in schema public from anon, authenticated;

grant usage on schema public to service_role;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
