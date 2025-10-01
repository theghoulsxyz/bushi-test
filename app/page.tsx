"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------
const BRAND = {
  nickname: "Bushi",
  shopName: "BushiBarberShop",
  logoLight: "/bushii-logo.png",
  accent: "#ffffff",
  fontTitle: "'Bebas Neue', sans-serif",
  fontScript: "'UnifrakturCook', cursive",
};

function injectBrandFonts() {
  if (typeof document === "undefined") return;
  if (document.getElementById("bushi-fonts")) return;
  const link = document.createElement("link");
  link.id = "bushi-fonts";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=UnifrakturCook:wght@700&display=swap";
  document.head.appendChild(link);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function getMonthMatrix(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7; // Monday-first
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
// Slots (08:00 → 21:30, every 30 minutes)
// ---------------------------------------------------------------------------
const startHour = 8;
const endHour = 22; // exclusive (last slot starts at 21:30)
const slotMinutes = 30;
function generateSlots() {
  const slots: string[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += slotMinutes) {
      slots.push(`${pad(h)}:${pad(m)}`);
    }
  }
  return slots;
}
const DAY_SLOTS = generateSlots();

// ---------------------------------------------------------------------------
// Local storage (persist appointments)
// ---------------------------------------------------------------------------
const LS_KEY = "barber_appointments_v1";
const canUseStorage = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
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
// Icons (ensure files exist in /public)
// ---------------------------------------------------------------------------
const ICONS = {
  delete: "/razor.png", // razor icon for remove/confirm
  close: "/close.svg", // small X for modal close
};

function IconImg({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return <img src={src} alt={alt} className={`h-5 w-5 object-contain ${className}`} />;
}

// ---------------------------------------------------------------------------
// Year picker (tap month title)
// ---------------------------------------------------------------------------
function YearModal({
  open,
  onClose,
  currentYear,
  setMonth,
}: {
  open: boolean;
  onClose: () => void;
  currentYear: number;
  setMonth: (m: number) => void;
}) {
  if (!open) return null;
  const months = Array.from({ length: 12 }, (_, i) =>
    new Date(currentYear, i, 1).toLocaleString(undefined, { month: "long" })
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-neutral-950 text-white rounded-xl shadow-2xl w-[min(680px,94vw)] p-5 border border-neutral-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold" style={{ fontFamily: BRAND.fontTitle }}>{currentYear}</h3>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-neutral-800 transition">
            <IconImg src={ICONS.close} alt="Close" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {months.map((m, idx) => (
            <button
              key={idx}
              onClick={() => { setMonth(idx); onClose(); }}
              className="p-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-center border border-neutral-700"
              style={{ fontFamily: BRAND.fontTitle }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic modal (for Day Editor)
// ---------------------------------------------------------------------------
function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-neutral-950 text-white rounded-none md:rounded-xl shadow-2xl w-screen h-dvh md:w-[min(760px,96vw)] md:h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between flex-none">
          <h3 className="text-base md:text-lg font-bold tracking-wide" style={{ fontFamily: BRAND.fontTitle }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-neutral-800 transition">
            <IconImg src={ICONS.close} alt="Close" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 md:p-5">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day editor (list of 30-min slots)
// ---------------------------------------------------------------------------
function DayEditorModal({ open, onClose, dateISO, data, setData }: { open: boolean; onClose: () => void; dateISO: string | null; data: Record<string, Record<string, string>>; setData: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>; }) {
  const dayData = (dateISO && data[dateISO]) || {};

  const setNameFor = (time: string, name: string) => {
    if (!dateISO) return;
    setData((prev) => {
      const copy = { ...prev } as Record<string, Record<string, string>>;
      const day = { ...(copy[dateISO] || {}) } as Record<string, string>;
      if (!name) delete day[time]; else day[time] = name;
      copy[dateISO] = day;
      try { localStorage.setItem(LS_KEY, JSON.stringify(copy)); } catch {}
      return copy;
    });
  };

  const title = dateISO
    ? new Date(dateISO).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "Appointments";

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DAY_SLOTS.map((time) => (
          <SlotRow key={time} time={time} name={dayData[time] || ""} onSave={setNameFor} />
        ))}
      </div>
    </Modal>
  );
}

function SlotRow({ time, name, onSave }: { time: string; name: string; onSave: (time: string, name: string) => void }) {
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  const hasName = Boolean((name || "").trim());

  const lastSavedRef = useRef<string>(name);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const confirmTimerRef = useRef<number | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const triggerSavedFlash = () => { setJustSaved(true); window.setTimeout(() => setJustSaved(false), 900); };

  const flushSave = () => {
    const next = value.trim();
    if (next === lastSavedRef.current) return;
    onSave(time, next);
    lastSavedRef.current = next;
    triggerSavedFlash();
  };

  const armRemove = () => {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmRemove(true);
    confirmTimerRef.current = window.setTimeout(() => setConfirmRemove(false), 3500);
  };
  const cancelRemove = () => {
    if (confirmTimerRef.current) { clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null; }
    setConfirmRemove(false);
  };
  const handleClear = () => { onSave(time, ""); lastSavedRef.current = ""; setConfirmRemove(false); };

  useEffect(() => () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current); }, []);

  return (
    <div className={`border rounded-2xl p-4 flex flex-col gap-2 bg-neutral-900 ${hasName ? "border-white" : "border-neutral-700"} relative`}>
      <div className="flex items-center justify-between">
        <div className="text-base font-bold tabular-nums">{time}</div>
      </div>
      <input
        className="w-full px-3 py-2 rounded-xl border border-gray-600 bg-neutral-950 text-white focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm"
        value={value}
        onChange={(e) => setValue((e.target as HTMLInputElement).value)}
        onBlur={flushSave}
        onKeyDown={(e) => { if (e.key === "Enter") flushSave(); }}
        autoComplete="off"
        inputMode="text"
      />

      {/* Floating "Saved" badge */}
      <div className={`pointer-events-none absolute top-2 right-3 px-2 py-1 rounded-full text-[10px] bg-green-600/20 border border-green-400/60 text-green-300 transition-all duration-300 ${justSaved ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`} aria-hidden>
        <span className="inline-flex items-center gap-1">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Saved
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        {hasName && (
          !confirmRemove ? (
            <button onClick={armRemove} className="px-3 py-2 rounded-xl shadow-md border border-gray-700 hover:border-white/60 bg-neutral-900 hover:bg-neutral-800 transition text-sm">
              <span className="inline-flex items-center gap-2"><IconImg src={ICONS.delete} alt="Remove" /> Remove</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={cancelRemove} className="px-3 py-2 rounded-xl border border-yellow-600/60 hover:border-yellow-400/70 bg-neutral-900">Cancel</button>
              <button onClick={handleClear} className="px-3 py-2 rounded-xl border border-red-700/70 hover:border-red-500/80 bg-red-900/30">
                <span className="inline-flex items-center gap-2"><IconImg src={ICONS.delete} alt="Confirm" /> Confirm</span>
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function BarbershopAdminPanel() {
  useEffect(() => { injectBrandFonts(); }, []);
  useEffect(() => {
    // prevent page scroll while on calendar view
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [data, setData] = useState<Record<string, Record<string, string>>>(() => readStore());
  useEffect(() => writeStore(data), [data]);

  const matrix = useMemo(() => getMonthMatrix(currentYear, currentMonth), [currentYear, currentMonth]);

  const [showYear, setShowYear] = useState(false);
  const [dayModal, setDayModal] = useState<{ open: boolean; dateISO: string | null }>({ open: false, dateISO: null });
  const openDay = (d: Date) => setDayModal({ open: true, dateISO: toISODate(d) });
  const closeDay = () => setDayModal({ open: false, dateISO: null });

  const monthName = new Date(currentYear, currentMonth, 1).toLocaleString(undefined, { month: "long" });

  return (
    <div className="fixed inset-0 w-full h-dvh bg-black text-white overflow-hidden">
      <div className="max-w-6xl mx-auto p-3 md:p-8 h-full flex flex-col select-none">
        {/* Top bar: logo left, month/year right */}
        <div className="flex items-center justify-between w-full mb-10 md:mb-14 px-2 md:px-6">
          {BRAND.logoLight && (
            <img
              src={BRAND.logoLight}
              alt="logo"
              className="h-40 md:h-56 w-auto cursor-pointer"
              onClick={() => { setCurrentYear(today.getFullYear()); setCurrentMonth(today.getMonth()); }}
            />
          )}
          <h1 className="text-xl md:text-3xl font-bold cursor-pointer hover:text-gray-300 select-none" style={{ fontFamily: BRAND.fontTitle }} onClick={() => setShowYear(true)}>
            {monthName} {currentYear}
          </h1>
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-2 md:gap-4 px-2 md:px-0 max-w-[680px] mx-auto md:max-w-none">
          {matrix.flat().map((date, idx) => {
            const inMonth = date.getMonth() === currentMonth;
            const iso = toISODate(date);
            const isToday = iso === toISODate(new Date());
            return (
              <div
                key={idx}
                className={`rounded-2xl flex items-center justify-center bg-neutral-900 text-white border transition cursor-pointer aspect-[0.78] md:aspect-square p-3 md:p-6 ${inMonth ? "" : "opacity-40"} ${isToday ? "border-white" : "border-neutral-800"}`}
                onClick={() => openDay(date)}
              >
                <div className="select-none text-[clamp(1.1rem,6.2vw,1.8rem)] md:text-[2rem]" style={{ fontFamily: BRAND.fontScript }}>
                  {date.getDate()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Overlays */}
      <YearModal open={showYear} onClose={() => setShowYear(false)} currentYear={currentYear} setMonth={(m) => setCurrentMonth(m)} />
      <DayEditorModal open={dayModal.open} onClose={closeDay} dateISO={dayModal.dateISO} data={data} setData={setData} />
    </div>
  );
}
