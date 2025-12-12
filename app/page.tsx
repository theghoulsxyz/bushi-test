'use client';
// Bushi Admin — Month grid + Day editor (2-column on tablet/desktop; 1-column on mobile)

import React, { useEffect, useMemo, useRef, useState } from 'react';

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

// Simple front-end PIN (not bank security, just to keep casual visitors out)
const PIN_CODE = '2580'; // change this to your own code

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
const toISODate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, delta: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);

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

// =============================================================================
// Weekdays / Months (Bulgarian)
// =============================================================================

// Bulgarian weekdays
// Monday = 0 (using (getDay()+6)%7 remap)
const WEEKDAYS_SHORT = ['Пон', 'Вто', 'Сря', 'Чет', 'Пет', 'Съб', 'Нед'];

const WEEKDAYS_FULL = [
  'Понеделник',
  'Вторник',
  'Сряда',
  'Четвъртък',
  'Петък',
  'Събота',
  'Неделя',
];

// Bulgarian months (Capitalized)
const MONTHS = [
  'Януари',
  'Февруари',
  'Март',
  'Април',
  'Май',
  'Юни',
  'Юли',
  'Август',
  'Септември',
  'Октомври',
  'Ноември',
  'Декември',
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

// Types
type Store = Record<string, Record<string, string>>;

// Utility: a day is "full" only when **every** slot has a non-empty name
const isDayFull = (dayISO: string, store: Store) => {
  const day = store[dayISO];
  if (!day) return false;
  for (const slot of DAY_SLOTS) {
    const v = day[slot];
    if (!v || (v || '').trim().length === 0) return false;
  }
  return true;
};

// =============================================================================
// Remote Sync (multi-device: phone + tablet + PC)
// =============================================================================
const API_ENDPOINT = '/api/appointments';

async function fetchRemoteStore(): Promise<Store | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch(API_ENDPOINT, { method: 'GET', cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== 'object') return null;
    return data as Store;
  } catch {
    return null;
  }
}

async function pushRemoteStore(data: Store): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    // fail silently; Supabase is the only source, but network errors will just not sync
  }
}

// =============================================================================
// Tiny Dev Checks (acts like test cases)
// =============================================================================
function runDevChecks(viewYear: number, viewMonth: number) {
  const matrix = monthMatrix(viewYear, viewMonth);
  console.assert(WEEKDAYS_SHORT.length === 7, 'Weekday labels must be 7');
  console.assert(
    matrix.length >= 4 && matrix.length <= 6,
    'Month matrix rows out of range',
  );
  console.assert(DAY_SLOTS.length > 0, 'Slots should not be empty');
  console.assert(
    matrix.flat().length >= 28 && matrix.flat().length <= 42,
    'Month grid 28..42 days',
  );
  console.assert(
    START_HOUR >= 0 && END_HOUR <= 24 && SLOT_MINUTES > 0,
    'Slot constants sane',
  );

  const d = new Date(2025, 0, 31);
  const d2 = addDays(d, 1);
  console.assert(
    d2.getDate() === 1 && d2.getMonth() === 1,
    'addDays should roll month correctly',
  );
}

// =============================================================================
// Main Calendar Component
// =============================================================================
function BarberCalendarCore() {
  useEffect(() => injectBrandFonts(), []);

  const today = new Date();
  const todayISO = toISODate(today);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [showYear, setShowYear] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // === APPOINTMENT STORE — Supabase ONLY, no localStorage ===
  const [store, setStore] = useState<Store>({});
  const lastLocalChangeRef = useRef<number | null>(null);

  // Manual / periodic remote sync (Supabase is source of truth)
  const remoteCancelledRef = useRef(false);
  const remoteSyncInFlightRef = useRef(false);

  const syncFromRemote = async () => {
    if (remoteSyncInFlightRef.current) return;
    remoteSyncInFlightRef.current = true;
    try {
      const remote = await fetchRemoteStore();
      if (!remote || remoteCancelledRef.current) return;
      // Remote is source of truth
      setStore(remote);
    } finally {
      remoteSyncInFlightRef.current = false;
    }
  };

  // 🔄 Load from Supabase on first render, on visibility, and every few seconds
  useEffect(() => {
    remoteCancelledRef.current = false;

    // 1) Initial load
    syncFromRemote();

    // 2) Every time the document becomes visible again
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncFromRemote();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    // 3) Periodic sync (approx. realtime between devices)
    const interval = setInterval(syncFromRemote, 4000); // every 4 seconds

    return () => {
      remoteCancelledRef.current = true;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      clearInterval(interval);
    };
  }, []);

  // prevent background scrolling when a modal is open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    if (showYear || selectedDate) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showYear, selectedDate]);

  // Dev checks
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production')
      runDevChecks(viewYear, viewMonth);
  }, [viewYear, viewMonth]);

  const [armedRemove, setArmedRemove] = useState<string | null>(null);
  const [savedPulse, setSavedPulse] = useState<{
    day: string;
    time: string;
    ts: number;
  } | null>(null);

  // swipe state for smooth left/right day navigation on touch devices
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);
  const swipeDX = useRef<number>(0);
  const swipeDY = useRef<number>(0);
  const [swipeStyle, setSwipeStyle] = useState<React.CSSProperties>({});
  const SWIPE_THRESHOLD = 48; // px
  const VERTICAL_CLOSE_THRESHOLD = 90; // px (tablet: swipe down to close)
  const isTabletOrBigger = () =>
    typeof window !== 'undefined' &&
    (window.matchMedia
      ? window.matchMedia('(min-width: 768px)').matches
      : window.innerWidth >= 768);

  const shiftSelectedDay = (delta: number) => {
    setSelectedDate((prev) => {
      if (!prev) return prev;
      const next = addDays(prev, delta);
      if (next.getFullYear() !== viewYear || next.getMonth() !== viewMonth) {
        setViewYear(next.getFullYear());
        setViewMonth(next.getMonth());
      }
      return next;
    });
  };

  const animateShift = (delta: number) => {
    setSwipeStyle({
      transform: `translateX(${delta > 0 ? -24 : 24}px)`,
      opacity: 0.3,
      transition: 'transform 160ms ease, opacity 160ms ease',
    });
    setTimeout(() => {
      shiftSelectedDay(delta);
      setSwipeStyle({
        transform: `translateX(${delta > 0 ? 24 : -24}px)`,
        opacity: 0.3,
        transition: 'none',
      });
      requestAnimationFrame(() => {
        setSwipeStyle({
          transform: 'translateX(0)',
          opacity: 1,
          transition: 'transform 160ms ease, opacity 160ms ease',
        });
      });
    }, 160);
  };

  const matrix = useMemo(
    () => monthMatrix(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  // Allow clicking grey days; update month/year if needed
  const openDay = (d: Date) => {
    if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) {
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
    setSelectedDate(d);
  };

  const monthLabel = `${MONTHS[viewMonth]} ${viewYear}`;

  // ===== Save / Delete with synced push to Supabase =====
  const saveName = (day: string, time: string, nameRaw: string) => {
    const name = nameRaw.trim();
    setStore((prev) => {
      const next: Store = { ...prev };
      if (!next[day]) next[day] = {};

      if (name === '') {
        if (next[day]) delete next[day][time];
        if (next[day] && Object.keys(next[day]).length === 0) {
          delete next[day];
        }
      } else {
        next[day][time] = name;
      }

      lastLocalChangeRef.current = Date.now();
      pushRemoteStore(next);

      return next;
    });

    setSavedPulse({ day, time, ts: Date.now() });
    setTimeout(() => {
      setSavedPulse((p) =>
        p && p.day === day && p.time === time ? null : p,
      );
    }, 900);
    setArmedRemove(null);
  };

  const armRemove = (timeKey: string) => setArmedRemove(timeKey);

  const confirmRemove = (day: string, time: string) => {
    setStore((prev) => {
      const next: Store = { ...prev };
      if (next[day]) {
        delete next[day][time];
        if (Object.keys(next[day]).length === 0) {
          delete next[day];
        }
      }

      lastLocalChangeRef.current = Date.now();
      pushRemoteStore(next);

      return next;
    });
    setArmedRemove(null);
  };

  // Day navigation helpers
  const goPrevDay = () => animateShift(-1);
  const goNextDay = () => animateShift(1);

  // keyboard arrows when day editor is open
  useEffect(() => {
    if (!selectedDate) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrevDay();
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNextDay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedDate]);

  // touch handlers for swipe inside day editor (ignore vertical drags)
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    swipeStartX.current = e.touches[0].clientX;
    swipeStartY.current = e.touches[0].clientY;
    swipeDX.current = 0;
    swipeDY.current = 0;
    setSwipeStyle({ transition: 'none' });
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (swipeStartX.current == null || swipeStartY.current == null) return;
    swipeDX.current = e.touches[0].clientX - swipeStartX.current;
    swipeDY.current = e.touches[0].clientY - swipeStartY.current;
    if (Math.abs(swipeDX.current) > Math.abs(swipeDY.current)) {
      setSwipeStyle({ transform: `translateX(${swipeDX.current}px)` });
    }
  };

  const onTouchEnd = () => {
    if (swipeStartX.current == null) return;

    const dx = swipeDX.current;
    const dy = swipeDY.current;

    swipeStartX.current = null;
    swipeStartY.current = null;
    swipeDX.current = 0;
    swipeDY.current = 0;

    // Tablet gesture: swipe down to close the day editor
    if (
      isTabletOrBigger() &&
      dy >= VERTICAL_CLOSE_THRESHOLD &&
      Math.abs(dy) > Math.abs(dx) * 1.2
    ) {
      setSelectedDate(null);
      setSwipeStyle({});
      return;
    }

    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      animateShift(dx > 0 ? -1 : 1);
    } else {
      setSwipeStyle({
        transform: 'translateX(0)',
        transition: 'transform 160ms ease',
      });
    }
  };

  return (
    <div className="fixed inset-0 w-full h-dvh bg-black text-white overflow-hidden">
      <div className="max-w-screen-2xl mx-auto px-[clamp(12px,2.5vw,40px)] pt-[clamp(12px,2.5vw,40px)] pb-[clamp(8px,2vw,24px)] h-full flex flex-col select-none">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 md:gap-8">
          <img
            src={BRAND.logoLight}
            alt="logo"
            className="h-72 md:h-[22rem] w-auto cursor-pointer"
            onClick={() => {
              const now = new Date();
              setViewYear(now.getFullYear());
              setViewMonth(now.getMonth());
              // Manual force refresh from Supabase (if first load was empty)
              syncFromRemote();
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
              className="text-center font-extrabold text-gray-200 text-[clamp(14px,2.8vw,22px)]"
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
            const isFull = isDayFull(key, store);
            const isToday = inMonth && key === todayISO;
            const cls = [
              'rounded-2xl flex items-center justify-center bg-neutral-900 text-white border transition cursor-pointer',
              'h-full w-full aspect-square md:aspect-auto p-[clamp(6px,1vw,20px)] focus:outline-none focus:ring-2 focus:ring-white/60',
              !inMonth
                ? 'border-neutral-800 opacity-40 hover:opacity-70'
                : isToday
                  ? 'border-neutral-700'
                  : 'border-neutral-700 hover:border-white/60',
            ].join(' ');
            return (
              <button key={key} onClick={() => openDay(d)} className={cls}>
                <span
                  className={`select-none text-[clamp(17px,3.5vw,32px)] ${
                    isToday ? 'font-extrabold' : ''
                  }`}
                  style={{ fontFamily: BRAND.fontNumbers }}
                >
                  {isFull ? 'X' : num}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Year Modal */}
      {showYear && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70"
          onMouseDown={() => setShowYear(false)}
        >
          <div
            className="w-[min(100%-32px,820px)] max-w-xl rounded-3xl border border-neutral-800 bg-neutral-950/95 shadow-2xl px-6 py-6 sm:px-8 sm:py-8"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {/* Header: year +/- + close */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setViewYear((y) => y - 1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700/70 bg-neutral-900/80 hover:bg-neutral-800 text-sm"
                  aria-label="Previous year"
                >
                  ‹
                </button>
                <div
                  className="text-[clamp(26px,5vw,40px)] leading-none"
                  style={{ fontFamily: BRAND.fontTitle }}
                >
                  {viewYear}
                </div>
                <button
                  onClick={() => setViewYear((y) => y + 1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700/70 bg-neutral-900/80 hover:bg-neutral-800 text-sm"
                  aria-label="Next year"
                >
                  ›
                </button>
              </div>
              <button
                onClick={() => setShowYear(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700/70 bg-neutral-900/80 hover:bg-neutral-800 transition"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Months grid */}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              {MONTHS.map((label, idx) => (
                <button
                  key={label + viewYear}
                  onClick={() => {
                    setViewMonth(idx);
                    setShowYear(false);
                  }}
                  className={`h-11 sm:h-12 rounded-2xl border text-[13px] sm:text-[14px] tracking-[0.12em] uppercase flex items-center justify-center transition ${
                    idx === viewMonth
                      ? 'border-white text-white bg-neutral-900'
                      : 'border-neutral-700/70 text-neutral-200 bg-neutral-900/50 hover:bg-neutral-800'
                  }`}
                  style={{ fontFamily: BRAND.fontTitle }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Day Editor Modal */}
      {selectedDate && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80"
          onMouseDown={() => setSelectedDate(null)}
        >
          <div
            className="max-w-6xl w-[94vw] md:w-[1100px] h-[90vh] rounded-2xl border border-neutral-700 bg-[rgb(10,10,10)] p-4 md:p-6 shadow-2xl overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between">
                <h3
                  className="text-2xl md:text-3xl font-bold"
                  style={{ fontFamily: BRAND.fontTitle }}
                >
                  {WEEKDAYS_FULL[(selectedDate.getDay() + 6) % 7]}{' '}
                  {selectedDate.getDate()} {MONTHS[selectedDate.getMonth()]}{' '}
                  {selectedDate.getFullYear()}
                </h3>
                <button
                  className="text-2xl md:text-3xl px-2 md:px-3"
                  aria-label="Close"
                  onClick={() => setSelectedDate(null)}
                >
                  ×
                </button>
              </div>

              {/* Content area: scrollable on phone, fixed on tablet/desktop */}
              <div
                className="mt-4 flex-1 overflow-y-auto md:overflow-visible"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                style={swipeStyle}
              >
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
                  style={{ gridAutoRows: 'minmax(32px,1fr)' }}
                >
                  {(() => {
                    const dayISO = toISODate(selectedDate);
                    return DAY_SLOTS.map((time) => {
                      const value = (store[dayISO] && store[dayISO][time]) || '';
                      const hasName = (value || '').trim().length > 0;
                      const isSaved = !!(
                        savedPulse &&
                        savedPulse.day === dayISO &&
                        savedPulse.time === time
                      );
                      const timeKey = `${dayISO}_${time}`;
                      const isArmed = armedRemove === timeKey;
                      return (
                        <div
                          key={timeKey}
                          className="relative rounded-2xl bg-neutral-900/80 border border-neutral-800 px-3 py-1 flex items-center gap-3 overflow-hidden"
                        >
                          <div
                            className="text-[1.05rem] md:text-[1.15rem] font-semibold tabular-nums min-w-[4.9rem] text-center select-none"
                            style={{ fontFamily: BRAND.fontBody }}
                          >
                            {time}
                          </div>

                          <div className="flex-1 min-w-0 flex items-center gap-2">
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
                              onBlur={(e) =>
                                saveName(dayISO, time, e.currentTarget.value)
                              }
                              className="block w-full text-white bg-[rgb(10,10,10)] border border-neutral-700/70 focus:border-white/70 focus:outline-none focus:ring-0 rounded-lg px-3 py-1.5 text-center transition-all duration-200"
                              style={{ fontFamily: BRAND.fontBody }}
                            />

                            {hasName && (
                              <button
                                onClick={() =>
                                  isArmed
                                    ? confirmRemove(dayISO, time)
                                    : armRemove(timeKey)
                                }
                                className={`shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-lg grid place-items-center transition border ${
                                  isArmed
                                    ? 'bg-red-900/30 border-red-600/70'
                                    : 'bg-neutral-900/60 hover:bg-neutral-800/70 border-neutral-700/50'
                                }`}
                                aria-label={isArmed ? 'Confirm remove' : 'Remove'}
                              >
                                <img
                                  src={isArmed ? '/tick-green.png' : '/razor.png'}
                                  alt={isArmed ? 'Confirm' : 'Remove'}
                                  className="w-4 h-4 md:w-5 md:h-5 object-contain"
                                />
                              </button>
                            )}
                          </div>

                          <img
                            src="/tick-green.png"
                            alt="saved"
                            className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 md:w-6 md:h-6 transition-opacity duration-300 ${
                              isSaved ? 'opacity-100' : 'opacity-0'
                            }`}
                          />
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// PIN-locked wrapper (for Netlify / public URL)
// =============================================================================
export default function BarbershopAdminPanel() {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (
      process.env.NODE_ENV === 'production' &&
      localStorage.getItem('bushi_unlocked') === '1'
    ) {
      setUnlocked(true);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === PIN_CODE) {
      setUnlocked(true);
      setError('');
      if (typeof window !== 'undefined') {
        localStorage.setItem('bushi_unlocked', '1');
      }
    } else {
      setError('Wrong PIN');
    }
  };

  if (!unlocked) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black text-white overflow-hidden">
        {/* Ambient glow background */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.16)_0,_transparent_55%),radial-gradient(circle_at_bottom,_rgba(255,255,255,0.12)_0,_transparent_55%)]" />

        {/* Card */}
        <div className="relative w-[min(100%-40px,420px)] rounded-[32px] border border-white/10 bg-[rgba(8,8,8,0.9)] backdrop-blur-xl px-7 py-8 shadow-[0_24px_80px_rgba(0,0,0,0.9)]">
          {/* Small label */}
          <div className="mb-4 flex justify-center">
            <span
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-neutral-300"
              style={{ fontFamily: BRAND.fontBody }}
            >
              Admin Access
            </span>
          </div>

          {/* Logo wordmark */}
          <div className="mb-4 flex justify-center">
            <img
              src="/bush.png"
              alt="Bushi logo"
              className="max-h-16 w-auto object-contain"
            />
          </div>
          <p
            className="text-xs text-neutral-400 text-center mb-6"
            style={{ fontFamily: BRAND.fontBody }}
          >
            Enter your PIN to open the schedule.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Input wrapper */}
            <div className="rounded-2xl bg-neutral-900/80 border border-white/12 px-4 py-3 flex items-center focus-within:border-white/70 transition">
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                maxLength={6}
                className="w-full bg-transparent border-none outline-none text-center text-lg tracking-[0.35em] placeholder:text-neutral-600"
                style={{ fontFamily: BRAND.fontBody }}
                placeholder="••••"
              />
            </div>

            {error && (
              <div
                className="text-xs text-red-400 text-center"
                style={{ fontFamily: BRAND.fontBody }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-2xl bg-white text-black font-semibold py-2.5 text-sm tracking-[0.16em] uppercase hover:bg-neutral-200 active:bg-neutral-300 transition shadow-[0_10px_30px_rgba(0,0,0,0.7)]"
              style={{ fontFamily: BRAND.fontBody }}
            >
              Unlock
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <BarberCalendarCore />;
}
