import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { buildBinder, tickmarksCsv } from "@/lib/close/binder";
import { queueEnabled } from "@/lib/store/queue";

export const dynamic = "force-dynamic";

/**
 * The binder is audit support, so it is downloadable rather than only viewable.
 *
 * It reads ledger rows with the service-role key, so it requires a signed-in
 * user. A public demo over synthetic books can opt out with
 * TICKMARK_PUBLIC_READ=1; never set that where real books are imported.
 */
export async function GET(request: Request) {
  if (process.env.TICKMARK_PUBLIC_READ !== "1") {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "sign in to download a binder" }, { status: 401 });
  }

  // The binder reads the ledger, so without a database there is nothing to
  // assemble. Say that plainly rather than throwing a 500 at whoever asked.
  if (!queueEnabled()) {
    return NextResponse.json(
      { error: "no database configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY" },
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
  if (entity.length > 120 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || !["json", "csv"].includes(format)) {
    return NextResponse.json({ error: "entity must be at most 120 characters, period YYYY-MM, format json or csv" }, { status: 400 });
  }

  let binder;
  try {
    binder = await buildBinder(entity, period);
  } catch (e) {
    // the detail goes to the server log, not to whoever asked
    console.error("binder failed", e);
    return NextResponse.json({ error: "could not assemble the binder" }, { status: 500 });
  }
  if (!binder) return NextResponse.json({ error: `no books for ${entity} ${period}` }, { status: 404 });

  const slug = `${entity.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${period}`;
  if (format === "csv") {
    return new NextResponse(tickmarksCsv(binder), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="tickmarks-${slug}.csv"`,
      },
    });
  }
  return new NextResponse(JSON.stringify(binder, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="close-binder-${slug}.json"`,
    },
  });
}
