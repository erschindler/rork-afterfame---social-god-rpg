import { BRANDS_A } from "./brands-a";
import { BRANDS_B } from "./brands-b";
import type { AdCategory, Brand, BrandFont } from "./types";

export type { Brand, BrandFont, AdCategory };

export const BRANDS: Brand[] = [...BRANDS_A, ...BRANDS_B];
const BY_SLUG = new Map(BRANDS.map((b) => [b.slug, b]));
export const brandBySlug = (slug: string) => BY_SLUG.get(slug) ?? null;

export const FONT_FAMILY: Record<BrandFont, string> = {
  grotesk: "'Schibsted Grotesk', system-ui, sans-serif",
  serif: "'Fraunces', Georgia, serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
  round: "'Fredoka', 'Schibsted Grotesk', sans-serif",
  condensed: "'Bebas Neue', 'Archivo', Impact, sans-serif",
};

/** Brand fonts load on demand, only once ads or fake sites are on screen. */
export function ensureBrandFonts() {
  if (typeof document === "undefined" || document.getElementById("af-brand-fonts")) return;
  const l = document.createElement("link");
  l.id = "af-brand-fonts";
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Fraunces:opsz,wght@9..144,500;9..144,800&family=Fredoka:wght@500;700&family=JetBrains+Mono:wght@500;800&display=swap";
  document.head.appendChild(l);
}

const CTAS: Record<AdCategory, string[]> = {
  food: ["Order now", "Find a location", "Grab one", "Taste it"],
  tech: ["Learn more", "Pre-order", "Start free trial", "See specs"],
  finance: ["Open account", "Get started", "Check rates", "Join waitlist"],
  fitness: ["Join today", "Start free week", "Shop gear", "Get moving"],
  beauty: ["Shop now", "Find your glow", "Take the quiz", "See the ritual"],
  gaming: ["Play now", "Shop gear", "Claim reward", "Get the pass"],
  services: ["Book now", "Get the app", "See prices", "Try it free"],
  media: ["Subscribe", "Start watching", "Read more", "Get tickets"],
  lifestyle: ["Shop the drop", "Explore", "Shop now", "Get yours"],
  auto: ["Book test drive", "Build yours", "See inventory", "Come on down"],
  home: ["Shop now", "Take the tour", "Get a quote", "See it in action"],
  health: ["Shop now", "Take the quiz", "Subscribe & save", "Feel better-ish"],
  legal: ["Call now", "Free consultation", "Get your case reviewed", "Sue someone"],
  education: ["Apply now", "Enroll today", "See curriculum", "Book a call"],
  travel: ["Book now", "See deals", "Explore trips", "Pack your bags"],
  pets: ["Shop now", "Subscribe", "Treat them", "Meet the team"],
};

export interface AdView {
  key: string;
  brand: Brand;
  headline: string;
  body: string;
  cta: string;
  product: [string, string, string];
  benefit: string;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickR = <T>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)];

const fill = (t: string, b: Brand, p: string, benefit: string) => t.replace(/\{p\}/g, p).replace(/\{b\}/g, benefit).replace(/\{n\}/g, b.name);

/** Total distinct ad creatives across all brands. */
export const AD_VARIANTS = BRANDS.reduce((n, b) => n + b.heads.length * b.bodies.length * b.products.length * b.benefits.length * CTAS[b.cat].length, 0);

export function composeAd(b: Brand, variant: number): AdView {
  const r = rng(hash(`${b.slug}:${variant}`));
  const product = pickR(r, b.products);
  const benefit = pickR(r, b.benefits);
  const head = pickR(r, b.heads);
  const body = pickR(r, b.bodies);
  const cta = pickR(r, CTAS[b.cat]);
  return { key: `${b.slug}:${variant}`, brand: b, headline: fill(head, b, product[0], benefit), body, cta, product, benefit };
}

// ---- Seen / hidden tracking (local only) ----

const SEEN_KEY = "af.ads.seen.v1";
const HIDE_KEY = "af.ads.hidden.v1";
const read = <T>(k: string, d: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(k) ?? "null") as T) ?? d;
  } catch {
    return d;
  }
};

export const hiddenBrands = (): string[] => read<string[]>(HIDE_KEY, []);
export function hideBrand(slug: string) {
  const h = new Set(hiddenBrands());
  h.add(slug);
  localStorage.setItem(HIDE_KEY, JSON.stringify([...h]));
}
export function unhideAllBrands() {
  localStorage.removeItem(HIDE_KEY);
}

function markSeen(key: string) {
  const s = read<string[]>(SEEN_KEY, []);
  if (s.includes(key)) return;
  s.push(key);
  localStorage.setItem(SEEN_KEY, JSON.stringify(s.slice(-600)));
}

/**
 * Picks an ad for a feed slot. Deterministic per (scope, slot) so re-renders
 * don't reshuffle, weighted toward the player's interests, avoiding recently
 * seen creatives and brands the player hid.
 */
export function adForSlot(scope: string, slot: number, interests: string[]): AdView | null {
  const hidden = new Set(hiddenBrands());
  const pool = BRANDS.filter((b) => !hidden.has(b.slug));
  if (!pool.length) return null;
  const r = rng(hash(`${scope}:${slot}`));
  const weights = pool.map((b) => 1 + 2.5 * b.topics.filter((t) => interests.includes(t)).length);
  const total = weights.reduce((a, w) => a + w, 0);
  const seen = new Set(read<string[]>(SEEN_KEY, []));
  let brand = pool[0];
  let x = r() * total;
  for (let i = 0; i < pool.length; i++) {
    x -= weights[i];
    if (x <= 0) {
      brand = pool[i];
      break;
    }
  }
  let variant = Math.floor(r() * 100000);
  for (let tries = 0; tries < 6 && seen.has(composeAd(brand, variant).key); tries++) variant = Math.floor(r() * 100000);
  const ad = composeAd(brand, variant);
  markSeen(ad.key);
  return ad;
}

/** Funny targeting explanations for "Why am I seeing this ad?" */
export function whyThisAd(b: Brand, interests: string[], topicName: (id: string) => string): string[] {
  const shared = b.topics.filter((t) => interests.includes(t)).map(topicName);
  const r = rng(hash(b.slug));
  const extra = [
    "You paused on a post for 0.4 seconds longer than average.",
    "Someone you follow once said a word that rhymes with this product.",
    "Our model thinks you're 'between 18 and 94'.",
    "You opened this app, which is our main signal.",
    "It's raining somewhere, statistically.",
    "Advertisers like you. Maybe a little too much.",
    "You have a phone, a pulse and a payment method nearby.",
  ];
  return [
    shared.length ? `You're interested in ${shared.join(", ")}.` : "Nobody else bid on this slot.",
    pickR(r, extra),
    pickR(r, extra.filter((e) => e !== extra[0])),
    "This is a fictional ad inside a simulated world. No real tracking happened.",
  ];
}

// ---- Fake website content ----

const FIRST = ["Dana", "Marcus", "Priya", "Tom", "Yuki", "Ola", "Rafael", "Grace", "Benji", "Ines", "Kwame", "Lou", "Sasha", "Ezra", "Mina", "Theo"];
const LAST = ["R.", "K.", "T.", "M.", "B.", "S.", "V.", "L."];
const QUOTES = [
  "I bought {p} as a joke and now I can't stop telling strangers about it.",
  "Honestly? {b}. My therapist is concerned. I'm thrilled.",
  "Five stars. Would have given six but the form wouldn't let me.",
  "My partner left me, but {p} stayed.",
  "I didn't know I needed {p} until the ad told me. Then I needed it a lot.",
  "{n} changed my life in ways I'm still processing.",
  "It's fine. It's actually fine. That's high praise from me.",
  "I've recommended {n} to everyone I know and two people I don't.",
];

export interface SiteContent {
  testimonials: { quote: string; name: string; stars: number }[];
  faq: { q: string; a: string }[];
  stats: { label: string; value: string }[];
  partners: Brand[];
}

export function siteContent(b: Brand): SiteContent {
  const r = rng(hash(`site:${b.slug}`));
  const testimonials = Array.from({ length: 3 }, (_, i) => {
    const p = b.products[i % b.products.length][0];
    return {
      quote: fill(pickR(r, QUOTES), b, p, b.benefits[i % b.benefits.length].toLowerCase()),
      name: `${pickR(r, FIRST)} ${pickR(r, LAST)}`,
      stars: r() < 0.8 ? 5 : 4,
    };
  });
  const faq = [
    { q: `Is ${b.products[0][0]} right for me?`, a: `Our research team (one intern named Kyle) says yes. ${b.products[0][2]}` },
    { q: "Do you ship internationally?", a: "We ship everywhere this simulated internet reaches, which is exactly as far as your imagination." },
    { q: "Can I get a refund?", a: "Absolutely. Simply fill out the form, fax it to us, and wait for the heat death of the universe." },
    { q: `Is ${b.name} a real company?`, a: `No. ${b.name} is a fictional advertiser in AFTERFAME. Nothing here can be bought, and no money will ever change hands.` },
  ];
  const stats = [
    { label: "Happy customers", value: `${Math.floor(r() * 900 + 100)}K+` },
    { label: "Founded", value: `${Math.floor(r() * 40 + 1982)}` },
    { label: "Lawsuits won", value: `${Math.floor(r() * 9)}` },
  ];
  const partners = BRANDS.filter((x) => x.slug !== b.slug)
    .map((x) => ({ x, k: hash(`${b.slug}>${x.slug}`) }))
    .sort((a, z) => a.k - z.k)
    .slice(0, 4)
    .map((p) => p.x);
  return { testimonials, faq, stats, partners };
}

export const fakeDomain = (b: Brand) => `www.${b.slug.replace(/-/g, "")}.sim`;
