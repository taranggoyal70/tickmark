import { NextResponse } from "next/server";
import { booksFor, isEntityId } from "@/lib/access";
import { signedInUserId } from "@/lib/auth";
import { buildBinder, tickmarksCsv } from "@/lib/close/binder";
import { queueEnabled } from "@/lib/store/queue";

export const dynamic = "force-dynamic";

/**
 * The binder is audit support, so it is downloadable rather than only viewable.
 *
 * It reads ledger rows with the service-role key, so it serves only books the
 * viewer may read (src/lib/access.ts): the public demo to anyone, anything else
 * to its members. A company the viewer may not read is reported as not found,
 * so an id does not reveal whether it exists.
 */
export async function GET(request: Request) {
  // The binder reads the ledger, so without a database there is nothing to
  // assemble. Say that plainly rather than throwing a 500 at whoever asked.
  if (!queueEnabled()) {
    return NextResponse.json(
      { error: "no database configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY" },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const entity = url.searchParams.get("entity");
  const period = url.searchParams.get("period");
  const format = url.searchParams.get("format") ?? "json";
  if (!entity || !period) {
    return NextResponse.json({ error: "entity and period are required" }, { status: 400 });
  }
  if (!isEntityId(entity) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || !["json", "csv"].includes(format)) {
    return NextResponse.json({ error: "entity must be an entity id, period YYYY-MM, format json or csv" }, { status: 400 });
  }

  const readable = await booksFor(await signedInUserId());
  const books = readable.find((b) => b.id === entity);
  if (!books || !books.periods.includes(period)) {
    return NextResponse.json({ error: "no books for that entity and period" }, { status: 404 });
  }

  let binder;
  try {
    binder = await buildBinder(entity, period);
  } catch (e) {
    // the detail goes to the server log, not to whoever asked
    console.error("binder failed", e);
    return NextResponse.json({ error: "could not assemble the binder" }, { status: 500 });
  }
  if (!binder) return NextResponse.json({ error: "no books for that entity and period" }, { status: 404 });

  const slug = `${books.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "entity"}-${period}`;
  if (format === "csv") {
    return new NextResponse(tickmarksCsv(binder), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="tickmarks-${slug}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  }
  return new NextResponse(JSON.stringify(binder, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="close-binder-${slug}.json"`,
      "cache-control": "private, no-store",
    },
  });
}
