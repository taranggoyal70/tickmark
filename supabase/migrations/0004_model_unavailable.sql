-- A close must not fail closed when an external dependency is down. If the
-- model is unreachable the Rulebook still settles what it has already earned
-- and everything else goes to the controller, labelled honestly rather than
-- disguised as low confidence.
alter table exceptions drop constraint if exists exceptions_cause_check;
alter table exceptions add constraint exceptions_cause_check
  check (cause in ('low_confidence','over_materiality','policy_requires_human',
                   'no_candidate','ambiguous_candidates','model_unavailable'));
