// Visual QA helper: signs in with a QA account and screenshots key pages.
// Usage: QA_EMAIL=... QA_PASSWORD=... QA_WORLD=<uuid> BASE_URL=<preview url> OUT=/tmp/shots node scripts/screenshots.mjs
import { chromium } from "playwright";

const base = process.env.BASE_URL;
const out = process.env.OUT ?? "/tmp/shots";
const world = process.env.QA_WORLD;
const pages = (process.env.PAGES ?? "home,fame,events").split(",");
const width = Number(process.env.WIDTH ?? 1440);
const height = Number(process.env.HEIGHT ?? 960);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(`${base}/auth`);
await page.fill("#email", process.env.QA_EMAIL);
await page.fill("#password", process.env.QA_PASSWORD);
await page.click("button[type=submit]");
await page.waitForURL(/\/worlds|\/w\//, { timeout: 20000 });

const routes = { home: "", fame: "/fame", events: "/events", discover: "/discover", notifications: "/notifications", communities: "/communities", achievements: "/achievements", settings: "/settings" };
for (const p of pages) {
  const path = p.startsWith("/") ? p : routes[p] ?? `/${p}`;
  await page.goto(`${base}/w/${world}${path}`);
  await page.waitForTimeout(Number(process.env.WAIT ?? 6000));
  const key = Object.keys(page.context()).length;
  void key;
  await page.keyboard.press("Escape");
  await page.screenshot({ path: `${out}/${p.replace(/\//g, "_")}-${width}.png` });
}
console.log(JSON.stringify({ errors: errors.slice(0, 10) }));
await browser.close();
