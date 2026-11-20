-- A rule decision drawn for audit sampling goes to a person even though the
-- rule would have cleared it. That is how a vendor whose policy changed is
-- caught before months of silent miscoding. Allow the cause in the queue.

alter table exceptions drop constraint if exists exceptions_cause_check;

alter table exceptions add constraint exceptions_cause_check
  check (cause in (
    'low_confidence',
    'over_materiality',
    'policy_requires_human',
    'no_candidate',
    'ambiguous_candidates',
    'model_unavailable',
    'unverified_model_judgment',
    'audit_sample'
  ));
