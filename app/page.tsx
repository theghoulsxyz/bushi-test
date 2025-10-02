// v3.1: revert logo sizing to earlier larger look, reduce gap between logo and month/year
'use client';
import React, { useEffect, useMemo, useState } from 'react';

// =============================================================================
// Brand / Fonts
// =============================================================================
const BRAND = {
  nickname: 'Bushi',
  shopName: 'BushiBarberShop',
  logoLight: '/bushii-logo.png',
  accent: '#ffffff',
  fontTitle: "'Bebas Neue', sans-serif",
  fontNumbers: "'UnifrakturCook', cursive",
  fontBody: "'Inter', sans-serif",
};

function injectBrandFonts() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('bushi-fonts')) return;
  const link = document.createElement('link');
  link.id = 'bushi-fonts';
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=UnifrakturCook:wght@700&family=Inter:wght@400;500;600&display=swap';
  document.head.appendChild(link);
}

// =============================================================================
// Helpers
// =============================================================================
const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function monthMatrix(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7;
  const rows: Date[][] = [];
  let cur = 1 - startDay;
  for (let r = 0; r < 6; r++) {
    const row: Date[] = [];
    for (let c = 0; c < 7; c++) row.push(new Date(year, month, cur++));
    rows.push(row);
  }
  if (rows[5] && rows[5].every((d) => d.getMonth() !== month)) rows.pop();
  return rows;
}

const WEEKDAYS_SHORT = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MONTHS = [
  'January','February','March','April','May','June','July','August','September','October','November','December'
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
// Storage
// =============================================================================
const LS_KEY = 'barber_appointments_v1';
const canUseStorage = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';
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
// Component
// =============================================================================
export default function BarbershopAdminPanel() {
  useEffect(() => injectBrandFonts(), []);
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const matrix = useMemo(() => monthMatrix(viewYear, viewMonth), [viewYear, viewMonth]);
  const openDay = (d: Date) => { if (d.getMonth() === viewMonth) {/* open modal here */} };
  const monthLabel = `${MONTHS[viewMonth]} ${viewYear}`;

  return (
    <div className="fixed inset-0 w-full h-dvh bg-black text-white overflow-hidden">
      <div className="max-w-screen-2xl mx-auto px-[clamp(12px,2.5vw,40px)] pt-[clamp(12px,2vw,28px)] pb-[clamp(8px,2vw,20px)] h-full flex flex-col select-none">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 md:gap-6">
          <img
            src={BRAND.logoLight}
            alt="logo"
            className="h-32 sm:h-40 md:h-48 lg:h-56 w-auto cursor-pointer"
            onClick={() => {
              const now = new Date();
              setViewYear(now.getFullYear());
              setViewMonth(now.getMonth());
            }}
          />
          <button
            onClick={() => {/* show year modal */}}
            className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold cursor-pointer hover:text-gray-300 select-none"
            style={{ fontFamily: BRAND.fontTitle }}
            title="Open year view"
          >
            {monthLabel}
          </button>
        </div>

        {/* Weekday labels */}
        <div
          className="mt-[clamp(12px,2vw,18px)] grid grid-cols-7 gap-[clamp(6px,1vw,14px)] text-center"
          style={{ fontFamily: BRAND.fontTitle }}
        >
          {WEEKDAYS_SHORT.map((d) => (
            <div key={d} className="text-center font-bold text-gray-300 text-[clamp(18px,3vw,26px)]">
              {d}
            </div>
          ))}
        </div>

        {/* Month grid */}
        <div
          className="mt-[clamp(10px,1.8vw,18px)] flex-1 grid grid-cols-7 gap-[clamp(6px,1vw,14px)] overflow-visible pb-[clamp(24px,2.5vw,40px)]"
          style={{ fontFamily: BRAND.fontNumbers, gridAutoRows: '1fr' }}
        >
          {matrix.flat().map((d) => {
            const inMonth = d.getMonth() === viewMonth;
            const key = toISODate(d);
            const num = d.getDate();
            const cls = [
              'rounded-2xl flex items-center justify-center bg-neutral-900 text-white border transition cursor-pointer',
              'h-full w-full p-[clamp(8px,1vw,16px)] focus:outline-none focus:ring-2 focus:ring-white/60',
              inMonth ? 'border-neutral-700 hover:border-white/60' : 'border-neutral-800 opacity-40',
            ].join(' ');
            return (
              <button key={key} onClick={() => openDay(d)} className={cls}>
                <span className="select-none text-[clamp(17px,3vw,30px)]" style={{ fontFamily: BRAND.fontNumbers }}>
                  {num}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
