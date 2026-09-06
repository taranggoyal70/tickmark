# Measured-evidence run — 2026-09-06

Status: **completed, passed the measured-report gate, and persisted to Supabase.**

## Reproducibility

- Completed at: `2026-09-06T20:40:09.740Z`
- Runtime: Node.js `v24.10.0`
- Route: OpenAI-compatible local endpoint
- Model: `llama3.2:1b`
- Structured output: explicitly enabled
- Model failures: `0`
- Skipped gradient steps: `0`
- Successful model calls, including gradient calls: `30`
- Price: unconfigured for the self-hosted endpoint, reported as `$0.0000`

Ground truth is attached to the generated fixture but never included in model
prompts. It is used only after each close to score the decisions.

## Results

| Period | Auto-clear | Coding accuracy | Match accuracy | Exceptions | Close calls | Rule hits | Controller time | Unattended precision |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2026-01 | 0% | 0% | 0% | 86 | 7 | 0 | 63 min | 100% |
| 2026-02 | 0% | 0% | 0% | 91 | 7 | 0 | 68 min | 100% |
| 2026-03 | 62% | 90% | 0% | 61 | 6 | 18 | 44 min | 100% |
| 2026-04 | 39% | 54% | 0% | 71 | 6 | 22 | 47 min | 100% |

Five coding rules activated after two periods supplied distinct corrections and
the replay found at least two correct historical firings at 100% precision.
They covered Mouser Electronics, Digi-Key Electronics, Flexport, Cooley LLP,
and United Airlines.

## Interpretation

The small model was poor at direct matching and sometimes poor at coding. The
system did not hide that result. Fresh model suggestions were routed to review;
only rules compiled from signed controller corrections and a passing backtest
could clear work unattended. That control held precision at 100% while rule
hits rose from 0 to 22, close-model calls fell from 7 to 6, and modeled
controller time fell from 63 to 47 minutes.

The self-hosted endpoint had no configured token rate. The report therefore
shows `$0.0000`; it does not claim a fictional dollar saving. The measured
resource result is the reduction in calls and controller touch time.

## Safety behavior observed during iteration

Earlier runs exposed three failure modes: unavailable hosted billing, invalid
structured output, and an excessively long local generation. Those runs were
not used as performance evidence. The product now:

- rejects reports containing failed model batches, skipped gradients, no real
  calls, or mock provenance;
- prices the model actually served by a custom endpoint rather than the fallback
  model id;
- bounds output length and request duration; and
- treats model confidence as a suggestion, never as authority to write the
  books.
