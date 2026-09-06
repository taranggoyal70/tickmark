-- One executable Rule per semantic decision, without deleting later proposals.
-- The signature excludes names, evidence, backtests, ids, and dates: those are
-- audit history, not behavior. Predicate order is irrelevant because every
-- predicate is conjunctive. Text uses the same normalization as evaluation.

alter table rules add column semantic_signature jsonb;
alter table rules add column duplicate_of uuid references rules(id);
alter table rules add column deduplicated_at timestamptz;

create or replace function normalize_rule_text(value text) returns text
language sql immutable strict as $fn$
  select trim(regexp_replace(regexp_replace(upper(value), '[^A-Z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'));
$fn$;

create or replace function rule_semantic_signature(
  rule_kind text, rule_predicate jsonb, rule_action jsonb
) returns jsonb
language sql immutable as $fn$
  select jsonb_build_object(
    'kind', rule_kind,
    'predicate', coalesce((
      select jsonb_agg(item order by item::text)
      from (
        select distinct case
          when predicate->>'op' in ('vendor_is', 'desc_contains')
            then jsonb_set(predicate, '{value}', to_jsonb(normalize_rule_text(predicate->>'value')))
          else predicate
        end as item
        from jsonb_array_elements(coalesce(rule_predicate, '[]'::jsonb)) predicate
      ) canonical_predicates
    ), '[]'::jsonb),
    'action', case
      when rule_action->>'type' = 'match'
        then jsonb_set(rule_action, '{vendorName}', to_jsonb(normalize_rule_text(rule_action->>'vendorName')))
      else rule_action
    end
  );
$fn$;

create or replace function rules_set_semantic_signature() returns trigger
language plpgsql as $fn$
begin
  new.semantic_signature := rule_semantic_signature(new.kind, new.predicate, new.action);
  return new;
end;
$fn$;

create trigger rules_semantic_signature
  before insert or update on rules
  for each row execute function rules_set_semantic_signature();

update rules
set semantic_signature = rule_semantic_signature(kind, predicate, action);

-- If historical data already contains duplicates, keep the earliest active
-- rule executing and retain every later rule, its adopter, and its evidence.
with ranked as (
  select
    id,
    first_value(id) over (
      partition by entity_id, semantic_signature
      order by coalesce(activated_at, created_at), created_at, id
    ) as canonical_id,
    row_number() over (
      partition by entity_id, semantic_signature
      order by coalesce(activated_at, created_at), created_at, id
    ) as semantic_rank
  from rules
  where status = 'active'
)
update rules as duplicate
set
  status = 'disabled',
  duplicate_of = ranked.canonical_id,
  deduplicated_at = now()
from ranked
where duplicate.id = ranked.id
  and ranked.semantic_rank > 1;

alter table rules alter column semantic_signature set not null;

create unique index rules_one_active_semantic_signature
  on rules (entity_id, semantic_signature)
  where status = 'active';
