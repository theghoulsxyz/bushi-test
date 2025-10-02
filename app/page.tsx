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

  const monthLabel = `${MONTHS[viewMonth].toUpperCase()} ${viewYear}`;

  return (
    <div className="fixed inset-0 w-full h-dvh bg-black text-white overflow-hidden">
      <div className="max-w-7xl mx-auto p-4 md:p-10 h-full flex flex-col select-none">
        {/* Header */}
        <div className="flex items-start md:items-center justify-between gap-4 md:gap-8">
          <img
            src={BRAND.logoLight}
            alt="logo"
            className="h-72 md:h-[22rem] w-auto cursor-pointer"
          />
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
            const num = d.getDate();
            const cls = [
              'flex items-center justify-center rounded-2xl aspect-square text-2xl md:text-3xl bg-neutral-900 border',
              inMonth
                ? 'border-neutral-700 hover:border-white/60'
                : 'border-neutral-800 opacity-40',
            ].join(' ');
            return (
              <button key={key} onClick={() => openDay(d)} className={cls}>
                {num}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
