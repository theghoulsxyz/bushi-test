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

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

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
// PATCH /api/appointments  (SAFE: single-slot operations, no wipe possible)
// Body examples:
//  { op: "set", day: "2025-12-01", time: "10:30", name: "Ivan" }
//  { op: "clear", day: "2025-12-01", time: "10:30" }
// -----------------------------------------------------------------------------
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const op = (body as any).op as string;
    const day = (body as any).day as string;
    const time = (body as any).time as string;
    const nameRaw = (body as any).name as string | undefined;

    if (!op || !day || !time) {
      return NextResponse.json(
        { error: "Missing op/day/time" },
        { status: 400 }
      );
    }

    if (!DAY_RE.test(day) || !TIME_RE.test(time)) {
      return NextResponse.json(
        { error: "Invalid day/time format" },
        { status: 400 }
      );
    }

    if (op === "clear") {
      const { error: delErr } = await supabase
        .from("appointments")
        .delete()
        .eq("day", day)
        .eq("time", time);

      if (delErr) {
        console.error("PATCH clear error:", delErr);
        return NextResponse.json(
          { error: "Failed to clear slot" },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (op === "set") {
      const name = (nameRaw ?? "").trim();

      // empty name = treat as clear
      if (name === "") {
        const { error: delErr } = await supabase
          .from("appointments")
          .delete()
          .eq("day", day)
          .eq("time", time);

        if (delErr) {
          console.error("PATCH set->clear error:", delErr);
          return NextResponse.json(
            { error: "Failed to clear slot" },
            { status: 500 }
          );
        }

        return NextResponse.json({ ok: true }, { status: 200 });
      }

      // Prefer UPSERT (requires unique constraint on (day,time)).
      // If your table doesn't have it yet, add it in Supabase:
      //   create unique index appointments_day_time_unique on appointments(day, time);
      const { error: upsertErr } = await supabase
        .from("appointments")
        .upsert([{ day, time, name }], { onConflict: "day,time" });

      if (upsertErr) {
        // Fallback: delete+insert (works even without unique constraint)
        console.warn(
          "PATCH set upsert failed, falling back to delete+insert:",
          upsertErr
        );

        const { error: delErr } = await supabase
          .from("appointments")
          .delete()
          .eq("day", day)
          .eq("time", time);

        if (delErr) {
          console.error("PATCH set fallback delete error:", delErr);
          return NextResponse.json(
            { error: "Failed to set slot (fallback delete)" },
            { status: 500 }
          );
        }

        const { error: insErr } = await supabase
          .from("appointments")
          .insert([{ day, time, name }]);

        if (insErr) {
          console.error("PATCH set fallback insert error:", insErr);
          return NextResponse.json(
            { error: "Failed to set slot (fallback insert)" },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    return NextResponse.json({ error: "Unknown op" }, { status: 400 });
  } catch (e) {
    console.error("PATCH /api/appointments exception:", e);
    return NextResponse.json(
      { error: "Exception while patching" },
      { status: 500 }
    );
  }
}

// -----------------------------------------------------------------------------
// POST /api/appointments  (DANGEROUS BULK OVERWRITE)
// NOW PROTECTED so OLD CLIENTS CAN'T WIPE THE TABLE.
// Required body:
//   { _dangerouslyOverwriteAll: true, store: { ...fullStore } }
// -----------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const allow = (body as any)._dangerouslyOverwriteAll === true;
    const store = (body as any).store as Store | undefined;

    // IMPORTANT: This blocks your OLD app versions from wiping data,
    // because they used to POST the store directly (without this flag).
    if (!allow || !store || typeof store !== "object") {
      return NextResponse.json(
        {
          error:
            "Bulk overwrite is disabled. Use PATCH for single-slot updates.",
        },
        { status: 400 }
      );
    }

    // Build flat list of rows to insert
    const rows: { day: string; time: string; name: string }[] = [];

    for (const day of Object.keys(store)) {
      if (!DAY_RE.test(day)) continue;
      const slots = store[day];
      if (!slots || typeof slots !== "object") continue;

      for (const time of Object.keys(slots)) {
        if (!TIME_RE.test(time)) continue;
        const name = (slots[time] || "").trim();
        if (name === "") continue; // skip empty
        rows.push({ day, time, name });
      }
    }

    // 1) Delete ALL rows in appointments
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
      const { error: insError } = await supabase.from("appointments").insert(rows);

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
