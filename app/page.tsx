'use client';
// Bushi Admin — Month grid + Day editor (Native Scroll Snap Fix) + Search + Closest available
// FIX: iOS fast-swipe blank/half-render bug by shifting day ONLY after scroll settles (debounced "scroll end"),
//      plus shift lock + remount key + reset vertical scroll.
// FIX v2: Pre-mount Prev/Next days to fix "12:00 cutoff" rendering issue.
// FIX v3: Force GPU Layer + Direct ID Scroll Reset for iOS painting optimization.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

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

const PIN_CODE = '2580'; // Change this to your own code

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

function injectBushiStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('bushi-styles')) return;

  const style = document.createElement('style');
  style.id = 'bushi-styles';
  style.textContent = `
    @keyframes bushiBarMove {
      0% { background-position: 0 0; }
      100% { background-position: 36px 0; }
    }
    @keyframes bushiPulse {
      0% { transform: scale(1); opacity: 1; }
      100% { transform: scale(1.02); opacity: 0.88; }
    }
    /* Hide scrollbar for Chrome, Safari and Opera */
    .no-scrollbar::-webkit-scrollbar {
      display: none;
    }
    /* Hide scrollbar for IE, Edge and Firefox */
    .no-scrollbar {
      -ms-overflow-style: none; /* IE and Edge */
      scrollbar-width: none; /* Firefox */
    }
    
    /* FIX: Force GPU Acceleration for Day Columns */
    .ios-gpu-layer {
      transform: translateZ(0);
      will-change: transform;
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
      perspective: 1000;
      -webkit-perspective: 1000;
    }
  `;
  document.head.appendChild(style);
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

function isTypingTarget(el: Element | null) {
  if (!el) return false;
  const tag = (el as HTMLElement).tagName?.toLowerCase();
  if (!tag) return false;
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  const ce = (el as HTMLElement).getAttribute?.('contenteditable');
  return ce === '' || ce === 'true';
}

const slotInputId = (dayISO: string, time: string) =>
  `slot_${dayISO.replace(/[^0-9]/g, '')}_${time.replace(/[^0-9]/g, '')}`;

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
const END_HOUR = 22; // last slot 21:30
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

const isDayFull = (dayISO: string, store: Store) => {
  const day = store[dayISO];
  if (!day) return false;
  for (const slot of DAY_SLOTS) {
    const v = day[slot];
    if (!v || (v || '').trim().length === 0) return false;
  }
  return true;
};

const dayFillRatio = (dayISO: string, store: Store) => {
  const day = store[dayISO];
  if (!day) return 0;
  let filled = 0;
  for (const slot of DAY_SLOTS) {
    const v = day[slot];
    if (v && v.trim().length > 0) filled++;
  }
  return filled / DAY_SLOTS.length;
};

// =============================================================================
// Remote Sync (Supabase via API route)
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

async function patchSetSlot(day: string, time: string, name: string): Promise<boolean> {
  try {
    const res = await fetch(API_ENDPOINT, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'set', day, time, name }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function patchClearSlot(day: string, time: string): Promise<boolean> {
  try {
    const res = await fetch(API_ENDPOINT, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'clear', day, time }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// =============================================================================
// Local backup (safety net)
// =============================================================================
const BACKUP_KEY = 'bushi_store_backup_v1';
function saveBackup(store: Store) {
  try {
    const payload = { ts: Date.now(), data: store };
    localStorage.setItem(BACKUP_KEY, JSON.stringify(payload));
  } catch {}
}

// =============================================================================
// Memoized slot row
// =============================================================================
type SlotRowProps = {
  dayISO: string;
  time: string;
  value: string;
  isSaved: boolean;
  isArmed: boolean;
  isHighlighted: boolean;
  canWrite: boolean;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onSave: (day: string, time: string, nameRaw: string) => void;
  onArm: (timeKey: string) => void;
  onConfirmRemove: (day: string, time: string) => void;
  onRevealFocus: (day: string, time: string, inputEl: HTMLInputElement) => void;
};

const SlotRow = React.memo(
  function SlotRow({
    dayISO,
    time,
    value,
    isSaved,
    isArmed,
    isHighlighted,
    canWrite,
    onStartEditing,
    onStopEditing,
    onSave,
    onArm,
    onConfirmRemove,
    onRevealFocus,
  }: SlotRowProps) {
    const hasName = (value || '').trim().length > 0;
    const timeKey = `${dayISO}_${time}`;
    const inputId = slotInputId(dayISO, time);

    return (
      <div
        className={`relative rounded-2xl bg-neutral-900/80 border px-3 py-1 flex items-center gap-3 overflow-hidden transition ${
          isHighlighted ? 'border-white/60 ring-2 ring-white/20' : 'border-neutral-800'
        }`}
        style={isHighlighted ? { animation: 'bushiPulse 220ms ease-in-out infinite alternate' } : undefined}
      >
        <div
          className="text-[1.05rem] md:text-[1.15rem] font-semibold tabular-nums min-w-[4.9rem] text-center select-none"
          style={{ fontFamily: BRAND.fontBody }}
        >
          {time}
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <input
            id={inputId}
            key={timeKey + value}
            defaultValue={value}
            onFocus={(e) => {
              e.currentTarget.dataset.orig = e.currentTarget.value;
              onStartEditing();
              onRevealFocus(dayISO, time, e.currentTarget);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const el = e.target as HTMLInputElement;
                const v = el.value;
                el.dataset.orig = v;
                if (canWrite) onSave(dayISO, time, v);
                el.blur();
              }
            }}
            onBlur={(e) => {
              const el = e.currentTarget;
              const orig = (el.dataset.orig ?? '').trim();
              const now = (el.value ?? '').trim();

              window.setTimeout(onStopEditing, 120);
              if (!canWrite) return;
              if (orig === now) return;

              el.dataset.orig = el.value;
              onSave(dayISO, time, el.value);
            }}
            className="block w-full text-white bg-[rgb(10,10,10)] border border-neutral-700/70 focus:border-white/70 focus:outline-none focus:ring-0 rounded-lg px-3 py-1.5 text-center transition-all duration-200"
            style={{ fontFamily: BRAND.fontBody }}
          />

          {hasName && (
            <button
              onClick={() => (isArmed ? onConfirmRemove(dayISO, time) : onArm(timeKey))}
              className={`shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-lg grid place-items-center transition border ${
                isArmed
                  ? 'bg-red-900/30 border-red-600/70'
                  : 'bg-neutral-900/60 hover:bg-neutral-800/70 border-neutral-700/50'
              }`}
              aria-label={isArmed ? 'Потвърди' : 'Премахни'}
              title={isArmed ? 'Потвърди' : 'Премахни'}
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
  },
  (prev, next) =>
    prev.value === next.value &&
    prev.isSaved === next.isSaved &&
    prev.isArmed === next.isArmed &&
    prev.isHighlighted === next.isHighlighted &&
    prev.dayISO === next.dayISO &&
    prev.time === next.time &&
    prev.canWrite === next.canWrite,
);

// =============================================================================
// Main Calendar Component
// =============================================================================
function BarberCalendarCore() {
  useEffect(() => {
    injectBrandFonts();
    injectBushiStyles();
  }, []);

  const today = new Date();
  const todayISO = toISODate(today);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [showYear, setShowYear] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [showSearch, setShowSearch] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [showAvail, setShowAvail] = useState(false);
  const [highlight, setHighlight] = useState<{ day: string; time: string; ts: number } | null>(null);
  const [pendingFocus, setPendingFocus] = useState<{ day: string; time: string; ts: number } | null>(null);

  const [store, setStore] = useState<Store>({});
  const [remoteReady, setRemoteReady] = useState(false);

  // Keyboard inset for iPhone typing visibility
  const [keyboardInset, setKeyboardInset] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = (window as any).visualViewport as VisualViewport | undefined;
    if (!vv) return;

    const computeInset = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setKeyboardInset(inset > 0 ? inset + 12 : 0);
    };

    computeInset();
    vv.addEventListener('resize', computeInset);
    vv.addEventListener('scroll', computeInset);

    return () => {
      vv.removeEventListener('resize', computeInset);
      vv.removeEventListener('scroll', computeInset);
    };
  }, []);

  const editingRef = useRef(false);
  const pendingRemoteRef = useRef<Store | null>(null);

  const cancelledSyncRef = useRef(false);
  const syncingRef = useRef(false);
  const swallowNextClickRef = useRef(false);
  const swallowNextClick = useCallback(() => {
    swallowNextClickRef.current = true;
    window.setTimeout(() => {
      swallowNextClickRef.current = false;
    }, 450);
  }, []);

  const applyRemoteSafely = useCallback((remote: Store) => {
    saveBackup(remote);
    if (editingRef.current) {
      pendingRemoteRef.current = remote;
      return;
    }
    pendingRemoteRef.current = null;
    setStore(remote);
  }, []);

  const syncFromRemote = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const remote = await fetchRemoteStore();
      if (!remote || cancelledSyncRef.current) return;
      setRemoteReady(true);
      applyRemoteSafely(remote);
    } finally {
      syncingRef.current = false;
    }
  }, [applyRemoteSafely]);

  const isSlotInputFocused = useCallback(() => {
    if (typeof document === 'undefined') return false;
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const id = (el as any).id as string | undefined;
    return typeof id === 'string' && id.startsWith('slot_');
  }, []);

  useEffect(() => {
    cancelledSyncRef.current = false;
    let interval: number | null = null;

    (async () => {
      await syncFromRemote();
      interval = window.setInterval(syncFromRemote, 60000);
    })();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') syncFromRemote();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelledSyncRef.current = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      if (interval != null) window.clearInterval(interval);
    };
  }, [syncFromRemote, isSlotInputFocused]);

  const startEditing = useCallback(() => {
    editingRef.current = true;
  }, []);

  const stopEditing = useCallback(() => {
    if (pendingRemoteRef.current) {
      pendingRemoteRef.current = null;
      window.setTimeout(() => {
        syncFromRemote();
      }, 900);
    }
    window.setTimeout(() => {
      editingRef.current = isSlotInputFocused();
    }, 0);
  }, [syncFromRemote, isSlotInputFocused]);

  const revealFocus = useCallback((day: string, time: string, inputEl: HTMLInputElement) => {
    window.setTimeout(() => {
      try { inputEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
      window.setTimeout(() => {
        try { inputEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
      }, 140);
    }, 60);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    if (showYear || selectedDate || showSearch || showAvail) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showYear, selectedDate, showSearch, showAvail]);

  // Keys
  useEffect(() => {
    if (!showSearch) return;
    const t = window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 40);
    return () => window.clearTimeout(t);
  }, [showSearch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSearch) setShowSearch(false);
        if (showYear) setShowYear(false);
        if (showAvail) setShowAvail(false);
        return;
      }
      const activeTyping = isTypingTarget(document.activeElement);
      if (activeTyping) return;

      const isCtrlK = (e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K');
      const isSlash = e.key === '/';
      if (isCtrlK || isSlash) {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSearch, showYear, showAvail]);

  // Armed remove
  const [armedRemove, setArmedRemove] = useState<string | null>(null);
  const armedTimeoutRef = useRef<number | null>(null);

  const clearArmedTimeout = useCallback(() => {
    if (armedTimeoutRef.current != null) {
      window.clearTimeout(armedTimeoutRef.current);
      armedTimeoutRef.current = null;
    }
  }, []);

  const armRemove = useCallback(
    (timeKey: string) => {
      clearArmedTimeout();
      setArmedRemove(timeKey);
      armedTimeoutRef.current = window.setTimeout(() => {
        setArmedRemove((cur) => (cur === timeKey ? null : cur));
        armedTimeoutRef.current = null;
      }, 3500);
    },
    [clearArmedTimeout],
  );

  const [savedPulse, setSavedPulse] = useState<{ day: string; time: string; ts: number } | null>(null);

  const SNAP_EASE = 'cubic-bezier(0.25, 0.9, 0.25, 1)';
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  // ===========================================================================
  // NATIVE SCROLL SNAP LOGIC (Day Swipe) — FIXED FOR iOS FAST SWIPES
  // ===========================================================================
  const dayScrollerRef = useRef<HTMLDivElement>(null);
  const dayContentRef = useRef<HTMLDivElement>(null);

  // lock + debounce timers
  const isShiftingRef = useRef(false);
  const scrollEndTimerRef = useRef<number | null>(null);
  const lastShiftAtRef = useRef<number>(0);

  const clearScrollEndTimer = useCallback(() => {
    if (scrollEndTimerRef.current != null) {
      window.clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = null;
    }
  }, []);

  const centerDayScroller = useCallback((behavior: 'auto' | 'smooth' = 'auto') => {
    const el = dayScrollerRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    if (!w) return;
    if (behavior === 'smooth') el.scrollTo({ left: w, behavior: 'smooth' });
    else el.scrollLeft = w;
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

  const commitShiftDay = useCallback(
    (delta: number) => {
      const el = dayScrollerRef.current;
      if (!el) return;

      const w = el.offsetWidth;
      if (!w) return;

      const now = Date.now();
      // hard guard: prevents "skips 2 days" on fast double swipes
      if (now - lastShiftAtRef.current < 260) {
        centerDayScroller('auto');
        return;
      }

      lastShiftAtRef.current = now;
      isShiftingRef.current = true;

      // stop any remaining momentum & prevent extra edge triggers
      (el.style as any).scrollSnapType = 'none';
      el.scrollLeft = w;

      // force a reflow (helps iOS repaint issues)
      (el as any).offsetHeight;

      requestAnimationFrame(() => {
        const cur = dayScrollerRef.current;
        if (!cur) return;
        (cur.style as any).scrollSnapType = '';
      });

      shiftSelectedDay(delta);

      window.setTimeout(() => {
        isShiftingRef.current = false;
      }, 520);
    },
    [centerDayScroller, viewMonth, viewYear],
  );

  const handleDayScrollEnd = useCallback(() => {
    const el = dayScrollerRef.current;
    if (!el) return;
    if (isShiftingRef.current) return;

    const w = el.offsetWidth;
    if (!w) return;

    const sl = el.scrollLeft;
    const EDGE = 2;

    if (sl <= EDGE) {
      commitShiftDay(-1);
      return;
    }
    if (sl >= w * 2 - EDGE) {
      commitShiftDay(+1);
      return;
    }

    if (Math.abs(sl - w) > EDGE) {
      centerDayScroller('smooth');
    }
  }, [centerDayScroller, commitShiftDay]);

  const onDayScroll = useCallback(() => {
    if (isShiftingRef.current) return;

    clearScrollEndTimer();
    scrollEndTimerRef.current = window.setTimeout(() => {
      scrollEndTimerRef.current = null;
      handleDayScrollEnd();
    }, 90);
  }, [clearScrollEndTimer, handleDayScrollEnd]);

  const selectedDayISO = useMemo(() => (selectedDate ? toISODate(selectedDate) : null), [selectedDate]);
  
  useLayoutEffect(() => {
    if (!selectedDate || !selectedDayISO) return;

    clearScrollEndTimer();

    requestAnimationFrame(() => {
      centerDayScroller('auto');

      // FIX: Use Direct ID Selector for Scroll Reset to bypass Ref latency
      const containerId = `day-scroll-container-${selectedDayISO}`;
      const container = document.getElementById(containerId);
      if (container) {
        container.scrollTop = 0;
        // force reflow for iOS repaint
        (container as any).offsetHeight;
      }

      requestAnimationFrame(() => {
        isShiftingRef.current = false;
      });
    });
  }, [selectedDayISO, selectedDate, centerDayScroller, clearScrollEndTimer]);

  useEffect(() => {
    setPanelStyle({});
    setArmedRemove(null);
    clearArmedTimeout();
  }, [selectedDate, clearArmedTimeout]);

  useEffect(() => () => clearArmedTimeout(), [clearArmedTimeout]);

  const animateCloseDown = () => {
    setPanelStyle({
      transform: 'translateY(160px)',
      opacity: 0,
      transition: `transform 170ms ${SNAP_EASE}, opacity 150ms ${SNAP_EASE}`,
    });
    setTimeout(() => {
      setSelectedDate(null);
      setPanelStyle({});
      setPendingFocus(null);
    }, 170);
  };

  // SAVE / DELETE
  const saveName = useCallback(
    (day: string, time: string, nameRaw: string) => {
      if (!remoteReady) return;
      const name = nameRaw.trim();
      clearArmedTimeout();

      setStore((prev) => {
        const next: Store = { ...prev };
        if (!next[day]) next[day] = {};

        if (name === '') {
          if (next[day]) delete next[day][time];
          if (next[day] && Object.keys(next[day]).length === 0) delete next[day];
        } else {
          next[day][time] = name;
        }

        saveBackup(next);
        return next;
      });

      if (name === '') patchClearSlot(day, time);
      else patchSetSlot(day, time, name);

      setSavedPulse({ day, time, ts: Date.now() });
      setTimeout(() => {
        setSavedPulse((p) => (p && p.day === day && p.time === time ? null : p));
      }, 900);

      setArmedRemove(null);
    },
    [clearArmedTimeout, remoteReady],
  );

  const confirmRemove = useCallback(
    (day: string, time: string) => {
      if (!remoteReady) return;
      clearArmedTimeout();

      setStore((prev) => {
        const next: Store = { ...prev };
        if (next[day]) {
          delete next[day][time];
          if (Object.keys(next[day]).length === 0) delete next[day];
        }
        saveBackup(next);
        return next;
      });

      patchClearSlot(day, time);
      setArmedRemove(null);
    },
    [clearArmedTimeout, remoteReady],
  );

  const selectedDayMap = useMemo(() => {
    if (!selectedDayISO) return {};
    return store[selectedDayISO] || {};
  }, [store, selectedDayISO]);

  useEffect(() => {
    if (!selectedDate) return;
    syncFromRemote();
    const t = window.setTimeout(() => syncFromRemote(), 900);
    return () => window.clearTimeout(t);
  }, [selectedDate, syncFromRemote]);

  useEffect(() => {
    if (!highlight) return;
    const t = window.setTimeout(() => setHighlight(null), 1400);
    return () => window.clearTimeout(t);
  }, [highlight]);

  useEffect(() => {
    if (!pendingFocus || !selectedDayISO) return;
    if (pendingFocus.day !== selectedDayISO) return;

    const id = slotInputId(pendingFocus.day, pendingFocus.time);
    const t = window.setTimeout(() => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) {
        try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
        el.focus();
        el.select();
      }
      setPendingFocus(null);
    }, 120);

    return () => window.clearTimeout(t);
  }, [pendingFocus, selectedDayISO]);

  const matrix = useMemo(() => monthMatrix(viewYear, viewMonth), [viewYear, viewMonth]);

  const openDay = (d: Date) => {
    if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) {
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
    setSelectedDate(d);
  };

  // Closest available
  type AvailHit = { dayISO: string; time: string };
  const closestAvail: AvailHit[] = useMemo(() => {
    const COUNT = 18;
    const MAX_DAYS = 120;
    const out: AvailHit[] = [];

    let cur = new Date(`${todayISO}T00:00:00`);
    for (let i = 0; i < MAX_DAYS && out.length < COUNT; i++) {
      const dayISO = toISODate(cur);
      const dayMap = store[dayISO] || {};

      for (const slot of DAY_SLOTS) {
        const v = (dayMap as Record<string, string>)[slot];
        if (!v || v.trim().length === 0) {
          out.push({ dayISO, time: slot });
          if (out.length >= COUNT) break;
        }
      }
      cur = addDays(cur, 1);
    }
    return out;
  }, [store, todayISO]);

  const closestGrouped = useMemo(() => {
    const m = new Map<string, AvailHit[]>();
    for (const h of closestAvail) {
      if (!m.has(h.dayISO)) m.set(h.dayISO, []);
      m.get(h.dayISO)!.push(h);
    }
    return Array.from(m.entries()).map(([dayISO, list]) => ({ dayISO, list }));
  }, [closestAvail]);

  const formatDayLabel = (dayISOKey: string) => {
    const d = new Date(`${dayISOKey}T00:00:00`);
    const weekday = WEEKDAYS_FULL[(d.getDay() + 6) % 7];
    const day = d.getDate();
    const month = MONTHS[d.getMonth()];
    const year = d.getFullYear();
    return `${weekday} ${day} ${month} ${year}`;
  };

  const openFromAvailability = (dayISOKey: string, time: string) => {
    const d = new Date(`${dayISOKey}T00:00:00`);
    setShowAvail(false);
    openDay(d);
    setHighlight({ day: dayISOKey, time, ts: Date.now() });
    setPendingFocus({ day: dayISOKey, time, ts: Date.now() });
  };

  // Search
  type Hit = { dayISO: string; time: string; name: string };
  const hits: Hit[] = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return [];
    const out: Hit[] = [];
    for (const [dayISOKey, dayMap] of Object.entries(store)) {
      if (dayISOKey < todayISO) continue;
      for (const [time, name] of Object.entries(dayMap || {})) {
        const n = (name || '').trim();
        if (!n) continue;
        if (n.toLowerCase().includes(q)) out.push({ dayISO: dayISOKey, time, name: n });
      }
    }
    out.sort((a, b) => (a.dayISO === b.dayISO ? a.time.localeCompare(b.time) : a.dayISO.localeCompare(b.dayISO)));
    return out;
  }, [store, searchQ, todayISO]);

  const groupedHits = useMemo(() => {
    const groups = new Map<string, Hit[]>();
    for (const h of hits) {
      if (!groups.has(h.dayISO)) groups.set(h.dayISO, []);
      groups.get(h.dayISO)!.push(h);
    }
    return Array.from(groups.entries()).map(([dayISO, list]) => ({ dayISO, list }));
  }, [hits]);

  const openFromSearch = (dayISOKey: string, time: string) => {
    const d = new Date(`${dayISOKey}T00:00:00`);
    setShowSearch(false);
    setSearchQ('');
    openDay(d);
    setHighlight({ day: dayISOKey, time, ts: Date.now() });
  };

  // Weekend buttons
  const weekendBtnClass =
    'w-14 md:w-16 h-10 md:h-11 rounded-2xl border border-neutral-700/70 bg-neutral-900/65 hover:bg-neutral-800/75 transition grid place-items-center shadow-[0_14px_40px_rgba(0,0,0,0.75)]';
  const weekendEmojiClass = 'text-[18px] md:text-[20px] leading-none';

  // Month gestures (preserved)
  const monthStartX = useRef<number | null>(null);
  const monthStartY = useRef<number | null>(null);
  const monthDX = useRef<number>(0);
  const monthDY = useRef<number>(0);
  const monthModeRef = useRef<'none' | 'horizontal'>('none');
  const [monthStyle, setMonthStyle] = useState<React.CSSProperties>({});
  const monthBlockClickRef = useRef(false);

  const MONTH_SWIPE_THRESHOLD = 70;
  const MONTH_H_CLAMP = 260;

  useEffect(() => {
    setMonthStyle({});
    monthModeRef.current = 'none';
    monthStartX.current = null;
    monthStartY.current = null;
    monthDX.current = 0;
    monthDY.current = 0;
    monthBlockClickRef.current = false;
  }, [viewMonth, viewYear]);

  const shiftMonthView = (delta: number) => {
    const total = viewYear * 12 + viewMonth + delta;
    const newYear = Math.floor(total / 12);
    const newMonth = ((total % 12) + 12) % 12;
    setViewYear(newYear);
    setViewMonth(newMonth);
  };

  const animateMonthShift = (delta: number) => {
    setMonthStyle({
      transform: `translateX(${delta > 0 ? -22 : 22}px)`,
      opacity: 0.55,
      transition: `transform 140ms ${SNAP_EASE}, opacity 140ms ${SNAP_EASE}`,
    });
    setTimeout(() => {
      shiftMonthView(delta);
      setMonthStyle({
        transform: `translateX(${delta > 0 ? 22 : -22}px)`,
        opacity: 0.55,
        transition: 'none',
      });
      requestAnimationFrame(() => {
        setMonthStyle({
          transform: 'translateX(0)',
          opacity: 1,
          transition: `transform 160ms ${SNAP_EASE}, opacity 160ms ${SNAP_EASE}`,
        });
      });
    }, 140);
  };

  const onMonthTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (showYear || selectedDate || showSearch || showAvail) return;
    monthStartX.current = e.touches[0].clientX;
    monthStartY.current = e.touches[0].clientY;
    monthDX.current = 0;
    monthDY.current = 0;
    monthModeRef.current = 'none';
    monthBlockClickRef.current = false;
    setMonthStyle({ transition: 'none' });
  };

  const onMonthTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (monthStartX.current == null || monthStartY.current == null) return;
    const dxRaw = e.touches[0].clientX - monthStartX.current;
    const dyRaw = e.touches[0].clientY - monthStartY.current;
    monthDX.current = dxRaw;
    monthDY.current = dyRaw;

    if (monthModeRef.current === 'none') {
      if (Math.abs(dxRaw) > 12 && Math.abs(dxRaw) > Math.abs(dyRaw) * 1.15) {
        monthModeRef.current = 'horizontal';
        monthBlockClickRef.current = true;
      } else {
        return;
      }
    }
    if (monthModeRef.current === 'horizontal') {
      const dx = clamp(dxRaw, -MONTH_H_CLAMP, MONTH_H_CLAMP);
      setMonthStyle({ transform: `translateX(${dx}px)`, transition: 'none' });
    }
  };

  const onMonthTouchEnd = () => {
    if (monthStartX.current == null) return;
    const dx = monthDX.current;
    monthStartX.current = null;
    monthStartY.current = null;
    monthDX.current = 0;
    monthDY.current = 0;

    if (monthModeRef.current === 'horizontal') {
      if (Math.abs(dx) >= MONTH_SWIPE_THRESHOLD) {
        animateMonthShift(dx < 0 ? +1 : -1);
      } else {
        setMonthStyle({ transform: 'translateX(0)', transition: `transform 170ms ${SNAP_EASE}` });
      }
      window.setTimeout(() => {
        monthBlockClickRef.current = false;
      }, 220);
      monthModeRef.current = 'none';
      return;
    }
    monthModeRef.current = 'none';
    monthBlockClickRef.current = false;
  };

  // Helper to render a full day column
  const renderDayColumn = (date: Date, isCurrent: boolean) => {
    const iso = toISODate(date);
    const dayMap = store[iso] || {};
    const containerId = `day-scroll-container-${iso}`;

    return (
      <div
        key={iso}
        id={containerId}
        // Only attach the 'ref' to current day
        ref={isCurrent ? dayContentRef : undefined}
        className="w-full h-full flex-shrink-0 snap-center overflow-y-auto ios-gpu-layer"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain' as any,
          // FIX: Increase bottom padding so the browser paints past the 12:00 edge
          paddingBottom: keyboardInset ? `${keyboardInset + 200}px` : '240px',
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 px-0.5" style={{ gridAutoRows: 'min-content' }}>
          {DAY_SLOTS.map((time) => {
            const value = dayMap[time] || '';
            const isSaved = isCurrent && !!(savedPulse && savedPulse.day === iso && savedPulse.time === time);
            const timeKey = `${iso}_${time}`;
            const isArmed = armedRemove === timeKey;
            const isHighlighted = !!highlight && highlight.day === iso && highlight.time === time;
            return (
              <SlotRow
                key={timeKey}
                dayISO={iso}
                time={time}
                value={value}
                isSaved={isSaved}
                isArmed={isArmed}
                isHighlighted={isHighlighted}
                canWrite={remoteReady}
                onStartEditing={startEditing}
                onStopEditing={stopEditing}
                onSave={saveName}
                onArm={armRemove}
                onConfirmRemove={confirmRemove}
                onRevealFocus={revealFocus}
              />
            );
          })}
        </div>
        {!remoteReady && (
          <div className="mt-3 text-xs text-neutral-500 text-center" style={{ fontFamily: BRAND.fontBody }}>
            Зареждане от сървъра…
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 w-full h-dvh bg-black text-white overflow-hidden"
      onClickCapture={(e) => {
        if (!swallowNextClickRef.current) return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="max-w-screen-2xl mx-auto px-[clamp(12px,2.5vw,40px)] pt-[clamp(12px,2.5vw,40px)] pb-[clamp(8px,2vw,24px)] h-full flex flex-col select-none">
        <div className="flex flex-col md:flex-row items-center justify-center md:justify-between gap-1 md:gap-6">
          <img
            src={BRAND.logoLight}
            alt="logo"
            className="w-64 h-auto md:w-auto md:h-[22rem] object-contain cursor-pointer"
            onClick={() => {
              const now = new Date();
              setViewYear(now.getFullYear());
              setViewMonth(now.getMonth());
              syncFromRemote();
            }}
          />
          <button
            onClick={() => setShowYear(true)}
            className="text-[3.5rem] leading-none md:text-7xl font-bold cursor-pointer hover:text-gray-300 select-none text-center md:text-right whitespace-nowrap mt-[-10px] md:mt-0"
            style={{ fontFamily: BRAND.fontTitle }}
          >
            {`${MONTHS[viewMonth]} ${viewYear}`}
          </button>
        </div>

        <div className="mt-[clamp(12px,2.8vw,28px)] grid grid-cols-7 gap-[clamp(6px,1.2vw,16px)] text-center" style={{ fontFamily: BRAND.fontTitle }}>
          {WEEKDAYS_SHORT.map((d, idx) => {
            const isSat = idx === 5;
            const isSun = idx === 6;
            return (
              <div key={d} className="flex flex-col items-center gap-2">
                {isSat ? (
                  <button onClick={() => setShowAvail(true)} className={weekendBtnClass}>
                    <span className={weekendEmojiClass}>⏱️</span>
                  </button>
                ) : isSun ? (
                  <button onClick={() => setShowSearch(true)} className={weekendBtnClass}>
                    <span className={weekendEmojiClass}>🔍</span>
                  </button>
                ) : (
                  <div className="h-10 md:h-11" aria-hidden="true" />
                )}
                <div className="text-center font-extrabold text-gray-200 text-[clamp(14px,2.8vw,22px)]">{d}</div>
              </div>
            );
          })}
        </div>

        <div className="mt-[clamp(10px,2.2vw,20px)] flex-1 grid grid-cols-7 gap-[clamp(4px,2vw,16px)] overflow-visible pb-2" style={monthStyle} onTouchStart={onMonthTouchStart} onTouchMove={onMonthTouchMove} onTouchEnd={onMonthTouchEnd}>
          {matrix.map((row, ridx) => row.map((d, cidx) => {
            const isToday = toISODate(d) === todayISO;
            const isOtherMonth = d.getMonth() !== viewMonth;
            const dayISO = toISODate(d);
            const fill = dayFillRatio(dayISO, store);
            const isFull = isDayFull(dayISO, store);

            return (
              <div key={dayISO} onClick={() => !monthBlockClickRef.current && openDay(d)} className={`relative flex flex-col items-center justify-center aspect-square rounded-[clamp(10px,1.8vw,24px)] transition-all cursor-pointer active:scale-95 group overflow-hidden ${isOtherMonth ? 'opacity-20' : 'opacity-100'} ${isToday ? 'bg-white text-black' : 'bg-neutral-900/40 hover:bg-neutral-800/60'}`}>
                {fill > 0 && !isToday && (
                  <div className="absolute inset-0 pointer-events-none opacity-20 transition-opacity group-hover:opacity-30">
                    <div className="absolute inset-x-0 bottom-0 bg-white" style={{ height: `${fill * 100}%` }} />
                  </div>
                )}
                <div className={`text-[clamp(18px,3.8vw,42px)] font-bold z-10 ${isToday ? 'mt-0' : 'mt-[-2px]'}`} style={{ fontFamily: BRAND.fontNumbers }}>
                  {d.getDate()}
                </div>
                {isFull && !isToday && <div className="absolute top-1 right-1 w-1 h-1 bg-white/40 rounded-full" />}
              </div>
            );
          }))}
        </div>
      </div>

      {selectedDate && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm" style={{ opacity: panelStyle.opacity ?? 1, transition: panelStyle.transition }}>
          <div className="absolute inset-0" onClick={animateCloseDown} />
          <div className="relative w-full max-w-4xl mx-auto bg-[#0a0a0a] rounded-t-[40px] border-t border-white/10 flex flex-col max-h-[92dvh] shadow-[0_-20px_60px_rgba(0,0,0,0.8)]" style={panelStyle}>
            <div className="shrink-0 pt-4 pb-2 px-6 flex flex-col items-center" onTouchStart={(e) => { (e.currentTarget as any)._startY = e.touches[0].clientY; }} onTouchMove={(e) => { const dy = e.touches[0].clientY - (e.currentTarget as any)._startY; if (dy > 70) animateCloseDown(); }}>
              <div className="w-12 h-1 bg-white/10 rounded-full mb-5" />
              <div className="w-full flex items-center justify-between">
                <button onClick={() => shiftSelectedDay(-1)} className="p-3 -ml-2 text-neutral-400 active:text-white transition"><ArrowLeftIcon /></button>
                <h2 className="text-[2rem] leading-none font-bold tracking-tight text-center" style={{ fontFamily: BRAND.fontTitle }}>{formatDayLabel(selectedDayISO!)}</h2>
                <button onClick={() => shiftSelectedDay(1)} className="p-3 -mr-2 text-neutral-400 active:text-white transition"><ArrowRightIcon /></button>
              </div>
            </div>

            <div ref={dayScrollerRef} onScroll={onDayScroll} className="flex-1 overflow-x-auto no-scrollbar snap-x snap-mandatory flex">
              {renderDayColumn(addDays(selectedDate, -1), false)}
              {renderDayColumn(selectedDate, true)}
              {renderDayColumn(addDays(selectedDate, 1), false)}
            </div>
          </div>
        </div>
      )}

      {showSearch && <SearchModal store={store} onClose={() => setShowSearch(false)} onOpenHit={openFromSearch} inputRef={searchInputRef} searchQ={searchQ} setSearchQ={setSearchQ} groupedHits={groupedHits} formatDayLabel={formatDayLabel} />}
      {showAvail && <AvailabilityModal onClose={() => setShowAvail(false)} grouped={closestGrouped} formatDayLabel={formatDayLabel} onOpen={openFromAvailability} />}
      {showYear && <YearModal currentYear={viewYear} currentMonth={viewMonth} onSelect={(y, m) => { setViewYear(y); setViewMonth(m); setShowYear(false); }} onClose={() => setShowYear(false)} />}
    </div>
  );
}

// Icons / Sub-modals
function ArrowLeftIcon() { return <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>; }
function ArrowRightIcon() { return <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>; }

function SearchModal({ onClose, onOpenHit, inputRef, searchQ, setSearchQ, groupedHits, formatDayLabel }: any) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-xl p-6 flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-4xl font-bold" style={{ fontFamily: BRAND.fontTitle }}>Search Appointments</h2>
        <button onClick={onClose} className="p-2 text-neutral-400 hover:text-white transition"><CloseIcon /></button>
      </div>
      <div className="relative mb-8">
        <input ref={inputRef} type="text" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Type name..." className="w-full bg-neutral-900 border border-white/10 rounded-2xl px-6 py-4 text-xl focus:outline-none focus:border-white/40 transition" style={{ fontFamily: BRAND.fontBody }} />
      </div>
      <div className="flex-1 overflow-y-auto pr-2 no-scrollbar">
        {groupedHits.map((g: any) => (
          <div key={g.dayISO} className="mb-8">
            <h3 className="text-xl font-bold text-neutral-500 mb-4 sticky top-0 bg-black/10 py-2" style={{ fontFamily: BRAND.fontTitle }}>{formatDayLabel(g.dayISO)}</h3>
            <div className="grid grid-cols-1 gap-3">
              {g.list.map((h: any) => (
                <button key={h.dayISO + h.time} onClick={() => onOpenHit(h.dayISO, h.time)} className="flex items-center justify-between bg-neutral-900/50 border border-white/5 rounded-2xl px-5 py-4 hover:bg-neutral-800 transition text-left">
                  <span className="text-lg font-semibold w-20" style={{ fontFamily: BRAND.fontBody }}>{h.time}</span>
                  <span className="flex-1 truncate text-lg font-medium ml-4" style={{ fontFamily: BRAND.fontBody }}>{h.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AvailabilityModal({ onClose, grouped, formatDayLabel, onOpen }: any) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-xl p-6 flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-4xl font-bold" style={{ fontFamily: BRAND.fontTitle }}>Available Slots</h2>
        <button onClick={onClose} className="p-2 text-neutral-400 hover:text-white transition"><CloseIcon /></button>
      </div>
      <div className="flex-1 overflow-y-auto pr-2 no-scrollbar">
        {grouped.map((g: any) => (
          <div key={g.dayISO} className="mb-8">
            <h3 className="text-xl font-bold text-neutral-500 mb-4 sticky top-0 bg-black/10 py-2" style={{ fontFamily: BRAND.fontTitle }}>{formatDayLabel(g.dayISO)}</h3>
            <div className="flex flex-wrap gap-2.5">
              {g.list.map((h: any) => (
                <button key={h.dayISO + h.time} onClick={() => onOpen(h.dayISO, h.time)} className="bg-neutral-900/60 border border-white/10 rounded-xl px-4 py-2.5 hover:bg-white hover:text-black transition text-sm font-semibold tabular-nums" style={{ fontFamily: BRAND.fontBody }}>{h.time}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function YearModal({ currentYear, currentMonth, onSelect, onClose }: any) {
  const years = [currentYear, currentYear + 1];
  return (
    <div className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-2xl p-8 overflow-y-auto no-scrollbar">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-12">
          <h2 className="text-5xl font-bold" style={{ fontFamily: BRAND.fontTitle }}>Select Month</h2>
          <button onClick={onClose} className="p-3 text-neutral-400 hover:text-white transition"><CloseIcon /></button>
        </div>
        {years.map(y => (
          <div key={y} className="mb-16">
            <h3 className="text-7xl font-black text-white/10 mb-8 select-none" style={{ fontFamily: BRAND.fontTitle }}>{y}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {MONTHS.map((m, idx) => {
                const isSelected = y === currentYear && idx === currentMonth;
                return (
                  <button key={m} onClick={() => onSelect(y, idx)} className={`px-6 py-8 rounded-3xl text-2xl font-bold transition-all ${isSelected ? 'bg-white text-black' : 'bg-neutral-900/60 text-white hover:bg-neutral-800'}`} style={{ fontFamily: BRAND.fontTitle }}>{m}</button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CloseIcon() { return <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>; }

// =============================================================================
// Entry Point (Auth Wrapper)
// =============================================================================
export default function BarberCalendar() {
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bushi_auth');
      if (saved === 'true') setAuthed(true);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === PIN_CODE) {
      setAuthed(true);
      localStorage.setItem('bushi_auth', 'true');
    } else {
      setError(true);
      setPin('');
      setTimeout(() => setError(false), 2000);
    }
  };

  if (!authed) {
    return (
      <div className="fixed inset-0 bg-[#050505] flex items-center justify-center p-6 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(255,255,255,0.12)_0,_transparent_55%)]" />
        <div className="relative w-[min(100%-40px,420px)] rounded-[32px] border border-white/10 bg-[rgba(8,8,8,0.9)] backdrop-blur-xl px-7 py-8 shadow-[0_24px_80px_rgba(0,0,0,0.9)]">
          <div className="mb-4 flex justify-center">
             <img src="/bush.png" alt="Bushi logo" className="max-h-16 w-auto object-contain" />
          </div>
            <p className="text-xs text-neutral-400 text-center mb-6" style={{ fontFamily: BRAND.fontBody }}>Enter your PIN.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-2xl bg-neutral-900/80 border border-white/12 px-4 py-3 flex items-center focus-within:border-white/70 transition">
              <input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} maxLength={6} className="w-full bg-transparent border-none outline-none text-center text-lg tracking-[0.35em] placeholder:text-neutral-600" style={{ fontFamily: BRAND.fontBody }} placeholder="••••" />
            </div>
            {error && <div className="text-xs text-red-400 text-center animate-pulse">Incorrect PIN</div>}
          </form>
        </div>
      </div>
    );
  }

  return <BarberCalendarCore />;
}
