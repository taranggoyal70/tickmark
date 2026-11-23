import { envNumber } from "./env";
import { db } from "./ingest/ingest";

/**
 * Who may see and change which books.
 *
 * The app reaches the database with the service role, which row-level security
 * does not restrict, so this module is the access control:
 *
 *   - an entity flagged public_demo is readable by anyone, signed in or not;
 *   - every other entity is readable only by its members (entity_members);
 *   - every write needs membership, the demo included, so one visitor cannot
 *     change what the next one sees.
 *
 * Pages ask booksFor() what they may show. Every write takes the ids from
 * memberEntityIds() and puts them in its own query, so a forged id from the
 * browser matches no row rather than someone else's.
 */

export interface Books {
  id: string;
  name: string;
  /** Period codes with books, ascending. */
  periods: string[];
  /** Readable by anyone: synthetic sample books. */
  demo: boolean;
  /** The viewer is a member, so they may act on these books. */
  member: boolean;
}

/** The entities a signed-in user may write to. Empty when nobody is signed in. */
export async function memberEntityIds(userId: string | null): Promise<string[]> {
  if (!userId) return [];
  const { data, error } = await db().from("entity_members").select("entity_id").eq("clerk_user_id", userId);
  if (error) throw new Error(`memberships: ${error.message}`);
  return [...new Set((data ?? []).map((r) => String(r.entity_id)))];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isEntityId = (x: unknown): x is string => typeof x === "string" && UUID.test(x);

/** The viewer's own books first, then public demos; alphabetical within each. */
export function orderBooks(list: Books[]): Books[] {
  return [...list].sort((a, b) =>
    Number(b.member) - Number(a.member) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** The entity a page should show: the one asked for if the viewer may read it, else the first. */
export function pickBooks(list: Books[], requested: unknown): Books | null {
  const wanted = Array.isArray(requested) ? requested[0] : requested;
  return list.find((b) => b.id === wanted) ?? list[0] ?? null;
}

/**
 * The entities a viewer may read that actually hold books.
 *
 * A period on its own is not books: verification suites leave entities behind,
 * because tickmarks refuse deletion, and those must never surface as something
 * to reconcile. An entity counts once transactions have been ingested into it.
 */
export async function booksFor(userId: string | null): Promise<Books[]> {
  const c = db();
  const mine = await memberEntityIds(userId);
  // ids come from our own table, but check before they go into a filter string
  const ids = mine.filter(isEntityId);
  const { data: ents, error } = await c.from("entities")
    .select("id, name, public_demo")
    .or(ids.length ? `public_demo.eq.true,id.in.(${ids.join(",")})` : "public_demo.eq.true");
  if (error) throw new Error(`entities: ${error.message}`);
  if (!ents?.length) return [];

  const visible = ents.map((e) => String(e.id));
  const { data: pers, error: perErr } = await c.from("periods").select("entity_id, code").in("entity_id", visible).order("code");
  if (perErr) throw new Error(`periods: ${perErr.message}`);

  const has = async (table: "bank_lines" | "ap_invoices", id: string) => {
    const { count, error: e } = await c.from(table).select("id", { count: "exact", head: true }).eq("entity_id", id);
    if (e) throw new Error(`${table}: ${e.message}`);
    return (count ?? 0) > 0;
  };
  const withBooks = new Set<string>();
  await Promise.all(visible.map(async (id) => {
    if ((await has("bank_lines", id)) || (await has("ap_invoices", id))) withBooks.add(id);
  }));

  const periods = new Map<string, string[]>();
  for (const p of pers ?? []) {
    const k = String(p.entity_id);
    (periods.get(k) ?? periods.set(k, []).get(k)!).push(String(p.code));
  }

  return orderBooks(ents
    .filter((e) => withBooks.has(String(e.id)) && periods.get(String(e.id))?.length)
    .map((e) => ({
      id: String(e.id), name: String(e.name), periods: periods.get(String(e.id))!,
      demo: Boolean(e.public_demo), member: ids.includes(String(e.id)),
    })));
}

/**
 * The entity an import writes into: the user's own company of that name, or a
 * new one with them as its controller. Never another user's company and never
 * the demo, whatever name was typed.
 */
export async function ensureOwnedEntity(userId: string, name: string, materialityCents: number): Promise<string> {
  const { data, error } = await db().rpc("create_owned_entity", {
    p_user: userId, p_name: name, p_materiality_cents: materialityCents,
  });
  if (error || !data) throw new Error(`entity: ${error?.message ?? "not created"}`);
  return String(data);
}

/** Closes one person may start in a rolling 24 hours. 0 turns closing off in the browser. */
export const closesPerDay = () => envNumber("TICKMARK_CLOSES_PER_DAY", 10, { integer: true });

/** Reserve one close against the caller's daily allowance. False when it is used up. */
export async function claimCloseSlot(userId: string, entityId: string, period: string): Promise<boolean> {
  const { data, error } = await db().rpc("claim_close_slot", {
    p_user: userId, p_entity: entityId, p_period: period, p_limit: closesPerDay(),
  });
  if (error) throw new Error(`close allowance: ${error.message}`);
  return data === true;
}
