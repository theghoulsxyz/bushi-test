'use client';
// Bushi Admin — Month grid + Day editor (Native Scroll Snap Fix)
// FIX V6: Extracted DayColumn to a Memoized Component.
// FIX V7: Added translateZ(0) to fix iOS "cut off" rendering bug.
// FIX V8: Removed 'touch-action: pan-y' to restore Horizontal Swipe.
// FIX V9: Added "Double Layer Promotion" (translateZ on inner div) + minHeight% to force iOS Paint.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

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

const PIN_CODE = '2580';

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
    .no-scrollbar::-webkit-scrollbar {
      display: none;
    }
    .no-scrollbar {
      -ms-overflow-style: none;
      scrollbar-width: none;
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
// Constants
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
// Remote Sync
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

const BACKUP_KEY = 'bushi_store_backup_v1';

function saveBackup(store: Store) {
  try {
    const payload = { ts: Date.now(), data: store };
    localStorage.setItem(BACKUP_KEY, JSON.stringify(payload));
  } catch {}
}

// =============================================================================
// COMPONENTS: SlotRow & DayColumn
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

// Memoized Slot Row
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
    prev.canWrite === next.canWrite
);

// FIX V6: Extracted DayColumn Component
// FIX V7: Added translateZ(0) to fix iOS "cut off" bug (on outer)
// FIX V8: Removed 'touch-action: pan-y' to restore Swipe
// FIX V9: Added translateZ(0) to INNER div + minHeight to force paint
const DayColumn = React.memo(({ 
    date, 
    isCurrent, 
    dayData, 
    keyboardInset,
    remoteReady,
    savedPulse,
    armedRemove,
    highlight,
    // Callbacks
    startEditing,
    stopEditing,
    saveName,
    armRemove,
    confirmRemove,
    revealFocus
}: any) => {
    const iso = toISODate(date);
    const dayContentRef = useRef<HTMLDivElement>(null);
    
    // Auto-scroll to top only when this column becomes current
    useLayoutEffect(() => {
        if (isCurrent && dayContentRef.current) {
             dayContentRef.current.scrollTop = 0;
        }
    }, [isCurrent]);

    // 35px padding + keyboard inset
    const bottomPad = 35 + keyboardInset;

    return (
        <div
            id={isCurrent ? 'bushi-day-content' : undefined}
            ref={dayContentRef}
            className="w-full h-full flex-shrink-0 snap-center overflow-y-auto"
            style={{
                WebkitOverflowScrolling: 'touch',
                overscrollBehaviorY: 'contain' as any,
                overflowAnchor: 'none' as any,
                paddingBottom: `${bottomPad}px`,
                // iOS Safari can "stop painting" long overflow lists when the scroll container
                // (or its ancestors) are promoted to their own compositing layer.
                // Use containment/isolation instead of transform on the scroll container.
                contain: 'layout paint' as any,
                isolation: 'isolate' as any,
            }}
        >
            <div 
                className="w-full relative"
                style={{ 
                    // Promote a NON-scroll wrapper instead (more stable on iOS than promoting the scroll container)
                    WebkitTransform: 'translate3d(0,0,0)',
                    transform: 'translate3d(0,0,0)',
                    willChange: 'transform',
                }}
            >
                <div
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 px-0.5"
                    style={{ gridAutoRows: 'min-content' }}
                >
                    {DAY_SLOTS.map((time) => {
                        const value = dayData?.[time] || '';
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
        </div>
    );
}, (prev, next) => {
    return (
        prev.iso === next.iso &&
        prev.isCurrent === next.isCurrent &&
        prev.keyboardInset === next.keyboardInset &&
        prev.remoteReady === next.remoteReady &&
        prev.dayData === next.dayData && 
        prev.savedPulse === next.savedPulse &&
        prev.armedRemove === next.armedRemove &&
        prev.highlight === next.highlight
    );
});

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

  // Day swipe track style (translateX, iOS-safe)
  const [dayTrackStyle, setDayTrackStyle] = useState<React.CSSProperties>({ transform: 'translate3d(-100%,0,0)' });

  // ===========================================================================
  // iOS SAFE DAY SWIPE (TranslateX — no horizontal overflow / no scroll-snap)
  // ===========================================================================
  const dayHostRef = useRef<HTMLDivElement>(null);   // visible viewport inside the modal
  const dayWRef = useRef<number>(0);

  // lock + timing guard (prevents double swipes)
  const isShiftingRef = useRef(false);
  const lastShiftAtRef = useRef<number>(0);

  // touch tracking
  const dayStartX = useRef<number | null>(null);
  const dayStartY = useRef<number | null>(null);
  const dayDX = useRef<number>(0);
  const dayDY = useRef<number>(0);
  const dayModeRef = useRef<'none' | 'horizontal'>('none');

  const DAY_SWIPE_THRESHOLD = 70;
  const DAY_H_CLAMP = 260;

  const measureDayWidth = useCallback(() => {
    const host = dayHostRef.current;
    if (!host) return 0;
    const w = host.offsetWidth || 0;
    if (w) dayWRef.current = w;
    return w;
  }, []);

  const resetDayTrack = useCallback(() => {
    const w = measureDayWidth();
    if (!w) return;
    // Center panel = -w
    setDayTrackStyle({ transform: `translate3d(${-w}px,0,0)`, transition: 'none' });
  }, [measureDayWidth]);

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

  const commitDaySwipe = useCallback(
    (delta: number) => {
      const w = dayWRef.current || measureDayWidth();
      if (!w) return;

      const now = Date.now();
      if (now - lastShiftAtRef.current < 260) {
        // too fast → snap back
        setDayTrackStyle({ transform: `translate3d(${-w}px,0,0)`, transition: `transform 170ms ${SNAP_EASE}` });
        return;
      }

      lastShiftAtRef.current = now;
      isShiftingRef.current = true;

      const targetX = delta > 0 ? -2 * w : 0;

      setDayTrackStyle({ transform: `translate3d(${targetX}px,0,0)`, transition: `transform 170ms ${SNAP_EASE}` });

      window.setTimeout(() => {
        shiftSelectedDay(delta);
        // After state update, reset track instantly back to center position
        requestAnimationFrame(() => {
          const w2 = dayWRef.current || measureDayWidth() || w;
          dayWRef.current = w2;
          setDayTrackStyle({ transform: `translate3d(${-w2}px,0,0)`, transition: 'none' });
          isShiftingRef.current = false;
        });
      }, 170);
    },
    [measureDayWidth, viewMonth, viewYear],
  );

  const onDayTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isShiftingRef.current) return;
    if (isTypingTarget(e.target as any)) return;

    const t = e.touches[0];
    dayStartX.current = t.clientX;
    dayStartY.current = t.clientY;
    dayDX.current = 0;
    dayDY.current = 0;
    dayModeRef.current = 'none';

    // kill transition so drag feels 1:1
    setDayTrackStyle((cur) => ({ ...cur, transition: 'none' }));
  };

  const onDayTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (dayStartX.current == null || dayStartY.current == null) return;
    if (isShiftingRef.current) return;

    const t = e.touches[0];
    const dxRaw = t.clientX - dayStartX.current;
    const dyRaw = t.clientY - dayStartY.current;
    dayDX.current = dxRaw;
    dayDY.current = dyRaw;

    if (dayModeRef.current === 'none') {
      if (Math.abs(dxRaw) > 12 && Math.abs(dxRaw) > Math.abs(dyRaw) * 1.15) {
        dayModeRef.current = 'horizontal';
      } else {
        return; // let vertical scroll happen
      }
    }

    if (dayModeRef.current === 'horizontal') {
      // prevent vertical scroll while swiping days
      e.preventDefault();

      const w = dayWRef.current || measureDayWidth();
      if (!w) return;

      const clampPx = Math.min(DAY_H_CLAMP, Math.round(w * 0.45));
      const dx = clamp(dxRaw, -clampPx, clampPx);

      // Center is -w
      setDayTrackStyle({ transform: `translate3d(${-w + dx}px,0,0)`, transition: 'none' });
    }
  };

  const onDayTouchEnd = () => {
    const dx = dayDX.current;
    dayStartX.current = null;
    dayStartY.current = null;
    dayDX.current = 0;
    dayDY.current = 0;

    const w = dayWRef.current || measureDayWidth();
    if (!w) {
      dayModeRef.current = 'none';
      return;
    }

    if (dayModeRef.current === 'horizontal') {
      if (Math.abs(dx) >= DAY_SWIPE_THRESHOLD) {
        // dx < 0 => next day, dx > 0 => prev day
        commitDaySwipe(dx < 0 ? +1 : -1);
      } else {
        // snap back
        setDayTrackStyle({ transform: `translate3d(${-w}px,0,0)`, transition: `transform 170ms ${SNAP_EASE}` });
      }
      dayModeRef.current = 'none';
      return;
    }

    dayModeRef.current = 'none';
  };


  const selectedDayISO = useMemo(() => (selectedDate ? toISODate(selectedDate) : null), [selectedDate]);

  useLayoutEffect(() => {
    if (!selectedDate) return;
    requestAnimationFrame(() => {
      resetDayTrack();
      requestAnimationFrame(() => {
        isShiftingRef.current = false;
      });
    });
  }, [selectedDayISO, selectedDate, resetDayTrack]);

  useEffect(() => {
    if (!selectedDate) return;
    const onR = () => resetDayTrack();
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, [selectedDate, resetDayTrack]);

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

  // Month gestures
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

  const [yearStyle, setYearStyle] = useState<React.CSSProperties>({});

  // Helper to get props for DayColumn
  const getDayProps = useCallback((date: Date, isCurrent: boolean) => {
    const iso = toISODate(date);
    return {
        key: iso, // STABLE KEY is crucial
        date,
        isCurrent,
        dayData: store[iso], // Pass only specific data, not whole store
        keyboardInset,
        remoteReady,
        savedPulse,
        armedRemove,
        highlight,
        startEditing,
        stopEditing,
        saveName,
        armRemove,
        confirmRemove,
        revealFocus
    };
  }, [store, keyboardInset, remoteReady, savedPulse, armedRemove, highlight, startEditing, stopEditing, saveName, armRemove, confirmRemove, revealFocus]);

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

        {/* Weekdays */}
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

        {/* Month grid */}
        <div
          className="mt-[clamp(10px,2.2vw,20px)] flex-1 grid grid-cols-7 gap-[clamp(4px,2vw,16px)] overflow-visible pb-[clamp(24px,3.2vw,48px)]"
          style={{ fontFamily: BRAND.fontNumbers, gridAutoRows: '1fr', ...monthStyle }}
          onTouchStart={onMonthTouchStart}
          onTouchMove={onMonthTouchMove}
          onTouchEnd={onMonthTouchEnd}
          onTouchCancel={onMonthTouchEnd}
        >
          {matrix.flat().map((d) => {
            const inMonth = d.getMonth() === viewMonth;
            const key = toISODate(d);
            const num = d.getDate();
            const ratio = dayFillRatio(key, store);
            const showBar = inMonth && ratio > 0;
            const full = isDayFull(key, store);
            const isToday = inMonth && key === todayISO;

            const cls = [
              'rounded-2xl flex items-center justify-center bg-neutral-900 text-white border transition cursor-pointer',
              'h-full w-full aspect-square md:aspect-auto p-[clamp(6px,1vw,20px)] focus:outline-none',
              !inMonth ? 'border-neutral-800 opacity-40 hover:opacity-70' : isToday ? 'border-white/70 ring-2 ring-white/20' : 'border-neutral-700 hover:border-white/60',
            ].join(' ');

            return (
              <button key={key} onClick={() => { if (monthBlockClickRef.current) return; openDay(d); }} className={cls}>
                <div className="flex flex-col items-center justify-center gap-2 w-full">
                  <span className={`select-none text-[clamp(17px,3.5vw,32px)] ${isToday ? 'font-extrabold' : ''}`} style={{ fontFamily: BRAND.fontNumbers }}>
                    {inMonth && full ? 'X' : num}
                  </span>
                  {showBar && (
                    <div
                      className="w-[92%] max-w-[180px] h-[10px] rounded-full overflow-hidden border"
                      style={{
                        borderColor: 'rgba(255,255,255,0.16)',
                        background: 'linear-gradient(to bottom, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
                      }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.round(ratio * 100)}%`,
                          backgroundImage:
                            'repeating-linear-gradient(45deg, rgba(255,255,255,0.92) 0px, rgba(255,255,255,0.92) 10px, rgba(255,255,255,0.58) 10px, rgba(255,255,255,0.58) 20px)',
                          backgroundSize: '36px 36px',
                          animation: 'bushiBarMove 0.9s linear infinite',
                        }}
                      />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Availability Modal */}
      {showAvail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget) return;
            e.preventDefault();
            e.stopPropagation();
            swallowNextClick();
            setShowAvail(false);
          }}
        >
          <div className="w-[min(100%-28px,860px)] max-w-2xl rounded-3xl border border-neutral-800 bg-neutral-950/95 shadow-2xl px-5 py-5 sm:px-7 sm:py-7">
             <div className="flex items-center justify-between gap-3">
               <div className="text-[clamp(22px,4.2vw,32px)] leading-none select-none" style={{ fontFamily: BRAND.fontTitle }}>
                Най-близки свободни часове
              </div>
              <button
                onClick={() => syncFromRemote()}
                className="rounded-2xl border border-neutral-700/70 bg-neutral-900/60 px-3 py-2 text-xs uppercase tracking-[0.18em]"
                style={{ fontFamily: BRAND.fontBody }}
              >
                Refresh
              </button>
            </div>
            <div className="mt-4 max-h-[62vh] overflow-y-auto pr-1">
               {closestAvail.length === 0 ? (
                <div className="text-neutral-400 text-sm" style={{ fontFamily: BRAND.fontBody }}>Няма свободни часове напред.</div>
              ) : (
                <div className="space-y-3">
                  {closestGrouped.map(({ dayISO, list }) => (
                    <div key={dayISO} className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-3">
                      <div className="text-sm text-neutral-200 mb-2" style={{ fontFamily: BRAND.fontBody }}>
                        {formatDayLabel(dayISO)}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {list.map((h) => (
                          <button
                            key={`${h.dayISO}_${h.time}`}
                            onClick={() => openFromAvailability(h.dayISO, h.time)}
                            className="rounded-xl border border-neutral-800 bg-neutral-950/60 hover:bg-neutral-900/70 px-3 py-2 text-center"
                          >
                             <div className="text-sm font-semibold tabular-nums" style={{ fontFamily: BRAND.fontBody }}>{h.time}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search Modal */}
      {showSearch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget) return;
            e.preventDefault();
            e.stopPropagation();
            swallowNextClick();
            setShowSearch(false);
          }}
        >
          <div className="w-[min(100%-28px,860px)] max-w-2xl rounded-3xl border border-neutral-800 bg-neutral-950/95 shadow-2xl px-5 py-5 sm:px-7 sm:py-7">
             <div className="text-[clamp(22px,4.2vw,32px)] leading-none select-none" style={{ fontFamily: BRAND.fontTitle }}>Търсене на клиент</div>
             <div className="mt-4">
               <input
                ref={searchInputRef}
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Въведи име…"
                className="w-full rounded-2xl bg-neutral-900/70 border border-neutral-700/70 px-4 py-3 text-base"
                style={{ fontFamily: BRAND.fontBody }}
               />
             </div>
             <div className="mt-4 max-h-[58vh] overflow-y-auto pr-1">
               {hits.length === 0 ? (
                 <div className="text-neutral-400 text-sm" style={{ fontFamily: BRAND.fontBody }}>Няма резултати.</div>
               ) : (
                 <div className="space-y-3">
                  {groupedHits.map(({ dayISO, list }) => (
                    <div key={dayISO} className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-3">
                      <div className="text-sm text-neutral-200 mb-2" style={{ fontFamily: BRAND.fontBody }}>{formatDayLabel(dayISO)}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {list.map((h) => (
                           <button key={`${h.dayISO}_${h.time}_${h.name}`} onClick={() => openFromSearch(h.dayISO, h.time)} className="rounded-xl border border-neutral-800 bg-neutral-950/60 hover:bg-neutral-900/70 px-3 py-2 text-left">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold tabular-nums" style={{ fontFamily: BRAND.fontBody }}>{h.time}</div>
                              <div className="text-sm text-neutral-200 truncate">{h.name}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                 </div>
               )}
             </div>
          </div>
        </div>
      )}

      {/* Year Modal */}
      {showYear && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70" onClick={() => setShowYear(false)}>
          <div className="w-[min(100%-32px,820px)] max-w-xl rounded-3xl border border-neutral-800 bg-neutral-950/95 shadow-2xl px-6 py-6 sm:px-8 sm:py-8" style={yearStyle} onClick={(e) => e.stopPropagation()}>
             <div className="flex items-center justify-center">
              <div className="text-[clamp(30px,6vw,44px)] leading-none select-none" style={{ fontFamily: BRAND.fontTitle }}>{viewYear}</div>
            </div>
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              {MONTHS.map((label, idx) => (
                <button
                  key={label + viewYear}
                  onClick={() => { setViewMonth(idx); setShowYear(false); }}
                  className={`h-11 sm:h-12 rounded-2xl border text-[13px] sm:text-[14px] uppercase tracking-[0.12em] transition ${
                    idx === viewMonth ? 'border-white text-white bg-neutral-900' : 'border-neutral-700/70 text-neutral-200 bg-neutral-900/50 hover:bg-neutral-800'
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
      {selectedDate && selectedDayISO && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80" onMouseDown={() => setSelectedDate(null)}>
          <div
            className="max-w-6xl w-[94vw] md:w-[1100px] h-[90vh] rounded-2xl border border-neutral-700 bg-[rgb(10,10,10)] p-4 md:p-6 shadow-2xl overflow-hidden flex flex-col"
            style={panelStyle}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex-shrink-0 flex items-center justify-between cursor-pointer mb-4"
              onClick={animateCloseDown}
              title="Tap to close"
            >
              <h3 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: BRAND.fontTitle }}>
                {WEEKDAYS_FULL[(selectedDate.getDay() + 6) % 7]} {selectedDate.getDate()} {MONTHS[selectedDate.getMonth()]} {selectedDate.getFullYear()}
              </h3>
              <div className="w-10 md:w-12" />
            </div>

            {/* Day swipe viewport (translateX track) */}
            <div ref={dayHostRef} className="flex-1 w-full min-h-0 overflow-hidden">
              <div
                onTouchStart={onDayTouchStart}
                onTouchMove={onDayTouchMove}
                onTouchEnd={onDayTouchEnd}
                onTouchCancel={onDayTouchEnd}
                className="w-full h-full flex"
                style={dayTrackStyle}
              >
                {/* We keep 3 columns mounted (prev / current / next) */}
                <div className="w-full h-full flex-shrink-0" style={{ flex: '0 0 100%' }}>
                  <DayColumn {...getDayProps(addDays(selectedDate, -1), false)} />
                </div>
                <div className="w-full h-full flex-shrink-0" style={{ flex: '0 0 100%' }}>
                  <DayColumn {...getDayProps(selectedDate, true)} />
                </div>
                <div className="w-full h-full flex-shrink-0" style={{ flex: '0 0 100%' }}>
                  <DayColumn {...getDayProps(addDays(selectedDate, 1), false)} />
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
// PIN wrapper
// =============================================================================
export default function BarbershopAdminPanel() {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (process.env.NODE_ENV === 'production' && localStorage.getItem('bushi_unlocked') === '1') {
      setUnlocked(true);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === PIN_CODE) {
      setUnlocked(true);
      setError('');
      if (typeof window !== 'undefined') localStorage.setItem('bushi_unlocked', '1');
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
             <img src="/bush.png" alt="Bushi logo" className="max-h-16 w-auto object-contain" />
          </div>
          <p className="text-xs text-neutral-400 text-center mb-6" style={{ fontFamily: BRAND.fontBody }}>Enter your PIN.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-2xl bg-neutral-900/80 border border-white/12 px-4 py-3 flex items-center focus-within:border-white/70 transition">
              <input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} maxLength={6} className="w-full bg-transparent border-none outline-none text-center text-lg tracking-[0.35em] placeholder:text-neutral-600" style={{ fontFamily: BRAND.fontBody }} placeholder="••••" />
            </div>
            {error && <div className="text-xs text-red-400 text-center" style={{ fontFamily: BRAND.fontBody }}>{error}</div>}
            <button type="submit" className="w-full rounded-2xl bg-white text-black font-semibold py-2.5 text-sm tracking-[0.16em] uppercase hover:bg-neutral-200 transition">Unlock</button>
          </form>
        </div>
      </div>
    );
  }
  return <BarberCalendarCore />;
}
