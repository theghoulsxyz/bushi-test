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

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

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
    // fail silently
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

  const cancelledSyncRef = useRef(false);

  const syncFromRemote = async () => {
    const remote = await fetchRemoteStore();
    if (!remote || cancelledSyncRef.current) return;
    setStore(remote);
  };

  // 🔄 Load from Supabase on first render, on visibility, and every few seconds
  useEffect(() => {
    cancelledSyncRef.current = false;

    syncFromRemote();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncFromRemote();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    const interval = setInterval(syncFromRemote, 4000);

    return () => {
      cancelledSyncRef.current = true;
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

  // Auto-cancel armed delete after 3.5s
  const armedTimeoutRef = useRef<number | null>(null);
  const clearArmedTimeout = () => {
    if (armedTimeoutRef.current != null) {
      window.clearTimeout(armedTimeoutRef.current);
      armedTimeoutRef.current = null;
    }
  };
  const armRemove = (timeKey: string) => {
    clearArmedTimeout();
    setArmedRemove(timeKey);
    armedTimeoutRef.current = window.setTimeout(() => {
      setArmedRemove((cur) => (cur === timeKey ? null : cur));
      armedTimeoutRef.current = null;
    }, 3500);
  };

  // gesture state for iOS-like (1:1) day navigation on touch devices
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);
  const swipeDX = useRef<number>(0);
  const swipeDY = useRef<number>(0);

  const [swipeStyle, setSwipeStyle] = useState<React.CSSProperties>({});
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const gestureModeRef = useRef<'none' | 'horizontal' | 'vertical'>('none');

  const SWIPE_THRESHOLD = 52; // px
  const VERTICAL_CLOSE_THRESHOLD = 95; // px
  const SNAP_EASE = 'cubic-bezier(0.25, 0.9, 0.25, 1)';

  const H_DRAG_CLAMP = 220;
  const V_DRAG_CLAMP = 240;

  const isTabletOrBigger = () =>
    typeof window !== 'undefined' &&
    (window.matchMedia
      ? window.matchMedia('(min-width: 768px)').matches
      : window.innerWidth >= 768);

  // Reset styles and armed delete when opening/changing day (and cleanup timers)
  useEffect(() => {
    setSwipeStyle({});
    setPanelStyle({});
    gestureModeRef.current = 'none';
    setArmedRemove(null);
    clearArmedTimeout();
  }, [selectedDate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearArmedTimeout();
  }, []);

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
      transform: `translateX(${delta > 0 ? -22 : 22}px)`,
      opacity: 0.55,
      transition: `transform 140ms ${SNAP_EASE}, opacity 140ms ${SNAP_EASE}`,
    });
    setTimeout(() => {
      shiftSelectedDay(delta);
      setSwipeStyle({
        transform: `translateX(${delta > 0 ? 22 : -22}px)`,
        opacity: 0.55,
        transition: 'none',
      });
      requestAnimationFrame(() => {
        setSwipeStyle({
          transform: 'translateX(0)',
          opacity: 1,
          transition: `transform 160ms ${SNAP_EASE}, opacity 160ms ${SNAP_EASE}`,
        });
      });
    }, 140);
  };

  const animateCloseDown = () => {
    setPanelStyle({
      transform: 'translateY(160px)',
      opacity: 0,
      transition: `transform 170ms ${SNAP_EASE}, opacity 150ms ${SNAP_EASE}`,
    });
    setTimeout(() => {
      setSelectedDate(null);
      setPanelStyle({});
      setSwipeStyle({});
      gestureModeRef.current = 'none';
    }, 170);
  };

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

  // touch handlers: 1:1 drag + iOS-ish snap
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    swipeStartX.current = e.touches[0].clientX;
    swipeStartY.current = e.touches[0].clientY;
    swipeDX.current = 0;
    swipeDY.current = 0;
    gestureModeRef.current = 'none';
    setSwipeStyle({ transition: 'none' });
    setPanelStyle({ transition: 'none', transform: 'translateY(0)', opacity: 1 });
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (swipeStartX.current == null || swipeStartY.current == null) return;

    const dxRaw = e.touches[0].clientX - swipeStartX.current;
    const dyRaw = e.touches[0].clientY - swipeStartY.current;

    swipeDX.current = dxRaw;
    swipeDY.current = dyRaw;

    const absX = Math.abs(dxRaw);
    const absY = Math.abs(dyRaw);

    if (gestureModeRef.current === 'none') {
      if (isTabletOrBigger() && dyRaw > 0 && absY > absX * 1.2) {
        gestureModeRef.current = 'vertical';
      } else if (absX > absY) {
        gestureModeRef.current = 'horizontal';
      }
    }

    if (gestureModeRef.current === 'vertical') {
      const dy = clamp(Math.max(dyRaw, 0), 0, V_DRAG_CLAMP);
      const opacity = Math.max(0.75, 1 - dy / 640);
      setPanelStyle({
        transform: `translateY(${dy}px)`,
        opacity,
        transition: 'none',
      });
      setSwipeStyle({ transform: 'translateX(0)', transition: 'none' });
      return;
    }

    if (gestureModeRef.current === 'horizontal') {
      const dx = clamp(dxRaw, -H_DRAG_CLAMP, H_DRAG_CLAMP);
      setSwipeStyle({ transform: `translateX(${dx}px)`, transition: 'none' });
      return;
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

    if (gestureModeRef.current === 'vertical') {
      if (isTabletOrBigger() && dy >= VERTICAL_CLOSE_THRESHOLD) {
        animateCloseDown();
      } else {
        setPanelStyle({
          transform: 'translateY(0)',
          opacity: 1,
          transition: `transform 160ms ${SNAP_EASE}, opacity 140ms ${SNAP_EASE}`,
        });
        setTimeout(() => setPanelStyle({}), 160);
      }
      gestureModeRef.current = 'none';
      return;
    }

    if (gestureModeRef.current === 'horizontal') {
      if (Math.abs(dx) >= SWIPE_THRESHOLD) {
        animateShift(dx > 0 ? -1 : 1);
      } else {
        setSwipeStyle({
          transform: 'translateX(0)',
          transition: `transform 170ms ${SNAP_EASE}`,
        });
      }
      gestureModeRef.current = 'none';
      return;
    }

    setSwipeStyle({
      transform: 'translateX(0)',
      transition: `transform 160ms ${SNAP_EASE}`,
    });
    setPanelStyle({
      transform: 'translateY(0)',
      opacity: 1,
      transition: `transform 160ms ${SNAP_EASE}, opacity 160ms ${SNAP_EASE}`,
    });
    setTimeout(() => setPanelStyle({}), 160);
  };

  const matrix = useMemo(() => monthMatrix(viewYear, viewMonth), [viewYear, viewMonth]);

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
    clearArmedTimeout();

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
      setSavedPulse((p) => (p && p.day === day && p.time === time ? null : p));
    }, 900);

    setArmedRemove(null);
  };

  const confirmRemove = (day: string, time: string) => {
    clearArmedTimeout();
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

  // =============================================================================
  // Year Modal gestures (1:1 drag)
  // =============================================================================
  const yearStartX = useRef<number | null>(null);
  const yearStartY = useRef<number | null>(null);
  const yearDX = useRef<number>(0);
  const yearDY = useRef<number>(0);
  const yearModeRef = useRef<'none' | 'horizontal' | 'vertical'>('none');
  const [yearStyle, setYearStyle] = useState<React.CSSProperties>({});

  const YEAR_SWIPE_THRESHOLD = 70;
  const YEAR_CLOSE_THRESHOLD = 95;
  const YEAR_H_CLAMP = 220;
  const YEAR_V_CLAMP = 240;

  useEffect(() => {
    if (!showYear) return;
    setYearStyle({});
    yearModeRef.current = 'none';
    yearStartX.current = null;
    yearStartY.current = null;
    yearDX.current = 0;
    yearDY.current = 0;
  }, [showYear, viewYear]);

  const animateYearShift = (deltaYear: number) => {
    setYearStyle({
      transform: `translateX(${deltaYear > 0 ? -22 : 22}px)`,
      opacity: 0.55,
      transition: `transform 140ms ${SNAP_EASE}, opacity 140ms ${SNAP_EASE}`,
    });
    setTimeout(() => {
      setViewYear((y) => y + deltaYear);
      setYearStyle({
        transform: `translateX(${deltaYear > 0 ? 22 : -22}px)`,
        opacity: 0.55,
        transition: 'none',
      });
      requestAnimationFrame(() => {
        setYearStyle({
          transform: 'translateX(0)',
          opacity: 1,
          transition: `transform 160ms ${SNAP_EASE}, opacity 160ms ${SNAP_EASE}`,
        });
      });
    }, 140);
  };

  const animateYearCloseDown = () => {
    setYearStyle({
      transform: 'translateY(160px)',
      opacity: 0,
      transition: `transform 170ms ${SNAP_EASE}, opacity 150ms ${SNAP_EASE}`,
    });
    setTimeout(() => {
      setShowYear(false);
      setYearStyle({});
      yearModeRef.current = 'none';
    }, 170);
  };

  const onYearTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    yearStartX.current = e.touches[0].clientX;
    yearStartY.current = e.touches[0].clientY;
    yearDX.current = 0;
    yearDY.current = 0;
    yearModeRef.current = 'none';
    setYearStyle({ transition: 'none' });
  };

  const onYearTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (yearStartX.current == null || yearStartY.current == null) return;

    const dxRaw = e.touches[0].clientX - yearStartX.current;
    const dyRaw = e.touches[0].clientY - yearStartY.current;

    yearDX.current = dxRaw;
    yearDY.current = dyRaw;

    const absX = Math.abs(dxRaw);
    const absY = Math.abs(dyRaw);

    if (yearModeRef.current === 'none') {
      if (dyRaw > 0 && absY > absX * 1.2) {
        yearModeRef.current = 'vertical';
      } else if (absX > absY) {
        yearModeRef.current = 'horizontal';
      }
    }

    if (yearModeRef.current === 'vertical') {
      const dy = clamp(Math.max(dyRaw, 0), 0, YEAR_V_CLAMP);
      const opacity = Math.max(0.75, 1 - dy / 640);
      setYearStyle({
        transform: `translateY(${dy}px)`,
        opacity,
        transition: 'none',
      });
      return;
    }

    if (yearModeRef.current === 'horizontal') {
      const dx = clamp(dxRaw, -YEAR_H_CLAMP, YEAR_H_CLAMP);
      setYearStyle({
        transform: `translateX(${dx}px)`,
        transition: 'none',
      });
      return;
    }
  };

  const onYearTouchEnd = () => {
    if (yearStartX.current == null) return;

    const dx = yearDX.current;
    const dy = yearDY.current;

    yearStartX.current = null;
    yearStartY.current = null;
    yearDX.current = 0;
    yearDY.current = 0;

    if (yearModeRef.current === 'vertical') {
      if (dy >= YEAR_CLOSE_THRESHOLD) {
        animateYearCloseDown();
      } else {
        setYearStyle({
          transform: 'translateY(0)',
          opacity: 1,
          transition: `transform 160ms ${SNAP_EASE}, opacity 140ms ${SNAP_EASE}`,
        });
        setTimeout(() => setYearStyle({}), 160);
      }
      yearModeRef.current = 'none';
      return;
    }

    if (yearModeRef.current === 'horizontal') {
      if (Math.abs(dx) >= YEAR_SWIPE_THRESHOLD) {
        animateYearShift(dx > 0 ? -1 : 1);
      } else {
        setYearStyle({
          transform: 'translateX(0)',
          transition: `transform 170ms ${SNAP_EASE}`,
        });
      }
      yearModeRef.current = 'none';
      return;
    }

    setYearStyle({
      transform: 'translateX(0)',
      transition: `transform 160ms ${SNAP_EASE}`,
    });
    yearModeRef.current = 'none';
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
              syncFromRemote(); // manual refresh
            }}
          />

          <button
            onClick={() => setShowYear(true)}
            className="text-3xl sm:text-4xl md:text-7xl font-bold cursor-pointer hover:text-gray-300 select-none text-right flex-1 min-w-0 whitespace-nowrap"
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
          onTouchStart={() => setShowYear(false)}
        >
          <div
            className="w-[min(100%-32px,820px)] max-w-xl rounded-3xl border border-neutral-800 bg-neutral-950/95 shadow-2xl px-6 py-6 sm:px-8 sm:py-8"
            style={yearStyle}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              e.stopPropagation();
              onYearTouchStart(e);
            }}
            onTouchMove={onYearTouchMove}
            onTouchEnd={onYearTouchEnd}
          >
            <div className="flex items-center justify-center">
              <div
                className="text-[clamp(30px,6vw,44px)] leading-none select-none"
                style={{ fontFamily: BRAND.fontTitle }}
              >
                {viewYear}
              </div>
            </div>

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
            style={panelStyle}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div className="flex h-full flex-col">
              {/* Header (NO X button now) */}
              <div className="flex items-center justify-between">
                <h3
                  className="text-2xl md:text-3xl font-bold"
                  style={{ fontFamily: BRAND.fontTitle }}
                >
                  {WEEKDAYS_FULL[(selectedDate.getDay() + 6) % 7]}{' '}
                  {selectedDate.getDate()} {MONTHS[selectedDate.getMonth()]}{' '}
                  {selectedDate.getFullYear()}
                </h3>

                {/* (removed close button) */}
                <div className="w-10 md:w-12" />
              </div>

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
                      const isSaved =
                        !!(
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
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.16)_0,_transparent_55%),radial-gradient(circle_at_bottom,_rgba(255,255,255,0.12)_0,_transparent_55%)]" />

        <div className="relative w-[min(100%-40px,420px)] rounded-[32px] border border-white/10 bg-[rgba(8,8,8,0.9)] backdrop-blur-xl px-7 py-8 shadow-[0_24px_80px_rgba(0,0,0,0.9)]">
          <div className="mb-4 flex justify-center">
            <span
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-neutral-300"
              style={{ fontFamily: BRAND.fontBody }}
            >
              Admin Access
            </span>
          </div>

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
