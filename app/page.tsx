// v2.1 fix: close <input /> properly, finish JSX, and keep remove button OUTSIDE the input.
'use client';
// Bushi Admin — Month grid + Day editor (2-column on tablet/desktop; 1-column on mobile)
// Clock (hours) + person names use clean sans-serif (Inter).

import React, { useEffect, useMemo, useState } from 'react';

// =============================================================================
// Brand / Fonts
// =============================================================================
const BRAND = {
  nickname: 'Bushi',
  shopName: 'BushiBarberShop',
  logoLight: '/bushii-logo.png',
  accent: '#ffffff',
  fontTitle: "'Bebas Neue', sans-serif", // month + weekday labels
  fontNumbers: "'UnifrakturCook', cursive", // gothic for day numbers
  fontBody: "'Inter', sans-serif", // clean font for clock + person names
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
  const startDay = (first.getDay() + 6) % 7; // Monday = 0
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
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// =============================================================================
// Slots
// =============================================================================
const START_HOUR = 8;
const END_HOUR = 22; // day ends at 22:00, last slot 21:30
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
// Tiny Dev Checks (acts like test cases)
// =============================================================================
function runDevChecks(viewYear: number, viewMonth: number) {
  const matrix = monthMatrix(viewYear, viewMonth);
  console.assert(WEEKDAYS_SHORT.length === 7, 'Weekday labels must be 7');
  console.assert(matrix.length >= 4 && matrix.length <= 6, 'Month matrix rows out of range');
  console.assert(DAY_SLOTS.length > 0, 'Slots should not be empty');
  console.assert(matrix.flat().length >= 28 && matrix.flat().length <= 42, 'Month grid 28..42 days');
  console.assert(
    DAY_SLOTS.length === (END_HOUR - START_HOUR) * (60 / SLOT_MINUTES),
    'Unexpected slot count for the day',
  );
}

// =============================================================================
// Component
// =============================================================================
export default function BarbershopAdminPanel() {
  useEffect(() => injectBrandFonts(), []);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [showYear, setShowYear] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [store, setStore] = useState<Record<string, Record<string, string>>>(readStore());
  useEffect(() => writeStore(store), [store]);

  // prevent background scrolling when a modal is open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    if (showYear || selectedDate) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showYear, selectedDate]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') runDevChecks(viewYear, viewMonth);
  }, [viewYear, viewMonth]);

  // day editor UI state
  const [armedRemove, setArmedRemove] = useState<string | null>(null);
  const [savedPulse, setSavedPulse] = useState<{ day: string; time: string; ts: number } | null>(null);

  const matrix = useMemo(() => monthMatrix(viewYear, viewMonth), [viewYear, viewMonth]);

  const openDay = (d: Date) => {
    if (d.getMonth() === viewMonth) setSelectedDate(d);
  };
  const monthLabel = `${MONTHS[viewMonth]} ${viewYear}`;

  // save helpers
  const saveName = (day: string, time: string, nameRaw: string) => {
    const name = nameRaw.trim();
    setStore((prev) => {
      const next = { ...prev };
      if (!next[day]) next[day] = {};
      if (name === '') {
        if (next[day]) delete next[day][time];
        if (next[day] && Object.keys(next[day]).length === 0) delete next[day];
      } else {
        next[day][time] = name;
      }
      return next;
    });
    setSavedPulse({ day, time, ts: Date.now() });
    setTimeout(
      () => setSavedPulse((p) => (p && p.day === day && p.time === time ? null : p)),
      900,
    );
    setArmedRemove(null);
  };
  const armRemove = (timeKey: string) => setArmedRemove(timeKey);
  const confirmRemove = (day: string, time: string) => {
    setStore((prev) => {
      const next = { ...prev };
      if (next[day]) {
        delete next[day][time];
        if (Object.keys(next[day]).length === 0) delete next[day];
      }
      return next;
    });
    setArmedRemove(null);
  };

  return (
    <div className="fixed inset-0 w-full h-dvh bg-black text-white overflow-hidden">
      {/* Header + Month grid container */}
      <div className="max-w-screen-2xl mx-auto px-[clamp(12px,2.5vw,40px)] pt-[clamp(12px,2.5vw,40px)] pb-[clamp(8px,2vw,24px)] h-full flex flex-col select-none">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 md:gap-8">
          <img
            src={BRAND.logoLight}
            alt="logo"
            className="h-\[50vw\] min-h-\[400px\] min-h-\[600px\] sm:h-68 md:h-\[48rem\] w-auto cursor-pointer ml-2 sm:ml-2"
            onClick={() => {
              const now = new Date();
              setViewYear(now.getFullYear());
              setViewMonth(now.getMonth());
            }}
          />
          <button
            onClick={() => setShowYear(true)}
            className="text-3xl sm:text-4xl md:text-7xl font-bold cursor-pointer hover:text-gray-300 select-none text-right flex-1"
            style={{ fontFamily: BRAND.fontTitle }}
            title="Open year view"
          >
            {monthLabel}
          </button>
        </div>

        {/* Weekday labels */}
        <div
          className="mt-[clamp(12px,2.8vw,28px)] grid grid-cols-7 gap-[clamp(6px,1.2vw,16px)] text-center"
          style={{ fontFamily: BRAND.fontTitle }}
        >
          {WEEKDAYS_SHORT.map((d) => (
            <div
              key={d}
              className="text-center font-bold text-gray-300 text-[clamp(18px,3.2vw,26px)]"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Month grid */}
        <div
          className="mt-[clamp(10px,2.2vw,20px)] flex-1 grid grid-cols-7 gap-[clamp(4px,2vw,16px)] overflow-visible pb-[clamp(24px,3.2vw,48px)]"
          style={{ fontFamily: BRAND.fontNumbers, gridAutoRows: '1fr' }}
        >
          {matrix.flat().map((d) => {
            const inMonth = d.getMonth() === viewMonth;
            const key = toISODate(d);
            const num = d.getDate();
            const cls = [
              'rounded-2xl flex items-center justify-center bg-neutral-900 text-white border transition cursor-pointer',
              'h-full w-full aspect-square md:aspect-auto p-[clamp(6px,1vw,20px)] focus:outline-none focus:ring-2 focus:ring-white/60',
              inMonth ? 'border-neutral-700 hover:border-white/60' : 'border-neutral-800 opacity-40',
            ].join(' ');
            return (
              <button key={key} onClick={() => openDay(d)} className={cls}>
                <span
                  className="select-none text-[clamp(17px,3.5vw,32px)]"
                  style={{ fontFamily: BRAND.fontNumbers }}
                >
                  {num}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== Year Modal ===== */}
      {showYear && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80"
          onMouseDown={() => setShowYear(false)}
        >
          <div
            className="max-w-5xl w-[92vw] md:w-[900px] rounded-2xl border border-neutral-700 bg-[rgb(10,10,10)] p-4 md:p-6 shadow-2xl overflow-y-auto max-h-[88vh]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="text-3xl md:text-5xl font-bold" style={{ fontFamily: BRAND.fontTitle }}>
                {viewYear}
              </h2>
              <button
                className="text-3xl md:text-4xl px-2 md:px-3"
                aria-label="Close"
                onClick={() => setShowYear(false)}
              >
                ×
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
              {MONTHS.map((m, i) => (
                <button
                  key={m}
                  onClick={() => {
                    setViewMonth(i);
                    setShowYear(false);
                  }}
                  className={`rounded-xl border px-4 py-3 text-center transition bg-neutral-900 hover:bg-neutral-800 ${
                    i === viewMonth ? 'border-white/70' : 'border-neutral-700'
                  }`}
                  style={{ fontFamily: BRAND.fontTitle }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== Day Editor Modal ===== */}
      {selectedDate && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80"
          onMouseDown={() => setSelectedDate(null)}
        >
          <div
            className="max-w-6xl w-\[94vw\] md:w-\[1100px\] h-\[92vh\] rounded-2xl border border-neutral-700 bg-[rgb(10,10,10)] p-4 md:p-6 shadow-2xl overflow-y-auto md:overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: BRAND.fontTitle }}>
                {WEEKDAYS_SHORT[(selectedDate.getDay() + 6) % 7]} {selectedDate.getDate()} {
                  MONTHS[selectedDate.getMonth()]
                } {selectedDate.getFullYear()}
              </h3>
              <button
                className="text-2xl md:text-3xl px-2 md:px-3"
                aria-label="Close"
                onClick={() => setSelectedDate(null)}
              >
                ×
              </button>
            </div>

            {/* One column on mobile (scrollable); Two columns on md+ (no scroll) */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3 [grid-auto-rows:minmax(46px,1fr)] md:[grid-auto-rows:minmax(40px,1fr)]">
              {(() => {
                const dayISO = toISODate(selectedDate);
                return DAY_SLOTS.map((time) => {
                  const value = (store[dayISO] && store[dayISO][time]) || '';
                  const hasName = (value || '').trim().length > 0;
                  const isSaved = savedPulse && savedPulse.day === dayISO && savedPulse.time === time;
                  const timeKey = `${dayISO}_${time}`;
                  const isArmed = armedRemove === timeKey;
                  return (
                    <div
                      key={timeKey}
                      className="rounded-2xl bg-neutral-900 border border-neutral-800 px-3 py-1.5 flex items-center gap-3 overflow-hidden"
                    >
                      {/* Time (plain, no box) */}
                      <div
                        className="text-[1.25rem] md:text-[1.35rem] font-semibold tabular-nums min-w-[4.9rem] text-center select-none"
                        style={{ fontFamily: BRAND.fontBody }}
                      >
                        {time}
                      </div>

                      {/* Name input + actions */}
                      <div className="relative flex-1 min-w-0 flex items-center gap-2">
                        <input
                          key={timeKey + value}
                          defaultValue={value}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const v = (e.target as HTMLInputElement).value;
                              saveName(dayISO, time, v);
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          onBlur={(e) => saveName(dayISO, time, e.currentTarget.value)}
                          className={`block w-full text-white bg-[rgb(10,10,10)] border border-neutral-700/70 focus:border-white/70 focus:outline-none focus:ring-0 rounded-lg px-3 py-1.5 text-center transition-all duration-200 ${hasName ? 'pr-3' : 'pr-3'}`}
                          style={{ fontFamily: BRAND.fontBody }}
                        />

                        {/* Saved pulse overlay (appears over the remove area, fades out) */}
                        <img
                          src="/tick-green.png"
                          alt="saved"
                          className={`pointer-events-none absolute right-10 md:right-12 top-1/2 -translate-y-1/2 w-5 h-5 md:w-6 md:h-6 transition-opacity duration-300 ${isSaved ? 'opacity-100' : 'opacity-0'}`}
                        />

                        {/* Remove / Confirm button to the RIGHT of the input */}
                        {hasName && (
                          <button
                            onClick={() => (isArmed ? confirmRemove(dayISO, time) : armRemove(timeKey))}
                            className={`shrink-0 w-9 h-9 md:w-10 md:h-10 rounded-lg grid place-items-center transition border ${
                              isArmed
                                ? 'bg-red-900/30 border-red-600/70'
                                : 'bg-neutral-900/60 hover:bg-neutral-800/70 border-neutral-700/50'
                            }`}
                            aria-label={isArmed ? 'Confirm remove' : 'Remove'}
                          >
                            <img
                              src={isArmed ? '/tick-green.png' : '/razor.png'}
                              alt={isArmed ? 'Confirm' : 'Remove'}
                              className="w-5 h-5 md:w-6 md:h-6 object-contain"
                            />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
