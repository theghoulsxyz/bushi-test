"use client";
import React, { useEffect, useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Branding & Fonts
// ---------------------------------------------------------------------------
const BRAND = {
  nickname: "Bushi",
  shopName: "BushiBarberShop",
  logoLight: "/bushii-logo.png", // Ensure this exists in /public
  accent: "#ffffff",
  fontTitle: "'Bebas Neue', sans-serif", // Month/year
  fontBody: "'Bebas Neue', sans-serif", // Day names
};

function injectBrandFonts() {
  if (typeof document === "undefined") return;
  if (document.getElementById("bushi-fonts")) return;
  const link = document.createElement("link");
  link.id = "bushi-fonts";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap";
  document.head.appendChild(link);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const toISODate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Monday-first month matrix (6 rows x 7 columns)
function getMonthMatrix(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7; // Mon=0 .. Sun=6
  const matrix: Date[][] = [];
  let current = 1 - startDay;
  for (let week = 0; week < 6; week++) {
    const row: Date[] = [];
    for (let d = 0; d < 7; d++) {
      row.push(new Date(year, month, current));
      current++;
    }
    matrix.push(row);
  }
  return matrix;
}

// ---------------------------------------------------------------------------
// Slots (08:00 → 21:30 every 30 minutes)
// ---------------------------------------------------------------------------
const startHour = 8;
const endHour = 22; // exclusive (last start 21:30)
const slotMinutes = 30;
function generateSlots() {
  const slots: string[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += slotMinutes) slots.push(`${pad(h)}:${pad(m)}`);
  }
  return slots;
}
const DAY_SLOTS = generateSlots();

// ---------------------------------------------------------------------------
// Persistence (localStorage)
// ---------------------------------------------------------------------------
const LS_KEY = "barber_appointments_v1";
const canUseStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const readStore = () => {
  if (!canUseStorage()) return {} as Record<string, Record<string, string>>;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
};
const writeStore = (data: Record<string, Record<string, string>>) => {
  if (canUseStorage()) localStorage.setItem(LS_KEY, JSON.stringify(data));
};

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
const ICONS = {
  delete: "/razor.png",
  close: "/close.svg",
};

function IconImg({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <img src={src} alt={alt} className={`h-5 w-5 object-contain ${className}`} />
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function BarbershopAdminPanel() {
  useEffect(() => {
    injectBrandFonts();
  }, []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [data, setData] = useState<Record<string, Record<string, string>>>(
    () => readStore()
  );
  useEffect(() => writeStore(data), [data]);

  const [showYear, setShowYear] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const matrix = useMemo(
    () => getMonthMatrix(currentYear, currentMonth),
    [currentYear, currentMonth]
  );

  const monthName = new Date(currentYear, currentMonth, 1).toLocaleString(
    undefined,
    { month: "long" }
  );
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const saveSlot = (iso: string, time: string, name: string) => {
    setData((prev) => {
      const next = { ...prev };
      if (!next[iso]) next[iso] = {};
      if (name.trim()) next[iso][time] = name.trim();
      else delete next[iso][time];
      return next;
    });
  };

  return (
    <div className="fixed inset-0 w-full h-dvh bg-black text-white overflow-hidden">
      <div className="max-w-6xl mx-auto p-3 md:p-8 h-full flex flex-col select-none">
        <div className="flex items-center justify-between w-full mb-10 md:mb-14 px-2 md:px-6">
          {BRAND.logoLight && (
            <img
              src={BRAND.logoLight}
              alt="logo"
              className="h-72 md:h-[22rem] w-auto cursor-pointer"
              onClick={() => {
                setCurrentYear(today.getFullYear());
                setCurrentMonth(today.getMonth());
              }}
            />
          )}
          <h1
            className="text-4xl md:text-7xl font-bold cursor-pointer hover:text-gray-300 select-none"
            style={{ fontFamily: BRAND.fontTitle }}
            onClick={() => setShowYear(true)}
            title="Open year view"
          >
            {monthName} {currentYear}
          </h1>
        </div>

        <div className="w-full px-2 md:px-0">
          <div className="mx-auto max-w-[680px] md:max-w-none">
            <div className="grid grid-cols-7 gap-2 md:gap-4 mb-3">
              {dayNames.map((day) => (
                <div
                  key={day}
                  className="text-center text-[clamp(1.2rem,6.5vw,2rem)] md:text-[2.2rem] font-bold text-gray-300"
                  style={{ fontFamily: BRAND.fontBody }}
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2 md:gap-4">
              {matrix.flat().map((date, idx) => {
                const inMonth = date.getMonth() === currentMonth;
                const iso = toISODate(date);
                const isToday = iso === toISODate(new Date());
                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedDate(date)}
                    className={`rounded-2xl flex items-center justify-center bg-neutral-900 text-white border transition cursor-pointer aspect-[0.78] md:aspect-square p-3 md:p-6 focus:outline-none focus:ring-2 focus:ring-white/60 ${
                      inMonth ? "" : "opacity-40"
                    } ${isToday ? "border-white" : "border-neutral-800"}`}
                  >
                    <span
                      className="select-none text-[clamp(1.1rem,6.2vw,1.8rem)] md:text-[2rem]"
                      style={{ fontFamily: BRAND.fontTitle }}
                    >
                      {date.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <YearModal
        open={showYear}
        year={currentYear}
        onClose={() => setShowYear(false)}
        onSelect={(m) => {
          setCurrentMonth(m);
          setShowYear(false);
        }}
      />

      <DayEditorModal
        open={!!selectedDate}
        date={selectedDate ?? new Date()}
        values={data[selectedDate ? toISODate(selectedDate) : ""] || {}}
        onSave={(time, name) => {
          if (!selectedDate) return;
          saveSlot(toISODate(selectedDate), time, name);
        }}
        onClose={() => setSelectedDate(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Year modal
// ---------------------------------------------------------------------------
function YearModal({ open, year, onClose, onSelect }: { open: boolean; year: number; onClose: () => void; onSelect: (monthIndex: number) => void; }) {
  if (!open) return null;
  const months = Array.from({ length: 12 }, (_, i) =>
    new Date(year, i, 1).toLocaleString(undefined, { month: "long" })
  );
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-40" onClick={onClose}>
      <div className="w-[92vw] max-w-3xl bg-neutral-950 border border-neutral-800 rounded-2xl p-4 md:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-2xl md:text-4xl font-bold" style={{ fontFamily: BRAND.fontTitle }}>{year}</div>
          <button aria-label="Close" onClick={onClose} className="text-white hover:text-gray-300" title="Close">
            <IconImg src={ICONS.close} alt="Close" />
          </button>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
          {months.map((m, i) => (
            <button key={m} onClick={() => onSelect(i)} className="rounded-xl bg-neutral-900 border border-neutral-800 hover:border-white/60 px-4 py-4 text-lg md:text-xl" style={{ fontFamily: BRAND.fontTitle }}>
              {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day editor modal
// ---------------------------------------------------------------------------
function DayEditorModal({ open, date, values, onSave, onClose }: { open: boolean; date: Date; values: Record<string, string>; onSave: (time: string, name: string) => void; onClose: () => void; }) {
  const [recentSaved, setRecentSaved] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;
  const title = date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex flex-col" onClick={onClose}>
      <div className="max-w-5xl w-full mx-auto mt-6 md:mt-10 mb-4 px-3 md:px-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-xl md:text-2xl font-bold" style={{ fontFamily: BRAND.fontBody }}>{title}</div>
          <button onClick={onClose} className="text-white hover:text-gray-300" title="Close">
            <IconImg src={ICONS.close} alt="Close" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 max-h-[74vh] overflow-y-auto pr-1">
          {DAY_SLOTS.map((t) => (
            <SlotRow
              key={t}
              time={t}
              name={values[t] || ""}
              onSave={(time, name) => {
                onSave(time, name);
                setRecentSaved(time);
                setTimeout(() => setRecentSaved((s) => (s === time ? null : s)), 1500);
              }}
              showSaved={recentSaved === t}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SlotRow({ time, name, onSave, showSaved }: { time: string; name: string; onSave: (time: string, name: string) => void; showSaved: boolean; }) {
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  const hasName = Boolean((value || "").trim());

  const handleSave = () => onSave(time, value.trim());
  const handleClear = () => onSave(time, "");

  const [confirm, setConfirm] = useState(false);

  return (
    <div className={`rounded-2xl border ${hasName ? "border-neutral-600" : "border-neutral-800"} bg-neutral-950 p-3 md:p-4 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <div className="text-base md:text-lg font-bold tabular-nums" style={{ fontFamily: BRAND.fontBody }}>{time}</div>
      </div>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        onBlur={handleSave}
        className="w-full rounded-xl bg-black/60 border border-neutral-700 focus:border-white/70 outline-none px-3 py-2 text-white"
      />
      <div className="flex items-center justify-between">
        <div className={`text-sm ${showSaved ? "text-emerald-400" : "text-transparent"}`}>Saved</div>
        {hasName && (
          !confirm ? (
            <button onClick={() => setConfirm(true)} className="min-w-[120px] px-3 py-2 rounded-xl shadow-md border border-neutral-700 hover:border-white/60 bg-neutral-900 hover:bg-neutral-800 transition text-sm">
              <span className="inline-flex items-center gap-2"><IconImg src={ICONS.delete} alt="Remove" /> Remove</span>
            </button>
          ) : (
            <div className="min-w-[120px] flex items-center gap-2 justify-end">
              <button onClick={() => setConfirm(false)} className="px-3 py-2 rounded-xl border border-yellow-600/60 hover:border-yellow-400/70 bg-neutral-900 text-sm">Cancel</button>
              <button onClick={handleClear} className="px-3 py-2 rounded-xl border border-red-700/70 hover:border-red-500/80 bg-red-900/30 text-sm">
                <span className="inline-flex items-center gap-2"><IconImg src={ICONS.delete} alt="Confirm" /> Confirm</span>
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
