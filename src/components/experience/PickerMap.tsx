"use client";

import { type Region, regionOf } from "@/lib/data/regions";
import { WORLD_H, WORLD_LAND_PATH, WORLD_W } from "@/lib/data/world-map";
import { FEATURED_COORDS } from "@/lib/experience/featured";

const px = (lon: number) => ((lon + 180) / 360) * WORLD_W;
const py = (lat: number) => ((90 - lat) / 180) * WORLD_H;

/** Decorative region-filter backdrop: featured dots light up for the active region. */
export function PickerMap({ activeRegion }: { activeRegion: Region | "all" }) {
  return (
    <svg
      viewBox={`0 14 ${WORLD_W} 402`}
      className="h-24 w-full sm:h-32"
      role="img"
      aria-label="World map"
    >
      <path d={WORLD_LAND_PATH} className="fill-ink-150" />
      {Object.entries(FEATURED_COORDS).map(([iso3, [lat, lon]]) => {
        const active = activeRegion === "all" || regionOf(iso3) === activeRegion;
        return (
          <circle
            key={iso3}
            cx={px(lon)}
            cy={py(lat)}
            r={active ? 6 : 3.5}
            className={active ? "fill-tamm-cyan" : "fill-ink-300"}
            opacity={active ? 1 : 0.6}
          />
        );
      })}
    </svg>
  );
}
