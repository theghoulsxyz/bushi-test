import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

const jsonNoStore = (data: any, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });

// -----------------------------------------------------------------------------
// GET  /api/appointments
// NOTE: Supabase select() defaults to 1000 rows. If you have >1000 appointments,
// you MUST paginate/range, otherwise some days/times will randomly "disappear".
// -----------------------------------------------------------------------------
// Returns full calendar as: { "2026-03-06": { "08:00": "Name", ... }, ... }
export async function GET() {
  try {
    const store: Store = {};

    const PAGE = 1000;
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from("appointments")
        .select("day,time,name")
        // stable ordering so paging is deterministic
        .order("day", { ascending: true })
        .order("time", { ascending: true })
        .range(from, from + PAGE - 1);

      if (error) {
        console.error("GET /api/appointments error:", error);
        return jsonNoStore({}, 200);
      }

      const rows = (data || []) as any[];
      for (const row of rows) {
        const day = (row.day ?? "") as string;
        const time = (row.time ?? "") as string;
        const name = (row.name ?? "") as string;

        if (!day || !time) continue;
        if (!store[day]) store[day] = {};
        store[day][time] = name || "";
      }

      if (rows.length < PAGE) break;
      from += PAGE;
      // safety stop (prevents infinite loop if something weird happens)
      if (from > 50000) break;
    }

    return jsonNoStore(store, 200);
  } catch (e) {
    console.error("GET /api/appointments exception:", e);
    return jsonNoStore({}, 200);
  }
}

// -----------------------------------------------------------------------------
// PATCH /api/appointments  (SAFE: single-slot operations, no wipe possible)
// Body examples:
//  { op: "set", day: "2026-03-06", time: "10:30", name: "Ivan" }
//  { op: "clear", day: "2026-03-06", time: "10:30" }
// -----------------------------------------------------------------------------
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return jsonNoStore({ error: "Invalid payload" }, 400);
    }

    const op = (body as any).op as string;
    const day = (body as any).day as string;
    const time = (body as any).time as string;
    const nameRaw = (body as any).name as string | undefined;

    if (!op || !day || !time) {
      return jsonNoStore({ error: "Missing op/day/time" }, 400);
    }

    if (!DAY_RE.test(day) || !TIME_RE.test(time)) {
      return jsonNoStore({ error: "Invalid day/time format" }, 400);
    }

    if (op === "clear") {
      const { error: delErr } = await supabase
        .from("appointments")
        .delete()
        .eq("day", day)
        .eq("time", time);

      if (delErr) {
        console.error("PATCH clear error:", delErr);
        return jsonNoStore({ error: "Failed to clear slot" }, 500);
      }

      return jsonNoStore({ ok: true }, 200);
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
          return jsonNoStore({ error: "Failed to clear slot" }, 500);
        }

        return jsonNoStore({ ok: true }, 200);
      }

      // Requires unique constraint/index on (day,time)
      const { error: upsertErr } = await supabase
        .from("appointments")
        .upsert([{ day, time, name }], { onConflict: "day,time" });

      if (upsertErr) {
        console.warn("PATCH set upsert failed, falling back to delete+insert:", upsertErr);

        const { error: delErr } = await supabase
          .from("appointments")
          .delete()
          .eq("day", day)
          .eq("time", time);

        if (delErr) {
          console.error("PATCH set fallback delete error:", delErr);
          return jsonNoStore({ error: "Failed to set slot (fallback delete)" }, 500);
        }

        const { error: insErr } = await supabase
          .from("appointments")
          .insert([{ day, time, name }]);

        if (insErr) {
          console.error("PATCH set fallback insert error:", insErr);
          return jsonNoStore({ error: "Failed to set slot (fallback insert)" }, 500);
        }
      }

      return jsonNoStore({ ok: true }, 200);
    }

    return jsonNoStore({ error: "Unknown op" }, 400);
  } catch (e) {
    console.error("PATCH /api/appointments exception:", e);
    return jsonNoStore({ error: "Exception while patching" }, 500);
  }
}

// -----------------------------------------------------------------------------
// POST /api/appointments  (DANGEROUS BULK OVERWRITE)
// Protected: old clients can't wipe the table.
// Required body:
//   { _dangerouslyOverwriteAll: true, store: { ...fullStore } }
// -----------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return jsonNoStore({ error: "Invalid payload" }, 400);
    }

    const allow = (body as any)._dangerouslyOverwriteAll === true;
    const store = (body as any).store as Store | undefined;

    if (!allow || !store || typeof store !== "object") {
      return jsonNoStore(
        {
          error: "Bulk overwrite is disabled. Use PATCH for single-slot updates.",
        },
        400
      );
    }

    const rows: { day: string; time: string; name: string }[] = [];

    for (const day of Object.keys(store)) {
      if (!DAY_RE.test(day)) continue;
      const slots = store[day];
      if (!slots || typeof slots !== "object") continue;

      for (const time of Object.keys(slots)) {
        if (!TIME_RE.test(time)) continue;
        const name = (slots[time] || "").trim();
        if (name === "") continue;
        rows.push({ day, time, name });
      }
    }

    // Delete ALL rows
    const { error: delAllErr } = await supabase
      .from("appointments")
      .delete()
      .not("day", "is", null);

    if (delAllErr) {
      console.error("POST overwrite delete-all error:", delAllErr);
      return jsonNoStore({ error: "Failed to clear existing data" }, 500);
    }

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("appointments").insert(rows);
      if (insErr) {
        console.error("POST overwrite insert error:", insErr);
        return jsonNoStore({ error: "Failed to insert new data" }, 500);
      }
    }

    return jsonNoStore({ ok: true }, 200);
  } catch (e) {
    console.error("POST /api/appointments exception:", e);
    return jsonNoStore({ error: "Exception while overwriting" }, 500);
  }
}
