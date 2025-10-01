"use client";
import React, { useEffect, useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------
const BRAND = {
  nickname: "Bushi",
  shopName: "BushiBarberShop",
  logoLight: "/bushii-logo.png",
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
const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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
// Main page
// ---------------------------------------------------------------------------
export default function BarbershopAdminPanel() {
  useEffect(() => {
    injectBrandFonts();
  }, []);
  useEffect(() => {
    // prevent page scroll while on calendar view
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());

  const matrix = useMemo(() => getMonthMatrix(currentYear, currentMonth), [currentYear, currentMonth]);

  const [showYear, setShowYear] = useState(false);
  const monthName = new Date(currentYear, currentMonth, 1).toLocaleString(undefined, { month: "long" });

  return (
    <div className="fixed inset-0 w-full h-dvh bg-black text-white overflow-hidden">
      <div className="max-w-6xl mx-auto p-3 md:p-8 h-full flex flex-col select-none">
        {/* Top bar: logo left, month/year right */}
        <div className="flex items-center justify-between w-full mb-10 md:mb-14 px-2 md:px-6">
          {BRAND.logoLight && (
            <img
              src={BRAND.logoLight}
              alt="logo"
              className="h-40 md:h-56 w-auto cursor-pointer"
              onClick={() => {
                setCurrentYear(today.getFullYear());
                setCurrentMonth(today.getMonth());
              }}
            />
          )}
          <h1
            className="text-xl md:text-3xl font-bold cursor-pointer hover:text-gray-300 select-none"
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
            return (
              <div
                key={idx}
                className={`rounded-2xl p-5 text-center font-bold cursor-pointer transition select-none ${inMonth ? "bg-neutral-900 hover:bg-neutral-800" : "bg-neutral-900/30 text-gray-500"}`}
              >
                {date.getDate()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
