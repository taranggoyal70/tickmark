/**
 * Processor settlements, tested on the shape a payout breakup export has.
 *
 * The arithmetic is the whole point: a deposit that does not equal gross less
 * fee is not understood, and posting it would put an unexplained credit in the
 * bank reconciliation for someone to chase.
 */
import { readSettlements } from "../src/lib/ingest/settlements";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(52)} ${detail}`);
};

// header names deliberately unlike ours, as a processor's export would be
const DODO = `Transaction ID,Settlement Date,Gross Amount,Fee,Net Amount,Currency,Product
txn_8891,2027-02-03,"$4,200.00",$126.00,"$4,074.00",USD,Pro plan
txn_8892,03/02/2027,"1,050.00",31.50,"1,018.50",USD,Starter plan
txn_8893,2027-02-04,"900.00",27.00,"880.00",USD,Mismatched on purpose
txn_8894,2027-02-05,"0.00",0.00,"0.00",USD,Zero settlement
`;

function main() {
  const s = readSettlements(DODO, { processor: "Dodo" });

  check("column names matched by alias", Object.keys(s.mapping).length >= 5,
    Object.entries(s.mapping).map(([k, v]) => `${k}=${v}`).join(", ").slice(0, 58));
  check("good settlements become bank deposits", s.bank.length === 2, `${s.bank.length} of 4 rows`);
  check("each settlement expands to revenue and fee", s.ledger.length === 4, `${s.ledger.length} ledger entries`);

  const first = s.bank[0];
  check("deposit is booked at net, not gross", first?.amount === "4074.00", String(first?.amount));
  const rev = s.ledger.find((l) => l.external_id.endsWith("-REV"));
  const fee = s.ledger.find((l) => l.external_id.endsWith("-FEE"));
  check("revenue is a credit at gross", rev?.amount === "-4200.00", String(rev?.amount));
  check("fee is a debit", fee?.amount === "126.00", String(fee?.amount));

  const sum = Number(rev?.amount) + Number(fee?.amount) + Number(first?.amount);
  check("the three rows net to zero", Math.abs(sum) < 0.005, sum.toFixed(2));

  check("a US date in the same file is normalised", s.bank[1]?.posted_date === "2027-03-02", String(s.bank[1]?.posted_date));
  check("a settlement whose arithmetic fails is refused",
    s.rejected.some((r) => /but net is/.test(r.reason)),
    s.rejected.find((r) => /but net is/.test(r.reason))?.reason.slice(0, 56) ?? "not refused");
  check("a zero settlement is not posted", s.rejected.some((r) => /zero/.test(r.reason)), "nothing to record");

  console.log(`\n${fail === 0 ? "a processor payout reconciles to the deposit" : `${fail} check(s) failed`}  (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
