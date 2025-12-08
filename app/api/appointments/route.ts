// app/api/appointments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Store = Record<string, Record<string, string>>;

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

// ---------- GET: read all rows and return Store ----------
export async function GET() {
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing Supabase env vars");
    return NextResponse.json({}, { status: 500 });
  }

  const { data, error } = await supabase
    .from("appointments")
    .select("day, time, name");

  if (error) {
    console.error("Supabase GET error:", error);
    return NextResponse.json({}, { status: 500 });
  }

  const store: Store = {};
  for (const row of (data || []) as { day: string; time: string; name: string | null }[]) {
    if (!row.day || !row.time) continue;
    if (!store[row.day]) store[row.day] = {};
    if (row.name && row.name.trim()) {
      store[row.day][row.time] = row.name.trim();
    }
  }

  return NextResponse.json(store);
}

// ---------- POST: replace DB content with sent Store ----------
export async function POST(req: NextRequest) {
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing Supabase env vars");
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  let body: Store;
  try {
    body = (await req.json()) as Store;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  // Flatten { day: { time: name } } -> [{ day, time, name }, ...]
  const rows: { day: string; time: string; name: string }[] = [];
  for (const [day, slots] of Object.entries(body)) {
    for (const [time, name] of Object.entries(slots)) {
      const trimmed = (name || "").trim();
      if (!trimmed) continue;
      rows.push({ day, time, name: trimmed });
    }
  }

  // Delete all existing rows (small dataset, single user = OK)
  const { error: delError } = await supabase
    .from("appointments")
    .delete()
    .neq("id", -1); // delete everything

  if (delError) {
    console.error("Supabase DELETE error:", delError);
    return NextResponse.json({ error: "DB delete failed" }, { status: 500 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error: insError } = await supabase
    .from("appointments")
    .insert(rows);

  if (insError) {
    console.error("Supabase INSERT error:", insError);
    return NextResponse.json({ error: "DB insert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
