import { NextResponse } from "next/server";
import { buildBinder, tickmarksCsv } from "@/lib/close/binder";
import { queueEnabled } from "@/lib/store/queue";

export const dynamic = "force-dynamic";

/**
 * The binder is audit support, so it is downloadable rather than only viewable.
 * Deliberately unauthenticated for the same reason the dashboard is: it reports
 * on a synthetic fixture here, and an auditor should not need an account to be
 * handed a file. Gate this before pointing it at a real entity.
 */
export async function GET(request: Request) {
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

  let binder;
  try {
    binder = await buildBinder(entity, period);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
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
