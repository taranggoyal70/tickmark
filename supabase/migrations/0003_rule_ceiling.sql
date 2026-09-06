-- The Rule Ceiling was enforced in application code but never stored, so an
-- entity could not actually set its own. A backtested rule is trusted further
-- than a fresh model judgment; above this, nobody is exempt.
alter table entities add column if not exists rule_ceiling_cents bigint not null default 25000000;
