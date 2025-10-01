"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Branding & Fonts
// ---------------------------------------------------------------------------
const BRAND = {
  nickname: "Bushi",
  shopName: "BushiBarberShop",
  logoLight: "/bushii-logo.png", // Ensure this exists in /public
  accent: "#ffffff",
  fontTitle: "'Bebas Neue', sans-serif", // Month/year + weekday names
  fontBody: "'UnifrakturCook', cursive", // Gothic for day numbers
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

// Monday‑first month matrix (6 rows × 7 columns)
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

function IconImg({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return <img src={src} alt={alt} className={`object-contain ${className}`} />;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function BarbershopAdminPanel() {
  useEffect(() => {
    injectBrandFonts();
  }, []);

  // Disable page scroll on calendar view
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
  const [data, setData] = useState<Record<string, Record<string, string>>>(() => readStore());
  useEffect(() => writeStore(data), [data]);

  const [showYear, setShowYear] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const matrix = useMemo(() => getMonthMatrix(currentYear, currentMonth), [currentYear, currentMonth]);

  const monthName = new Date(currentYear, currentMonth, 1).toLocaleString(undefined, { month: "long" });
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
        {/* Header: Logo (left) and Month Year (right) */}
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

        {/* Weekday names */}
        <div className="w-full px-2 md:px-0">
          <div className="mx-auto max-w-[680px] md:max-w-none">
            <div className="grid grid-cols-7 gap-2 md:gap-4 mb-3">
              {dayNames.map((day) => (
                <div
                  key={day}
                  className="text-center text-[clamp(1.6rem,6.5vw,2.6rem)] md:text-[2.6rem] font-bold text-gray-300"
                  style={{ fontFamily: BRAND.fontTitle }}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Month grid */}
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
                      style={{ fontFamily: BRAND.fontBody }}
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

      {/* Year select modal */}
      <YearModal
        open={showYear}
        year={currentYear}
        onClose={() => setShowYear(false)}
        onSelect={(m) => {
          setCurrentMonth(m);
          setShowYear(false);
        }}
      />

      {/* Day editor modal */}
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
// Year Modal (month picker)
// ---------------------------------------------------------------------------
function YearModal({
  open,
  year,
  onSelect,
  onClose,
}: {
  open: boolean;
  year: number;
  onSelect: (monthIndex: number) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const onBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-black/90 flex items-center justify-center p-4"
      onMouseDown={onBackdrop}
    >
      <div className="w-full max-w-4xl bg-neutral-900 rounded-2xl border border-neutral-800 shadow-xl p-4 md:p-6 relative">
        <button
          aria-label="Close"
          className="absolute right-3 top-3 md:right-5 md:top-5"
          onClick={onClose}
        >
          <IconImg src={ICONS.close} alt="close" className="h-6 w-6 md:h-8 md:w-8" />
        </button>
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <div
            className="text-3xl md:text-4xl"
            style={{ fontFamily: BRAND.fontTitle }}
          >
            {year}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {months.map((m, idx) => (
            <button
              key={m}
              onClick={() => onSelect(idx)}
              className="px-4 py-5 rounded-2xl bg-neutral-950 border border-neutral-800 hover:border-white/60 text-left transition"
            >
              <div className="text-lg md:text-xl tracking-wide" style={{ fontFamily: BRAND.fontTitle }}>
                {m.toUpperCase()}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day Editor Modal (slots list)
// ---------------------------------------------------------------------------
function DayEditorModal({
  open,
  date,
  values,
  onSave,
  onClose,
}: {
  open: boolean;
  date: Date;
  values: Record<string, string>;
  onSave: (time: string, name: string) => void;
  onClose: () => void;
}) {
  const startY = useRef<number | null>(null);
  if (!open) return null;

  const iso = toISODate(date);
  const title = date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const onBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  // swipe to close (downwards)
  const onTouchStart = (e: React.TouchEvent) => (startY.current = e.touches[0].clientY);
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 90) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-2 md:p-6"
      onMouseDown={onBackdrop}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
    >
      <div className="w-full max-w-6xl h-[92vh] bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-neutral-800">
          <div className="text-xl md:text-2xl tracking-wider" style={{ fontFamily: BRAND.fontTitle }}>
            {title.toUpperCase()}
          </div>
          <button aria-label="Close" onClick={onClose} className="mr-2 md:mr-4">
            <IconImg src={ICONS.close} alt="close" className="h-6 w-6 md:h-8 md:w-8" />
          </button>
        </div>

        {/* content */}
        <div className="h-[calc(92vh-64px)] overflow-y-auto p-3 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {DAY_SLOTS.map((time) => (
            <SlotRow
              key={time}
              time={time}
              name={values[time] || ""}
              onSave={(t, v) => onSave(t, v)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

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
  const [savedFlash, setSavedFlash] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => setValue(name), [name]);

  const doSave = (v: string) => {
    onSave(time, v.trim());
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1000);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  const onBlur = () => {
    if (value !== name) doSave(value);
  };

  const hasName = Boolean((value || "").trim());

  return (
    <div className={`border rounded-2xl p-3 md:p-4 bg-neutral-950/60 border-neutral-800` }>
      <div className="flex items-center justify-between mb-2">
        <div className="text-base md:text-lg font-extrabold tabular-nums" style={{ fontFamily: BRAND.fontTitle }}>
          {time}
        </div>
        {/* Saved message left side of footer row below; keep space here */}
      </div>

      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className="w-full bg-transparent border border-neutral-700 focus:border-white/70 rounded-xl px-3 py-3 outline-none text-base md:text-lg"
        placeholder=""
      />

      <div className="flex items-center justify-between mt-3">
        {/* Saved label (left) */}
        <div className={`text-sm md:text-base ${savedFlash ? "text-emerald-400" : "text-transparent"}`}>
          Saved
        </div>

        {/* Remove control (right) */}
        {hasName ? (
          !confirmRemove ? (
            <button
              onClick={() => setConfirmRemove(true)}
              className="px-3 py-2 rounded-xl shadow-md border border-neutral-700 hover:border-white/60 bg-neutral-900 hover:bg-neutral-800 transition text-sm md:text-base inline-flex items-center gap-2"
            >
              <IconImg src={ICONS.delete} alt="Remove" className="h-4 w-4 md:h-5 md:w-5" />
              Remove
            </button>
          ) : (
            <button
              onClick={() => {
                setValue("");
                setConfirmRemove(false);
                doSave("");
              }}
              className="px-3 py-2 rounded-xl border border-red-700/70 hover:border-red-500/80 bg-red-900/30 text-red-200 transition text-sm md:text-base"
            >
              Confirm
            </button>
          )
        ) : (
          <span className="text-xs text-neutral-600">&nbsp;</span>
        )}
      </div>
    </div>
  );
}
