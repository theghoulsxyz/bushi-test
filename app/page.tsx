'use client';
// Bushi Admin — stable build
import React, { useEffect, useMemo, useRef, useState } from 'react';

// =============================================================================
// Brand / Fonts
// =============================================================================
const BRAND = {
  nickname: 'Bushi',
  shopName: 'BushiBarberShop',
  logoLight: '/bushii-logo.png',
  accent: '#ffffff',
  fontTitle: "'Bebas Neue', sans-serif", // month + weekdays
  fontNumbers: "'UnifrakturCook', cursive", // gothic numbers only
};

function injectBrandFonts() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('bushi-fonts')) return;
  const link = document.createElement('link');
  link.id = 'bushi-fonts';
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=UnifrakturCook:wght@700&display=swap';
  document.head.appendChild(link);
}

// =============================================================================
// Helpers
// =============================================================================
const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const toISODate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function monthMatrix(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7; // Monday = 0
  const rows: Date[][] = [];
  let cur = 1 - startDay;
  for (let r = 0; r < 6; r++) {
    const row: Date[] = [];
    for (let c = 0; c < 7; c++) row.push(new Date(year, month, cur++));
    rows.push(row);
  }
  if (rows[5].every((d) => d.getMonth() !== month)) rows.pop();
  return rows;
}

const WEEKDAYS_SHORT = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// =============================================================================
// Slots
// =============================================================================
const START_HOUR = 8;
const END_HOUR = 22;
const SLOT_MINUTES = 30;
function buildSlots() {
  const out: string[] = [];
  for (let h = START_HOUR; h < END_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) out.push(`${pad(h)}:${pad(m)}`);
  }
  return out;
}
const DAY_SLOTS = buildSlots();

// =============================================================================
// Storage (localStorage)
// =============================================================================
const LS_KEY = 'barber_appointments_v1';
const canUseStorage = () =>
  typeof window !== 'undefined' && typeof localStorage !== 'undefined';
const readStore = (): Record<string, Record<string, string>> => {
  if (!canUseStorage()) return {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Record<string, string>>) : {};
  } catch {
    return {};
  }
};
const writeStore = (data: Record<string, Record<string, string>>) => {
  if (canUseStorage()) localStorage.setItem(LS_KEY, JSON.stringify(data));
};

// =============================================================================
// Icons
// =============================================================================
const ICONS = {
  delete: '/razor.png',
  close: '/close.svg',
  greenTick: '/tick-green.png',
};

const IconImg = ({
  src,
  alt,
  className = '',
}: {
  src: string;
  alt: string;
  className?: string;
}) => <img src={src} alt={alt} className={`object-contain ${className}`} />;

// =============================================================================
// Slot Row (Hour / Name / Remove)
// =============================================================================
function SlotRow({
  time,
  name,
  onSave,
}: {
  time: string;
  name: string;
  onSave: (t: string, v: string) => void;
}) {
  const [value, setValue] = useState(name);
  const [showSaved, setShowSaved] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => setValue(name), [name]);

  const doSave = (v: string) => {
    onSave(time, v.trim());
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 900);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  };
  const onBlur = () => {
    if (value !== name) doSave(value);
  };

  const hasName = Boolean((value || '').trim());

  return (
    <div className="border rounded-xl bg-neutral-950 border-neutral-800 px-2 py-1">
      <div
        className="grid items-center gap-2"
        style={{ gridTemplateColumns: '3.5rem minmax(0,1fr) 2.5rem' }}
      >
        {/* Hour */}
        <div
          className="text-lg md:text-xl font-normal tabular-nums leading-none"
          style={{ fontFamily: BRAND.fontTitle }}
        >
          {time}
        </div>

        {/* Name input (tight height) */}
        <div className="relative w-full">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
            className="w-full bg-neutral-900/70 border border-transparent focus:border-white/40 rounded-md px-2 py-0.5 text-lg md:text-xl text-center outline-none"
          />
        </div>

        {/* Remove / Saved */}
        <div className="flex items-center justify-end">
          {hasName && (
            showSaved ? (
              <IconImg src={ICONS.greenTick} alt="Saved" className="h-6 w-6 md:h-7 md:w-7" />
            ) : !confirmRemove ? (
              <button
                aria-label="Remove"
                onClick={() => setConfirmRemove(true)}
                className="h-7 w-7 inline-flex items-center justify-center"
              >
                <IconImg src={ICONS.delete} alt="Remove" className="h-6 w-6" />
              </button>
            ) : (
              <button
                onClick={() => {
                  setConfirmRemove(false);
                  setValue('');
                  doSave('');
                }}
                className="h-7 w-7 flex items-center justify-center rounded border border-red-600/70 bg-red-900/40 text-red-200"
                aria-label="Confirm remove"
              >
                ✓
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Day Editor Modal
// =============================================================================
function DayEditorModal({
  open,
  date,
  data,
  onSave,
  onClose,
}: {
  open: boolean;
  date: Date | null;
  data: Record<string, string>;
  onSave: (time: string, name: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !date) return null;

  const label = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div ref={ref} className="absolute inset-0 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-6xl bg-neutral-900 text-white rounded-2xl border border-neutral-800 shadow-2xl">
          <div className="flex items-center justify-between p-4 md:p-6 border-b border-neutral-800">
            <div className="text-2xl md:text-3xl" style={{ fontFamily: BRAND.fontTitle }}>
              {label}
            </div>
            <button onClick={onClose} className="p-2">
              <IconImg src={ICONS.close} alt="Close" className="h-6 w-6 md:h-7 md:w-7" />
            </button>
          </div>
          <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {DAY_SLOTS.map((t) => (
              <SlotRow key={t} time={t} name={data[t] || ''} onSave={onSave} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Year / Month Picker Modal
// =============================================================================
function YearModal({
  open,
  year,
  onPick,
  onClose,
}: {
  open: boolean;
  year: number;
  onPick: (m: number) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="absolute inset-0 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-3xl bg-neutral-900 text-white rounded-2xl border border-neutral-800 shadow-2xl p-5 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="text-3xl" style={{ fontFamily: BRAND.fontTitle }}>
              {year}
            </div>
            <button onClick={onClose} className="p-2">
              <IconImg src={ICONS.close} alt="Close" className="h-6 w-6" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {MONTHS.map((m, idx) => (
              <button
                key={m}
                onClick={() => onPick(idx)}
                className="rounded-xl bg-neutral-800/70 hover:bg-neutral-700 transition border border-neutral-700 py-3 text-lg tracking-wide"
                style={{ fontFamily: BRAND.fontTitle }}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main App
// =============================================================================
export default function BarbershopAdminPanel() {
  useEffect(() => injectBrandFonts(), []);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [store, setStore] = useState<Record<string, Record<string, string>>>(
    () => readStore()
  );
  const [showYear, setShowYear] = useState(false);
  const [editing, setEditing] = useState<Date | null>(null);

  useEffect(() => writeStore(store), [store]);

  const matrix = useMemo(
    () => monthMatrix(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  const openDay = (d: Date) => {
    if (d.getMonth() === viewMonth) setEditing(d);
  };
  const saveSlot = (time: string, name: string) => {
    if (!editing) return;
    const key = toISODate(editing);
    setStore((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [time]: name },
    }));
  };

  const monthLabel = `${MONTHS[viewMonth].toUpperCase()} ${viewYear}`;

  return (
    <div className="fixed inset-0 w-full h-dvh bg-black text-white overflow-hidden">
      <div className="max-w-7xl mx-auto p-4 md:p-10 h-full flex flex-col select-none">
        {/* Header */}
        <div className="flex items-start md:items-center justify-between gap-4 md:gap-8">
          <img src={BRAND.logoLight} alt="logo" className="h-16 md:h-24 object-contain" />
          <button
            onClick={() => setShowYear(true)}
            className="text-4xl md:text-6xl tracking-wider"
            style={{ fontFamily: BRAND.fontTitle }}
          >
            {monthLabel}
          </button>
        </div>

        {/* Days row */}
        <div
          className="mt-6 grid grid-cols-7 gap-4 md:gap-6 text-center"
          style={{ fontFamily: BRAND.fontTitle }}
        >
          {WEEKDAYS_SHORT.map((d) => (
            <div key={d} className="text-xl md:text-2xl font-extrabold uppercase text-gray-200">
              {d}
            </div>
          ))}
        </div>

        {/* Month grid */}
        <div
          className="mt-4 grid grid-cols-7 gap-4 md:gap-6 overflow-y-auto pb-10"
          style={{ fontFamily: BRAND.fontNumbers }}
        >
          {matrix.flat().map((d) => {
            const inMonth = d.getMonth() === viewMonth;
            const key = toISODate(d);
            const hasAny =
              store[key] && Object.values(store[key]).some((v) => (v || '').trim().length > 0);
            const num = d.getDate();
            const cls = [
              'flex items-center justify-center rounded-2xl aspect-square text-2xl md:text-3xl bg-neutral-900 border',
              inMonth
                ? 'border-neutral-700 hover:border-white/60'
                : 'border-neutral-800 opacity-40',
              hasAny ? 'ring-1 ring-emerald-600/60' : '',
            ].join(' ');
            return (
              <button key={key} onClick={() => openDay(d)} className={cls}>
                {num}
              </button>
            );
          })}
        </div>

        {/* Year + Day editor */}
        <YearModal
          open={showYear}
          year={viewYear}
          onPick={(m) => {
            setViewMonth(m);
            setShowYear(false);
          }}
          onClose={() => setShowYear(false)}
        />

        <DayEditorModal
          open={!!editing}
          date={editing}
          data={editing ? store[toISODate(editing)] || {} : {}}
          onSave={saveSlot}
          onClose={() => setEditing(null)}
        />
      </div>
    </div>
  );
}
