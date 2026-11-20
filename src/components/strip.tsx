import type { CSSProperties } from "react";

/**
 * One close as a row of marks, one mark per decision, in the order the close
 * room plays them: settled by a rule (ink), decided by the model (grey), sent
 * to the controller (signal). Read down a stack of strips and the ink grows
 * while the signal shrinks - that is the whole product, drawn from the counts.
 */
export interface StripCounts { rule: number; model: number; exception: number }

const KINDS = ["rule", "model", "exception"] as const;

export function Strip({ counts, row = 0, label }: { counts: StripCounts; row?: number; label: string }) {
  const cells = KINDS.flatMap((k) => Array.from({ length: counts[k] }, () => k));
  return (
    <div
      className="strip"
      role="img"
      aria-label={`${label}: ${counts.rule} settled by rule, ${counts.model} decided by the model, ${counts.exception} sent to the controller`}
      style={{ "--row": row } as CSSProperties}
    >
      {cells.map((k, i) => <i key={i} data-k={k} style={{ "--i": i } as CSSProperties} />)}
    </div>
  );
}

export function StripKey({ model = true }: { model?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[11.5px] text-muted">
      <span className="inline-flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 bg-[var(--ink)]" />settled by a rule</span>
      {model ? <span className="inline-flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 bg-[var(--model)]" />decided by the model</span> : null}
      <span className="inline-flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 bg-[var(--signal)]" />sent to the controller</span>
    </span>
  );
}
