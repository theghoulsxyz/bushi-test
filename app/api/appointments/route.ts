import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Store = Record<string, Record<string, string>>;

// IMPORTANT: these env names must match Netlify + .env.local
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// -----------------------------------------------------------------------------
// GET  /api/appointments
// Returns full calendar as: { "2025-12-01": { "08:00": "Name", ... }, ... }
// -----------------------------------------------------------------------------
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("appointments")
      .select("day,time,name");

    if (error) {
      console.error("GET /api/appointments error:", error);
      return NextResponse.json({}, { status: 200 });
    }

    const store: Store = {};
    (data || []).forEach((row: any) => {
      const day = row.day as string;
      const time = row.time as string;
      const name = row.name as string;

      if (!day || !time) return;
      if (!store[day]) store[day] = {};
      store[day][time] = name || "";
    });

    return NextResponse.json(store, { status: 200 });
  } catch (e) {
    console.error("GET /api/appointments exception:", e);
    return NextResponse.json({}, { status: 200 });
  }
}

// -----------------------------------------------------------------------------
// POST /api/appointments
// Body: full Store object. We overwrite the entire table:
//   1) delete all existing rows
//   2) insert new rows for all non-empty slots
// -----------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid payload" },
        { status: 400 }
      );
    }

    const store = body as Store;

    // Build flat list of rows to insert
    const rows: { day: string; time: string; name: string }[] = [];

    for (const day of Object.keys(store)) {
      const slots = store[day];
      if (!slots || typeof slots !== "object") continue;

      for (const time of Object.keys(slots)) {
        const name = (slots[time] || "").trim();
        if (name === "") continue; // skip empty
        rows.push({ day, time, name });
      }
    }

    // 1) Delete ALL rows in appointments
    // Supabase doesn't allow completely unfiltered delete(),
    // so we use "id IS NOT NULL" to target all rows.
    const { error: delError } = await supabase
      .from("appointments")
      .delete()
      .not("id", "is", null);

    if (delError) {
      console.error("POST /api/appointments delete error:", delError);
      return NextResponse.json(
        { error: "Failed to clear existing appointments" },
        { status: 500 }
      );
    }

    // 2) Insert new snapshot (if any)
    if (rows.length > 0) {
      const { error: insError } = await supabase
        .from("appointments")
        .insert(rows);

      if (insError) {
        console.error("POST /api/appointments insert error:", insError);
        return NextResponse.json(
          { error: "Failed to save appointments" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("POST /api/appointments exception:", e);
    return NextResponse.json(
      { error: "Exception while saving" },
      { status: 500 }
    );
  }
}
