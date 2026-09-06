-- Fresh model suggestions are reviewable evidence, not authority to clear the
-- books. Persist that explicit cause in the controller queue.

alter table exceptions drop constraint if exists exceptions_cause_check;

alter table exceptions add constraint exceptions_cause_check
  check (cause in (
    'low_confidence',
    'over_materiality',
    'policy_requires_human',
    'no_candidate',
    'ambiguous_candidates',
    'model_unavailable',
    'unverified_model_judgment'
  ));
