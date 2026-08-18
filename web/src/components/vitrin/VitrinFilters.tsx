"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { DepartureAirport } from "@/lib/departures";
import type { FlightTypeFilter } from "@/lib/deal-display";

type OpenKey = "origin" | "price" | "dest" | "type" | null;

export function VitrinFilters({
  airports,
  selectedOrigins,
  onOriginsChange,
  dests,
  selectedDests,
  onDestsChange,
  selectedFlightTypes,
  onFlightTypesChange,
  priceMin,
  priceMax,
  boundMin,
  boundMax,
  onPriceChange,
  onClear,
  canClear,
}: {
  airports: DepartureAirport[];
  selectedOrigins: string[];
  onOriginsChange: (codes: string[]) => void;
  dests: { code: string; name: string }[];
  selectedDests: string[];
  onDestsChange: (codes: string[]) => void;
  selectedFlightTypes: FlightTypeFilter[];
  onFlightTypesChange: (types: FlightTypeFilter[]) => void;
  priceMin: number;
  priceMax: number;
  boundMin: number;
  boundMax: number;
  onPriceChange: (min: number, max: number) => void;
  onClear: () => void;
  canClear: boolean;
}) {
  const [open, setOpen] = useState<OpenKey>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function toggleOrigin(code: string) {
    if (selectedOrigins.includes(code)) {
      const next = selectedOrigins.filter((c) => c !== code);
      onOriginsChange(next.length === 0 ? airports.map((a) => a.code) : next);
    } else {
      onOriginsChange([...selectedOrigins, code]);
    }
  }

  function toggleDest(code: string) {
    onDestsChange(
      selectedDests.includes(code)
        ? selectedDests.filter((c) => c !== code)
        : [...selectedDests, code],
    );
  }

  function toggleFlightType(type: FlightTypeFilter) {
    onFlightTypesChange(
      selectedFlightTypes.includes(type)
        ? selectedFlightTypes.filter((t) => t !== type)
        : [...selectedFlightTypes, type],
    );
  }

  const span = Math.max(boundMax - boundMin, 1);
  const fillLeft = ((priceMin - boundMin) / span) * 100;
  const fillRight = ((boundMax - priceMax) / span) * 100;

  return (
    <div className="vitrin-filters" ref={wrapRef}>
      <div className="vitrin-filters__pills">
        <div className="vitrin-filter">
          <button
            type="button"
            className={
              open === "origin"
                ? "vitrin-filter__btn vitrin-filter__btn--open"
                : "vitrin-filter__btn"
            }
            aria-expanded={open === "origin"}
            onClick={() => setOpen(open === "origin" ? null : "origin")}
          >
            Kalkış havalimanı
            <Chevron />
          </button>
          {open === "origin" ? (
            <div className="vitrin-filter__panel" role="dialog" aria-label="Kalkış havalimanı">
              {airports.length === 0 ? (
                <p className="vitrin-filter__empty">Henüz kalkış eklenmedi.</p>
              ) : (
                <ul className="vitrin-filter__list">
                  {airports.map((a) => (
                    <li key={a.code}>
                      <label className="vitrin-filter__row">
                        <span>{a.label}</span>
                        <input
                          type="checkbox"
                          className="vitrin-check"
                          checked={selectedOrigins.includes(a.code)}
                          onChange={() => toggleOrigin(a.code)}
                        />
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                className="vitrin-filter__edit"
                href="/kalkis-havalimani"
                onClick={() => setOpen(null)}
              >
                Ekle / Düzenle
              </Link>
            </div>
          ) : null}
        </div>

        <div className="vitrin-filter">
          <button
            type="button"
            className={
              open === "price"
                ? "vitrin-filter__btn vitrin-filter__btn--open"
                : "vitrin-filter__btn"
            }
            aria-expanded={open === "price"}
            onClick={() => setOpen(open === "price" ? null : "price")}
          >
            Fiyat
            <Chevron />
          </button>
          {open === "price" ? (
            <div className="vitrin-filter__panel vitrin-filter__panel--price" role="dialog" aria-label="Fiyat">
              <div className="vitrin-range">
                <div className="vitrin-range__rail">
                  <div
                    className="vitrin-range__fill"
                    style={{ left: `${fillLeft}%`, right: `${fillRight}%` }}
                  />
                </div>
                <input
                  type="range"
                  min={boundMin}
                  max={boundMax}
                  value={priceMin}
                  aria-label="Min fiyat"
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    onPriceChange(Math.min(next, priceMax), priceMax);
                  }}
                />
                <input
                  type="range"
                  min={boundMin}
                  max={boundMax}
                  value={priceMax}
                  aria-label="Max fiyat"
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    onPriceChange(priceMin, Math.max(next, priceMin));
                  }}
                />
              </div>
              <label className="vitrin-price-field">
                Min
                <input
                  type="number"
                  min={boundMin}
                  max={priceMax}
                  value={priceMin}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") return;
                    const next = Number(raw);
                    if (Number.isNaN(next)) return;
                    onPriceChange(
                      Math.min(Math.max(next, boundMin), priceMax),
                      priceMax,
                    );
                  }}
                />
              </label>
              <label className="vitrin-price-field">
                Max
                <input
                  type="number"
                  min={priceMin}
                  max={boundMax}
                  value={priceMax}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") return;
                    const next = Number(raw);
                    if (Number.isNaN(next)) return;
                    onPriceChange(
                      priceMin,
                      Math.max(Math.min(next, boundMax), priceMin),
                    );
                  }}
                />
              </label>
            </div>
          ) : null}
        </div>

        <div className="vitrin-filter">
          <button
            type="button"
            className={
              open === "dest"
                ? "vitrin-filter__btn vitrin-filter__btn--open"
                : "vitrin-filter__btn"
            }
            aria-expanded={open === "dest"}
            onClick={() => setOpen(open === "dest" ? null : "dest")}
          >
            Hedef rotalar
            <Chevron />
          </button>
          {open === "dest" ? (
            <div className="vitrin-filter__panel" role="dialog" aria-label="Hedef rotalar">
              {dests.length === 0 ? (
                <p className="vitrin-filter__empty">Henüz destinasyon eklenmedi.</p>
              ) : (
                <ul className="vitrin-filter__list">
                  {dests.map((d) => (
                    <li key={d.code}>
                      <label className="vitrin-filter__row">
                        <span>{d.name}</span>
                        <input
                          type="checkbox"
                          className="vitrin-check"
                          checked={selectedDests.includes(d.code)}
                          onChange={() => toggleDest(d.code)}
                        />
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                className="vitrin-filter__edit"
                href="/hedef-destinasyonlar"
                onClick={() => setOpen(null)}
              >
                Ekle / Düzenle
              </Link>
            </div>
          ) : null}
        </div>

        <div className="vitrin-filter">
          <button
            type="button"
            className={
              open === "type"
                ? "vitrin-filter__btn vitrin-filter__btn--open"
                : "vitrin-filter__btn"
            }
            aria-expanded={open === "type"}
            onClick={() => setOpen(open === "type" ? null : "type")}
          >
            Uçuş Tipi
            <Chevron />
          </button>
          {open === "type" ? (
            <div className="vitrin-filter__panel" role="dialog" aria-label="Uçuş Tipi">
              <ul className="vitrin-filter__list">
                <li>
                  <label className="vitrin-filter__row">
                    <span>Yurt İçi</span>
                    <input
                      type="checkbox"
                      className="vitrin-check"
                      checked={selectedFlightTypes.includes("domestic")}
                      onChange={() => toggleFlightType("domestic")}
                    />
                  </label>
                </li>
                <li>
                  <label className="vitrin-filter__row">
                    <span>Yurt Dışı</span>
                    <input
                      type="checkbox"
                      className="vitrin-check"
                      checked={selectedFlightTypes.includes("international")}
                      onChange={() => toggleFlightType("international")}
                    />
                  </label>
                </li>
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        className="vitrin-filters__clear"
        disabled={!canClear}
        onClick={onClear}
      >
        Tüm filtreleri temizle
      </button>
    </div>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3.2 5.6 8 10.4l4.8-4.8 1.2 1.2L8 12.8 2 6.8z"
      />
    </svg>
  );
}
