import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Store = Record<string, Record<string, string>>;

// IMPORTANT: these env names must match Netlify + .env.local
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables");
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
// Returns full calendar as: { "2025-12-01": { "08:00": "Name", ... }, ... }
// IMPORTANT FIX: on Supabase error, return 500 (NOT {} with 200), otherwise
// the client will overwrite its store with an empty object and look like "deleting".
// -----------------------------------------------------------------------------
export async function GET() {
  try {
    const { data, error } = await supabase.from("appointments").select("day,time,name");

    if (error) {
      console.error("GET /api/appointments error:", error);
      return jsonNoStore(
        { ok: false, error: "Failed to load appointments" },
        500
      );
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

    return jsonNoStore({ ok: true, store }, 200);
  } catch (e) {
    console.error("GET /api/appointments exception:", e);
    return jsonNoStore({ ok: false, error: "Server exception" }, 500);
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
      return jsonNoStore({ ok: false, error: "Invalid payload" }, 400);
    }

    const op = (body as any).op as string;
    const day = (body as any).day as string;
    const time = (body as any).time as string;
    const nameRaw = (body as any).name as string | undefined;

    if (!op || !day || !time) {
      return jsonNoStore({ ok: false, error: "Missing op/day/time" }, 400);
    }

    if (!DAY_RE.test(day) || !TIME_RE.test(time)) {
      return jsonNoStore({ ok: false, error: "Invalid day/time format" }, 400);
    }

    if (op === "clear") {
      const { error: delErr } = await supabase
        .from("appointments")
        .delete()
        .eq("day", day)
        .eq("time", time);

      if (delErr) {
        console.error("PATCH clear error:", delErr);
        return jsonNoStore({ ok: false, error: "Failed to clear slot" }, 500);
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
          return jsonNoStore({ ok: false, error: "Failed to clear slot" }, 500);
        }

        return jsonNoStore({ ok: true }, 200);
      }

      // Requires unique index on (day,time)
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
          return jsonNoStore({ ok: false, error: "Failed to set slot (fallback delete)" }, 500);
        }

        const { error: insErr } = await supabase
          .from("appointments")
          .insert([{ day, time, name }]);

        if (insErr) {
          console.error("PATCH set fallback insert error:", insErr);
          return jsonNoStore({ ok: false, error: "Failed to set slot (fallback insert)" }, 500);
        }
      }

      return jsonNoStore({ ok: true }, 200);
    }

    return jsonNoStore({ ok: false, error: "Unknown op" }, 400);
  } catch (e) {
    console.error("PATCH /api/appointments exception:", e);
    return jsonNoStore({ ok: false, error: "Exception while patching" }, 500);
  }
}

// -----------------------------------------------------------------------------
// POST /api/appointments  (DANGEROUS BULK OVERWRITE)
// Still protected.
// -----------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return jsonNoStore({ ok: false, error: "Invalid payload" }, 400);
    }

    const allow = (body as any)._dangerouslyOverwriteAll === true;
    const store = (body as any).store as Store | undefined;

    if (!allow || !store || typeof store !== "object") {
      return jsonNoStore(
        { ok: false, error: "Bulk overwrite is disabled. Use PATCH for single-slot updates." },
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

    const { error: delError } = await supabase
      .from("appointments")
      .delete()
      .not("day", "is", null);

    if (delError) {
      console.error("POST /api/appointments delete error:", delError);
      return jsonNoStore({ ok: false, error: "Failed to clear existing appointments" }, 500);
    }

    if (rows.length > 0) {
      const { error: insError } = await supabase.from("appointments").insert(rows);

      if (insError) {
        console.error("POST /api/appointments insert error:", insError);
        return jsonNoStore({ ok: false, error: "Failed to save appointments" }, 500);
      }
    }

    return jsonNoStore({ ok: true }, 200);
  } catch (e) {
    console.error("POST /api/appointments exception:", e);
    return jsonNoStore({ ok: false, error: "Exception while saving" }, 500);
  }
}
