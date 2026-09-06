/** Shared vocabulary for the close agent. Mirrors CONTEXT.md. */

export type RuleKind = "coding" | "matching" | "accrual" | "materiality";
export type RuleStatus = "proposed" | "active" | "disabled" | "rejected";

export type PredicateOp =
  | "vendor_is" | "desc_contains" | "desc_matches"
  | "amount_gte" | "amount_lte" | "source_is" | "cadence_is";

export interface Predicate { op: PredicateOp; value: string | number }

export type RuleAction =
  | { type: "code"; glCode: string; deptSplit: Record<string, number> }
  | { type: "match"; vendorName: string; strategy: MatchStrategy; deltaReason: DeltaReason | null; tolerancePct: number }
  | { type: "accrue"; glCode: string; basis: "trailing_avg_3" | "last_period" }
  | { type: "always_review"; reason: string };

export type DeltaReason = "fx" | "bank_fee" | "partial" | "timing";

/** How a bank line is expected to line up with the ledger for this vendor. */
export type MatchStrategy = "by_invoice" | "same_day_settlement" | "installments";

export interface EvidenceItem {
  correctionId: string;
  periodCode: string;
  /** Verbatim. An auditor must be able to read the human judgment that authorised this. */
  quote: string;
  subjectRef: string;
}

export interface BacktestResult {
  periodsReplayed: string[];
  wouldHaveFired: number;
  wouldHaveBeenCorrect: number;
  wouldHaveBeenWrong: number;
  /** Cases the rule would have silently broken. The number a controller looks at first. */
  regressions: { periodCode: string; subjectRef: string; expected: string; ruleSaid: string }[];
  precision: number;
}

export interface Rule {
  id: string;
  kind: RuleKind;
  name: string;
  predicate: Predicate[];
  action: RuleAction;
  status: RuleStatus;
  version: number;
  evidence: EvidenceItem[];
  backtest: BacktestResult | null;
  hitCount: number;
  createdAt: string;
  /** Derived only from kind + predicate + action. */
  semanticSignature?: string;
  /** An inactive, retained proposal that is equivalent to this active rule. */
  duplicateOf?: string;
  activatedAt?: string;
  deduplicatedAt?: string;
}

// ── the things being closed ──────────────────────────────────────────────────

export interface BankLine {
  externalId: string; postedDate: string; description: string;
  amountCents: number; currency: string; fxRate?: number;
}
export interface LedgerEntry {
  externalId: string; entryDate: string; glCode: string | null; deptCode: string | null;
  vendorName: string | null; amountCents: number; memo: string; source: string;
}
export interface ApInvoice {
  vendorName: string; invoiceNumber: string; invoiceDate: string; dueDate: string;
  amountCents: number; currency: string; description: string;
  lineItems: { label: string; amountCents: number }[];
}

// ── decisions ────────────────────────────────────────────────────────────────

export type Decider = "rule" | "agent" | "human";

export interface CodingDecision {
  invoiceNumber: string;
  glCode: string;
  deptSplit: Record<string, number>;
  confidence: number;
  decidedBy: Decider;
  ruleId?: string;
  reasoning?: string;
}

export interface MatchDecision {
  bankExternalIds: string[];
  ledgerExternalIds: string[];
  cardinality: "1:1" | "1:many" | "many:1" | "many:many";
  amountDeltaCents: number;
  deltaReason: DeltaReason | null;
  confidence: number;
  decidedBy: Decider;
  ruleId?: string;
  reasoning?: string;
}

export interface AccrualProposal {
  vendorName: string; glCode: string; amountCents: number;
  confidence: number; decidedBy: Decider; ruleId?: string; reasoning?: string;
}

export type ExceptionCause =
  | "low_confidence" | "over_materiality" | "policy_requires_human"
  | "no_candidate" | "ambiguous_candidates"
  /** the model could not be reached; the Rulebook still ran */
  | "model_unavailable";

export interface Exception {
  id: string;
  subjectType: "bank_line" | "ap_invoice" | "accrual";
  subjectRef: string;
  cause: ExceptionCause;
  amountCents: number;
  confidence: number | null;
  proposal: unknown;
  options: { label: string; value: unknown }[];
}

/** Ground truth exists only for the sample company; a customer's books have none. */
export interface GroundTruthData {
  coding: Record<string, { glCode: string; deptSplit: Record<string, number> }>;
  matches: { bankExternalIds: string[]; ledgerExternalIds: string[]; cardinality: string; deltaReason: string | null }[];
  expectedAccruals: { vendorName: string; amountCents: number; glCode: string }[];
}

/** Everything a close run needs, whether generated or ingested. */
export interface ClosePeriodData {
  code: string;
  bankLines: BankLine[];
  ledgerEntries: LedgerEntry[];
  apInvoices: ApInvoice[];
  truth?: GroundTruthData;
}

export interface TickmarkRecord {
  subjectType: "bank_line" | "ap_invoice" | "journal_entry";
  subjectRef: string;
  assertedBy: "rule" | "agent";
  confidence: number;
  ruleId?: string;
  evidence: { note: string; refs: string[] }[];
}

export interface CloseRunResult {
  periodCode: string;
  rulebookVersion: number;
  codings: CodingDecision[];
  matches: MatchDecision[];
  accruals: AccrualProposal[];
  exceptions: Exception[];
  /** the verifications this run is prepared to stand behind */
  tickmarks: TickmarkRecord[];
  tickmarked: number;
  stats: RunStats;
}

export interface RunStats {
  llmCalls: number;
  ruleHits: number;
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
  durationMs: number;
  /** measured against ground truth, never self-reported */
  codingAccuracy: number;
  matchAccuracy: number;
  autoClearRate: number;
  exceptionsOpened: number;
  /** precision of what the agent cleared without asking. must stay ~1.0 */
  autoClearPrecision: number;
  /** false when the books carry no answer key, which is the normal case */
  scored: boolean;
  /** batches the model could not serve; the Rulebook still ran */
  modelFailures: number;
}

export interface Rulebook {
  version: number;
  rules: Rule[];
}
