"use client";

import { airportCoord } from "@/lib/airport-coords";
import {
  dealCityTitle,
  dealDestCode,
  dealHref,
  displayDealPrice,
  formatDealMoney,
} from "@/lib/deal-display";
import type { Deal } from "@/lib/types";
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

setWorkerUrl("/lib/maplibre/maplibre-gl-worker.mjs");

const LIBERTY_STYLE = "https://tiles.openfreemap.org/styles/liberty";

type Pin = {
  id: string;
  href: string;
  label: string;
  title: string;
  lat: number;
  lng: number;
};

function pinsFromDeals(deals: Deal[]): Pin[] {
  const out: Pin[] = [];
  const seen = new Set<string>();
  for (const deal of deals) {
    const code = dealDestCode(deal);
    const pos = airportCoord(code);
    if (!pos || seen.has(code)) continue;
    seen.add(code);
    out.push({
      id: deal.id,
      href: dealHref(deal),
      label: formatDealMoney(displayDealPrice(deal.price), deal.currency),
      title: dealCityTitle(deal),
      lat: pos.lat,
      lng: pos.lng,
    });
  }
  return out;
}

function flattenLiberty(map: MapLibreMap) {
  if (map.getLayer("natural_earth")) map.removeLayer("natural_earth");
  if (map.getLayer("building-3d")) {
    map.setLayoutProperty("building-3d", "visibility", "none");
  }
}

function drawPins(map: MapLibreMap, pins: Pin[], markers: Marker[]) {
  for (const marker of markers) marker.remove();
  markers.length = 0;
  if (pins.length === 0) return;

  const bounds = new LngLatBounds();
  for (const pin of pins) {
    const el = document.createElement("a");
    el.className = "vitrin-map__price";
    el.href = pin.href;
    el.textContent = pin.label;
    el.title = pin.title;
    el.setAttribute("aria-label", `${pin.title} ${pin.label}`);
    const marker = new Marker({ element: el, anchor: "bottom" })
      .setLngLat([pin.lng, pin.lat])
      .addTo(map);
    markers.push(marker);
    bounds.extend([pin.lng, pin.lat]);
  }

  if (pins.length === 1) {
    map.easeTo({
      center: [pins[0].lng, pins[0].lat],
      zoom: 5.2,
      duration: 500,
    });
    return;
  }

  map.fitBounds(bounds, {
    padding: { top: 56, bottom: 56, left: 48, right: 48 },
    maxZoom: 6.2,
    duration: 600,
  });
}

export function VitrinMap({ deals }: { deals: Deal[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const pins = useMemo(() => pinsFromDeals(deals), [deals]);
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const pinKey = pins.map((p) => `${p.id}:${p.label}`).join("|");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const map = new MapLibreMap({
      container: host,
      style: LIBERTY_STYLE,
      center: [29, 41],
      zoom: 4.2,
      pitch: 0,
      maxPitch: 0,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    map.addControl(
      new NavigationControl({
        showCompass: false,
        visualizePitch: false,
      }),
      "top-right",
    );
    mapRef.current = map;

    const onStyle = () => {
      flattenLiberty(map);
      drawPins(map, pinsRef.current, markersRef.current);
    };
    map.on("style.load", onStyle);

    const resize = () => map.resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    return () => {
      ro.disconnect();
      map.off("style.load", onStyle);
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    flattenLiberty(map);
    drawPins(map, pins, markersRef.current);
  }, [pinKey, pins]);

  return (
    <div className="vitrin-map" aria-label="Fırsat haritası">
      <div ref={hostRef} className="vitrin-map__canvas" />
    </div>
  );
}
