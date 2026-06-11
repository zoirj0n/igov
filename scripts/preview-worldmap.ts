/* eslint-disable no-console */
// Dev-only: rasterise the world map to /tmp/worldmap.png to eyeball geometry.
import { writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { WORLD_LAND_PATH, WORLD_W } from "../src/lib/data/world-map";

const COORDS: Record<string, [number, number]> = {
  ARE: [24, 54],
  SAU: [24, 45],
  USA: [38, -97],
  GBR: [54, -2],
  FRA: [46, 2],
  DEU: [51, 10],
  JPN: [36, 138],
  KOR: [36, 128],
  CHN: [35, 105],
  IND: [21, 78],
  BRA: [-14, -52],
  ZAF: [-30, 23],
};
const px = (lon: number) => ((lon + 180) / 360) * 1000;
const py = (lat: number) => ((90 - lat) / 180) * 500;
const partners = new Set(["ARE", "BRA", "DEU", "IND"]);

const grat =
  [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150]
    .map(
      (lon) =>
        `<line x1="${px(lon)}" y1="14" x2="${px(lon)}" y2="416" stroke="rgba(255,255,255,0.05)" stroke-width="0.6"/>`,
    )
    .join("") +
  [-30, 0, 30, 60]
    .map(
      (lat) =>
        `<line x1="0" y1="${py(lat)}" x2="1000" y2="${py(lat)}" stroke="rgba(255,255,255,0.05)" stroke-width="0.6"/>`,
    )
    .join("");

const hub: [number, number] = [px(54), py(24)];
const arcs = ["BRA", "DEU", "IND"]
  .map((iso) => {
    const [lat, lon] = COORDS[iso]!;
    const x = px(lon),
      y = py(lat);
    const cx = (hub[0] + x) / 2,
      cy = (hub[1] + y) / 2 - Math.hypot(x - hub[0], y - hub[1]) * 0.22;
    return `<path d="M${hub[0]} ${hub[1]} Q${cx} ${cy} ${x} ${y}" fill="none" stroke="#0eecda" stroke-width="1.1" opacity="0.7"/>`;
  })
  .join("");

const pins = Object.entries(COORDS)
  .map(([iso, [lat, lon]]) => {
    const x = px(lon),
      y = py(lat);
    const p = partners.has(iso);
    return `<circle cx="${x}" cy="${y}" r="${p ? 5 : 2.6}" fill="${p ? "#169f9f" : "#6a6b78"}"/><text x="${x + 7}" y="${y + 3}" font-size="9.5" fill="${p ? "#e4e5ea" : "#8b8c98"}" font-family="monospace" font-weight="600">${iso}</text>`;
  })
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 14 ${WORLD_W} 402" width="1000">
<rect x="0" y="14" width="1000" height="402" fill="#0b0b12"/>
${grat}
<path d="${WORLD_LAND_PATH}" fill="#1b1c26" stroke="#343543" stroke-width="0.5"/>
${arcs}${pins}
</svg>`;

const png = new Resvg(svg, { fitTo: { mode: "width", value: 1000 } }).render().asPng();
const out = `${process.cwd()}/.tmp/worldmap.png`;
writeFileSync(out, png);
console.log(`wrote ${out}`);
