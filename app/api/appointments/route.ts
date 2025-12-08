// app/api/appointments/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Your frontend expects:
 * GET  -> { "2025-12-08": { "08:00": "Ali", "08:30": "Mehmet" }, ... }
 * POST -> same shape (replace all rows with the sent store)
 *
 * DB table: appointments(id int8 pk, day text, time text, name text)
 * RLS: OFF
 */

type Store = Record<string, Record<string, string>>;

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TABLE_URL = `${SUPABASE_URL}/rest/v1/appointments`;

function sbHeaders(extra?: HeadersInit): HeadersInit {
  return {
    apikey: SERVICE_ROLE,
    Authorization: `Bearer ${SERVICE_ROLE}`,
    ...(extra || {}),
  };
}

// ---------- GET: read all rows, return as Store ----------
export async function GET() {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error("Missing Supabase env vars");
    return NextResponse.json({}, { status: 500 });
  }

  const res = await fetch(`${TABLE_URL}?select=day,time,name`, {
    headers: sbHeaders(),
    // Netlify can cache — avoid that; we want latest always
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Supabase GET error:", res.status, text);
    return NextResponse.json({}, { status: 500 });
  }

  const rows = (await res.json()) as { day: string; time: string; name: string | null }[];

  const store: Store = {};
  for (const r of rows) {
    if (!store[r.day]) store[r.day] = {};
    if (r.name && r.name.trim()) store[r.day][r.time] = r.name.trim();
  }

  return NextResponse.json(store);
}

// ---------- POST: replace DB with the sent Store ----------
export async function POST(req: NextRequest) {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error("Missing Supabase env vars");
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  let body: Store;
  try {
    body = (await req.json()) as Store;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  // Flatten {day:{time:name}} -> [{day,time,name}, ...]
  const rows: { day: string; time: string; name: string }[] = [];
  for (const [day, slots] of Object.entries(body)) {
    for (const [time, name] of Object.entries(slots)) {
      const trimmed = (name || "").trim();
      if (!trimmed) continue;
      rows.push({ day, time, name: trimmed });
    }
  }

  // 1) Delete all existing rows (small dataset, single-user = simplest + safe)
  const del = await fetch(TABLE_URL, {
    method: "DELETE",
    headers: sbHeaders({
      "Content-Type": "application/json",
      // return-minimal = faster, no response body
      Prefer: "return-minimal",
    }),
  });

  if (!del.ok) {
    const text = await del.text();
    console.error("Supabase DELETE error:", del.status, text);
    return NextResponse.json({ error: "DB delete failed" }, { status: 500 });
  }

  // 2) Insert current rows (if any)
  if (rows.length > 0) {
    const ins = await fetch(TABLE_URL, {
      method: "POST",
      headers: sbHeaders({
        "Content-Type": "application/json",
        Prefer: "return-minimal",
      }),
      body: JSON.stringify(rows),
    });

    if (!ins.ok) {
      const text = await ins.text();
      console.error("Supabase INSERT error:", ins.status, text);
      return NextResponse.json({ error: "DB insert failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
 