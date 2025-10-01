"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Branding & Fonts
// ---------------------------------------------------------------------------
const BRAND = {
  nickname: "Bushi",
  shopName: "BushiBarberShop",
  logoLight: "/bushii-logo.png", // ensure this exists in /public
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
const toISODate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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
// Icons & utility components
// ---------------------------------------------------------------------------
const ICONS = {
  delete: "/razor.png", // razor icon for remove/confirm
  close: "/close.svg", // small X icon for close
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
// Generic Modal shell
// ---------------------------------------------------------------------------
function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-neutral-950 text-white rounded-none md:rounded-xl shadow-2xl w-screen h-dvh md:w-[min(760px,96vw)] md:h-[90vh] flex flex-col overflow-hidden border border-neutral-800">
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between flex-none">
          <h3
            className="text-base md:text-lg font-bold tracking-wide"
            style={{ fontFamily: BRAND.fontTitle }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-full hover:bg-neutral-800 transition"
          >
            <IconImg src={ICONS.close} alt="Close" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 md:p-5">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Year picker (tap month to open)
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
          <h3 className="text-xl font-bold" style={{ fontFamily: BRAND.fontTitle }}>
            {currentYear}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-full hover:bg-neutral-800 transition"
          >
            <IconImg src={ICONS.close} alt="Close" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {months.map((m, idx) => (
            <button
              key={idx}
              onClick={() => {
                setMonth(idx);
                onClose();
              }}
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
// Day editor (list of 30‑min slots)
// ---------------------------------------------------------------------------
function DayEditorModal({
  open,
  onClose,
  dateISO,
  data,
  setData,
}: {
  open: boolean;
  onClose: () => void;
  dateISO: string | null;
  data: Record<string, Record<string, string>>;
  setData: React.Dispatch<
    React.SetStateAction<Record<string, Record<string, string>>>
  >;
}) {
  const dayData = (dateISO && data[dateISO]) || {};

  const setNameFor = (time: string, name: string) => {
    if (!dateISO) return;
    setData((prev) => {
      const copy = { ...prev } as Record<string, Record<string, string>>;
      const day = { ...(copy[dateISO] || {}) } as Record<string, string>;
      if (!name) delete day[time];
      else day[time] = name;
      copy[dateISO] = day;
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(copy));
      } catch {}
      return copy;
    });
  };

  const title = dateISO
    ? new Date(dateISO).toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Appointments";

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DAY_SLOTS.map((time) => (
          <SlotRow
            key={time}
            time={time}
            name={dayData[time] || ""}
            onSave={setNameFor}
          />
        ))}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// One slot row (Saved on LEFT, Remove on RIGHT)
// ---------------------------------------------------------------------------
function SlotRow({
  time,
  name,
  onSave,
}: {
  time: string;
  name: string;
  onSave: (time: string, name: string) => void;
}) {
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  const hasName = Boolean((name || "").trim());

  const lastSavedRef = useRef<string>(name);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const confirmTimerRef = useRef<number | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const triggerSavedFlash = () => {
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 900);
  };

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
    confirmTimerRef.current = window.setTimeout(
      () => setConfirmRemove(false),
      3500
    );
  };
  const cancelRemove = () => {
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    setConfirmRemove(false);
  };
  const handleClear = () => {
    onSave(time, "");
    lastSavedRef.current = "";
    setConfirmRemove(false);
  };

  useEffect(
    () => () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    },
    []
  );

  return (
    <div
      className={`border rounded-2xl p-4 flex flex-col gap-2 bg-neutral-900 ${
        hasName ? "border-white" : "border-neutral-700"
      } relative`}
    >
      <div className="flex items-center justify-between">
        <div className="text-base font-bold tabular-nums">{time}</div>
      </div>
      <input
        className="w-full px-3 py-2 rounded-xl border border-gray-600 bg-neutral-950 text-white focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm"
        value={value}
        onChange={(e) => setValue((e.target as HTMLInputElement).value)}
        onBlur={flushSave}
        onKeyDown={(e) => {
          if (e.key === "Enter") flushSave();
        }}
        autoComplete="off"
        inputMode="text"
      />

      {/* Inline actions row: Saved LEFT, Remove/Confirm RIGHT (stable width/height) */}
      <div className="flex items-center justify-between gap-3 mt-2">
        {/* Saved on the left (opacity only) */}
        <div
          className={`text-xs text-green-400 transition-opacity duration-300`}
          style={{ minHeight: "1rem" }}
          aria-live="polite"
        >
          <span className={justSaved ? "opacity-100" : "opacity-0"}>✓ Saved</span>
        </div>

        {/* Remove / Confirm on the right */}
        {hasName ? (
          !confirmRemove ? (
            <button
              onClick={armRemove}
              className="px-3 h-9 min-w-[7.5rem] rounded-xl shadow-md border border-gray-700 hover:border-white/60 bg-neutral-900 hover:bg-neutral-800 transition text-sm whitespace-nowrap"
            >
              <span className="inline-flex items-center gap-2">
                <IconImg src={ICONS.delete} alt="Remove" /> Remove
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={cancelRemove}
                className="px-3 h-9 rounded-xl border border-yellow-600/60 hover:border-yellow-400/70 bg-neutral-900 text-sm whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={handleClear}
                className="px-3 h-9 rounded-xl border border-red-700/70 hover:border-red-500/80 bg-red-900/30 text-sm whitespace-nowrap"
              >
                <span className="inline-flex items-center gap-2">
                  <IconImg src={ICONS.delete} alt="Confirm" /> Confirm
                </span>
              </button>
            </div>
          )
        ) : (
          // Invisible placeholder keeps layout consistent when no name yet
          <button
            aria-hidden
            tabIndex={-1}
            className="px-3 h-9 min-w-[7.5rem] rounded-xl border border-transparent text-sm opacity-0 pointer-events-none"
          >
            Placeholder
          </button>
        )}
      </div>
    </div>
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
    // prevent page scroll on month view
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

  const matrix = useMemo(
    () => getMonthMatrix(currentYear, currentMonth),
    [currentYear, currentMonth]
  );

  const [showYear, setShowYear] = useState(false);
  const [dayModal, setDayModal] = useState<{
    open: boolean;
    dateISO: string | null;
  }>({ open: false, dateISO: null });
  const openDay = (d: Date) => setDayModal({ open: true, dateISO: toISODate(d) });
  const closeDay = () => setDayModal({ open: false, dateISO: null });

  const monthName = new Date(currentYear, currentMonth, 1).toLocaleString(
    undefined,
    { month: "long" }
  );

  return (
    <div className="fixed inset-0 w-full h-dvh bg-black text-white overflow-hidden">
      <div className="max-w-6xl mx-auto p-3 md:p-8 h-full flex flex-col select-none">
        {/* Header: logo left, month/year right */}
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
          >
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
                className={`rounded-2xl flex items-center justify-center bg-neutral-900 text-white border transition cursor-pointer aspect-[0.78] md:aspect-square p-3 md:p-6 ${
                  inMonth ? "" : "opacity-40"
                } ${isToday ? "border-white" : "border-neutral-800"}`}
                onClick={() => openDay(date)}
              >
                <div
                  className="select-none text-[clamp(1.1rem,6.2vw,1.8rem)] md:text-[2rem]"
                  style={{ fontFamily: BRAND.fontScript }}
                >
                  {date.getDate()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Overlays */}
      <YearModal
        open={showYear}
        onClose={() => setShowYear(false)}
        currentYear={currentYear}
        setMonth={(m) => setCurrentMonth(m)}
      />
      <DayEditorModal
        open={dayModal.open}
        onClose={closeDay}
        dateISO={dayModal.dateISO}
        data={data}
        setData={setData}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lightweight dev checks (act as test cases)
// ---------------------------------------------------------------------------
function runDevChecks() {
  const errs: string[] = [];
  const assert = (ok: boolean, msg: string) => !ok && errs.push(msg);

  // Month matrix shape
  const m = getMonthMatrix(2025, 0);
  assert(Array.isArray(m) && m.length === 6, "Month matrix must have 6 rows");
  assert(m.every((r) => r.length === 7), "Each row must have 7 columns");
  assert(m.flat().length === 42, "Matrix should contain 42 dates");

  // toISODate format
  const d = new Date(2025, 8, 7);
  assert(toISODate(d) === "2025-09-07", "toISODate formatting failed");

  // Slots boundaries
  const expected = (endHour - startHour) * (60 / slotMinutes);
  assert(
    DAY_SLOTS.length === expected,
    `Expected ${expected} slots, got ${DAY_SLOTS.length}`
  );
  assert(DAY_SLOTS[0] === "08:00", `First slot should be 08:00, got ${DAY_SLOTS[0]}`);
  assert(
    DAY_SLOTS[DAY_SLOTS.length - 1] === "21:30",
    `Last slot should be 21:30, got ${DAY_SLOTS[DAY_SLOTS.length - 1]}`
  );

  if (errs.length) console.warn("[Bushi Admin] self-checks failed:", errs);
}
if (typeof window !== "undefined") {
  try {
    runDevChecks();
  } catch {}
}
