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
// Returns full calendar as: { "2025-12-01": { "08:00": "Name", ... }, ... }
// -----------------------------------------------------------------------------
export async function GET() {
  try {
    // NOTE:
    // - We order by id so if legacy duplicates exist, the newest row wins deterministically.
    // - We NEVER allow an empty name to overwrite a non-empty name (prevents "blank row" wiping UI).
    const { data, error } = await supabase
      .from("appointments")
      .select("id,day,time,name")
      .order("id", { ascending: true });

    if (error) {
      console.error("GET /api/appointments error:", error);
      return jsonNoStore({}, 200);
    }

    const store: Store = {};
    (data || []).forEach((row: any) => {
      const day = String(row.day ?? "").trim();
      const time = String(row.time ?? "").trim();
      const name = String(row.name ?? "");

      if (!day || !time) return;
      if (!store[day]) store[day] = {};

      const incoming = (name || "").trim();
      const existing = (store[day][time] || "").trim();

      // If we already have a name, don't let a blank overwrite it.
      if (existing.length > 0 && incoming.length === 0) return;

      store[day][time] = incoming;
    });

    return jsonNoStore(store, 200);
  } catch (e) {
    console.error("GET /api/appointments exception:", e);
    return jsonNoStore({}, 200);
  }
}
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

      // Requires unique index on (day,time) (you already created it)
      const { error: upsertErr } = await supabase
        .from("appointments")
        .upsert([{ day, time, name }], { onConflict: "day,time" });

      if (upsertErr) {
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
          return jsonNoStore(
            { error: "Failed to set slot (fallback delete)" },
            500
          );
        }

        const { error: insErr } = await supabase
          .from("appointments")
          .insert([{ day, time, name }]);

        if (insErr) {
          console.error("PATCH set fallback insert error:", insErr);
          return jsonNoStore(
            { error: "Failed to set slot (fallback insert)" },
            500
          );
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
// NOW PROTECTED so OLD CLIENTS CAN'T WIPE THE TABLE.
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

    // IMPORTANT: This blocks your OLD app versions from wiping data,
    // because they used to POST the store directly (without this flag).
    if (!allow || !store || typeof store !== "object") {
      return jsonNoStore(
        {
          error:
            "Bulk overwrite is disabled. Use PATCH for single-slot updates.",
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

    // Delete ALL rows. Use day IS NOT NULL (safer than relying on an "id" column).
    const { error: delError } = await supabase
      .from("appointments")
      .delete()
      .not("day", "is", null);

    if (delError) {
      console.error("POST /api/appointments delete error:", delError);
      return jsonNoStore(
        { error: "Failed to clear existing appointments" },
        500
      );
    }

    if (rows.length > 0) {
      const { error: insError } = await supabase
        .from("appointments")
        .insert(rows);

      if (insError) {
        console.error("POST /api/appointments insert error:", insError);
        return jsonNoStore({ error: "Failed to save appointments" }, 500);
      }
    }

    return jsonNoStore({ ok: true }, 200);
  } catch (e) {
    console.error("POST /api/appointments exception:", e);
    return jsonNoStore({ error: "Exception while saving" }, 500);
  }
}
