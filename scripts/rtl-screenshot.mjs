// Ad-hoc visual RTL check: screenshots public pages in Arabic (default) and English.
// Usage: node scripts/rtl-screenshot.mjs [baseUrl]
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3000";
const shots = [
  { path: "/login", name: "login" },
  { path: "/", name: "landing" },
];

const browser = await chromium.launch();
for (const localeCookie of ["ar", "en"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([
    { name: "locale", value: localeCookie, url: base },
  ]);
  const page = await ctx.newPage();
  for (const s of shots) {
    await page.goto(base + s.path, { waitUntil: "networkidle" });
    const file = `/tmp/rtl-${s.name}-${localeCookie}.png`;
    await page.screenshot({ path: file, fullPage: false });
    console.log(file);
  }
  await ctx.close();
}
await browser.close();
