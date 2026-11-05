import { ArrowLeft, ChevronDown, Lock, RotateCw, ShoppingBag, Star, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { BrandMark } from "@/components/AdCard";
import { BRANDS, FONT_FAMILY, brandBySlug, ensureBrandFonts, fakeDomain, siteContent, type Brand } from "@/lib/ads";

const DECLINES = [
  "Payment declined: this store exists only inside a simulation.",
  "Your card was charged 0 imaginary dollars. Nothing will ship.",
  "Checkout failed successfully. Your wallet is safe.",
  "Order received by a server that doesn't exist. Thanks for playing.",
];

/** A full-page fictional brand website opened from a promoted post. */
export default function FakeSite() {
  const { worldId = "", brandSlug = "" } = useParams<{ worldId: string; brandSlug: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const brand = brandBySlug(brandSlug);
  const [cart, setCart] = useState<string[]>([]);
  const [cartOpen, setCartOpen] = useState<boolean>(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    ensureBrandFonts();
    window.scrollTo(0, 0);
  }, [brandSlug]);
  useEffect(() => {
    if (brand) document.title = `${brand.name} · ${brand.tag}`;
    return () => {
      document.title = "AFTERFAME";
    };
  }, [brand]);

  const content = useMemo(() => (brand ? siteContent(brand) : null), [brand]);
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate(`/w/${worldId}`));

  if (!brand || !content) return <SiteDirectory worldId={worldId} missing={brandSlug} />;

  const [bg, fg, accent] = brand.c;
  const ink = bg;
  const display = { fontFamily: FONT_FAMILY[brand.font], fontWeight: 800 } as const;
  const featured = brand.products.find((p) => p[0] === params.get("p")) ?? brand.products[0];
  const total = cart.reduce((s, n) => s + (parseFloat((brand.products.find((p) => p[0] === n)?.[1] ?? "0").replace(/[^0-9.]/g, "")) || 0), 0);

  return (
    <div className="min-h-dvh" style={{ background: bg, color: fg }}>
      <BrowserBar brand={brand} onBack={back} />

      <header className="sticky top-[52px] z-20 border-b backdrop-blur" style={{ borderColor: `${fg}1f`, background: `${bg}e6` }}>
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3">
          <BrandMark brand={brand} size={34} />
          <span className="text-xl" style={display}>{brand.name}</span>
          <nav className="ml-6 hidden gap-5 text-sm opacity-80 md:flex">
            <a href="#shop">Shop</a>
            <a href="#reviews">Reviews</a>
            <a href="#faq">FAQ</a>
            <a href="#about">About</a>
          </nav>
          <button type="button" onClick={() => setCartOpen(true)} className="relative ml-auto rounded-full p-2" style={{ background: `${fg}14` }} aria-label="Cart">
            <ShoppingBag className="h-5 w-5" />
            {cart.length > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold" style={{ background: accent, color: ink }}>{cart.length}</span>
            )}
          </button>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute -right-32 -top-24 h-[420px] w-[420px] rounded-full" style={{ background: accent, opacity: accent === fg ? 0.08 : 0.9 }} aria-hidden />
        <div className="relative mx-auto grid max-w-5xl gap-10 px-5 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">{brand.tag}</p>
            <h1 className="mt-4 text-5xl leading-[0.95] md:text-7xl" style={display}>{featured[0]}</h1>
            <p className="mt-5 max-w-md text-lg opacity-80">{featured[2]} {brand.bodies[0]}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={() => { setCart((c) => [...c, featured[0]]); toast(`${featured[0]} added to cart`); }} className="rounded-full px-6 py-3 font-bold transition-transform active:scale-95" style={{ background: fg, color: bg }}>
                Add to cart · {featured[1]}
              </button>
              <a href="#shop" className="rounded-full border px-6 py-3 font-semibold" style={{ borderColor: `${fg}40` }}>See everything</a>
            </div>
          </div>
          <div className="grid place-items-center">
            <div className="relative grid aspect-square w-full max-w-[320px] place-items-center rounded-[2rem] border-2" style={{ borderColor: fg, background: bg }}>
              <span className="text-[120px] leading-none" style={{ ...display, color: accent === fg ? fg : accent }}>{brand.mark}</span>
              <span className="absolute -bottom-4 rotate-[-4deg] rounded-full px-4 py-1.5 text-sm font-bold" style={{ background: fg, color: bg }}>{brand.benefits[0]}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y" style={{ borderColor: `${fg}1f` }}>
        <div className="mx-auto grid max-w-5xl grid-cols-3 divide-x px-5" style={{ borderColor: `${fg}1f` }}>
          {content.stats.map((s) => (
            <div key={s.label} className="px-3 py-6 text-center" style={{ borderColor: `${fg}1f` }}>
              <p className="text-3xl tabular-nums" style={display}>{s.value}</p>
              <p className="mt-1 text-xs uppercase tracking-wider opacity-60">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="shop" className="mx-auto max-w-5xl px-5 py-16">
        <h2 className="text-4xl" style={display}>The lineup</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {brand.products.map(([name, price, blurb], i) => (
            <div key={name} className="flex flex-col rounded-3xl border p-5" style={{ borderColor: `${fg}26`, background: `${fg}08` }}>
              <div className="grid aspect-[4/3] place-items-center rounded-2xl" style={{ background: i === 1 ? fg : accent === fg ? `${fg}14` : accent, color: i === 1 ? bg : accent === fg ? fg : ink }}>
                <span className="text-5xl" style={display}>{brand.mark}</span>
              </div>
              <p className="mt-4 text-lg font-bold">{name}</p>
              <p className="mt-1 flex-1 text-sm opacity-75">{blurb}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="font-bold tabular-nums">{price}</span>
                <button type="button" onClick={() => { setCart((c) => [...c, name]); toast(`${name} added to cart`); }} className="rounded-full px-4 py-2 text-sm font-bold transition-transform active:scale-95" style={{ background: fg, color: bg }}>
                  Add
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 py-14" style={{ background: fg, color: bg }}>
        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
          {brand.benefits.map((b, i) => (
            <div key={b}>
              <p className="text-5xl tabular-nums opacity-30" style={display}>0{i + 1}</p>
              <p className="mt-2 text-2xl" style={display}>{b}</p>
              <p className="mt-2 text-sm opacity-75">{brand.bodies[(i + 1) % brand.bodies.length]}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="reviews" className="mx-auto max-w-5xl px-5 py-16">
        <h2 className="text-4xl" style={display}>People are saying things</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {content.testimonials.map((t) => (
            <figure key={t.name + t.quote} className="rounded-3xl border p-5" style={{ borderColor: `${fg}26` }}>
              <div className="flex gap-0.5" aria-label={`${t.stars} stars`}>
                {Array.from({ length: 5 }, (_, i) => <Star key={i} className="h-4 w-4" fill={i < t.stars ? "currentColor" : "none"} />)}
              </div>
              <blockquote className="mt-3 text-[15px] leading-relaxed">"{t.quote}"</blockquote>
              <figcaption className="mt-3 text-sm opacity-60">{t.name} · Verified-ish buyer</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-3xl px-5 pb-16">
        <h2 className="text-4xl" style={display}>Questions</h2>
        <div className="mt-6 divide-y" style={{ borderColor: `${fg}1f` }}>
          {content.faq.map((f, i) => (
            <div key={f.q} style={{ borderColor: `${fg}1f` }}>
              <button type="button" onClick={() => setFaqOpen(faqOpen === i ? null : i)} className="flex w-full items-center justify-between gap-4 py-4 text-left font-semibold" aria-expanded={faqOpen === i}>
                {f.q}
                <ChevronDown className="h-5 w-5 shrink-0 transition-transform" style={{ transform: faqOpen === i ? "rotate(180deg)" : undefined }} />
              </button>
              {faqOpen === i && <p className="pb-4 text-sm opacity-75">{f.a}</p>}
            </div>
          ))}
        </div>
      </section>

      <section id="about" className="px-5 py-16" style={{ background: `${fg}0d` }}>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-4xl" style={display}>Our story</h2>
          <p className="mt-4 text-lg opacity-80">{brand.about}</p>
          <form className="mx-auto mt-8 flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); if (!email.trim()) return; toast(`Subscribed. ${brand.name} will now email you in your imagination.`); setEmail(""); }}>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.sim" aria-label="Email" className="h-12 flex-1 rounded-full border bg-transparent px-5 outline-none" style={{ borderColor: `${fg}40` }} />
            <button type="submit" className="h-12 rounded-full px-5 font-bold" style={{ background: fg, color: bg }}>Join the list</button>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-60">Friends of {brand.name}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {content.partners.map((p) => (
            <Link key={p.slug} to={`/w/${worldId}/site/${p.slug}`} className="flex items-center gap-3 rounded-2xl border p-3 transition-transform hover:-translate-y-0.5" style={{ borderColor: `${fg}26` }}>
              <BrandMark brand={p} size={36} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{p.name}</span>
                <span className="block truncate text-xs opacity-60">{p.tag}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t px-5 py-10 text-xs opacity-60" style={{ borderColor: `${fg}1f` }}>
        <div className="mx-auto max-w-5xl space-y-2">
          <p>{brand.fine}</p>
          <p>© {new Date().getFullYear()} {brand.name}. A fictional company inside AFTERFAME. Nothing on this page is for sale.</p>
          <Link to={`/w/${worldId}/site`} className="underline">Browse the rest of the simulated web</Link>
        </div>
      </footer>

      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setCartOpen(false)}>
          <aside className="flex h-full w-full max-w-sm flex-col p-6 animate-in slide-in-from-right" style={{ background: bg, color: fg }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-2xl" style={display}>Your cart</p>
              <button type="button" onClick={() => setCartOpen(false)} aria-label="Close cart"><X /></button>
            </div>
            <div className="mt-6 flex-1 space-y-3 overflow-y-auto">
              {cart.length === 0 && <p className="opacity-60">Empty. Like the promises in our ads.</p>}
              {cart.map((n, i) => (
                <div key={`${n}${i}`} className="flex items-center justify-between rounded-2xl border p-3" style={{ borderColor: `${fg}26` }}>
                  <span className="text-sm font-semibold">{n}</span>
                  <button type="button" className="text-xs underline opacity-70" onClick={() => setCart((c) => c.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
            </div>
            <div className="border-t pt-4" style={{ borderColor: `${fg}26` }}>
              <div className="flex justify-between font-bold tabular-nums"><span>Total</span><span>${total.toFixed(2)}</span></div>
              <button
                type="button"
                disabled={!cart.length}
                onClick={() => { toast(DECLINES[Math.floor(Math.random() * DECLINES.length)]); setCart([]); setCartOpen(false); }}
                className="mt-4 h-12 w-full rounded-full font-bold disabled:opacity-40"
                style={{ background: fg, color: bg }}
              >
                Checkout
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function BrowserBar({ brand, onBack }: { brand: Brand | null; onBack: () => void }) {
  return (
    <div className="sticky top-0 z-30 flex h-[52px] items-center gap-2 border-b border-border bg-background px-3 text-foreground">
      <button type="button" onClick={onBack} className="rounded-full p-2 hover:bg-elevated" aria-label="Back to AFTERFAME">
        <ArrowLeft className="h-5 w-5" />
      </button>
      <button type="button" onClick={() => window.location.reload()} className="hidden rounded-full p-2 hover:bg-elevated sm:block" aria-label="Reload">
        <RotateCw className="h-4 w-4" />
      </button>
      <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-elevated px-4 text-sm">
        <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{brand ? fakeDomain(brand) : "directory.sim"}</span>
      </div>
      <span className="hidden rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:inline">Fictional site</span>
    </div>
  );
}

function SiteDirectory({ worldId, missing }: { worldId: string; missing: string }) {
  const navigate = useNavigate();
  const [q, setQ] = useState<string>("");
  useEffect(() => ensureBrandFonts(), []);
  const list = BRANDS.filter((b) => !q || `${b.name} ${b.tag} ${b.cat}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <BrowserBar brand={null} onBack={() => navigate(`/w/${worldId}`)} />
      <div className="mx-auto max-w-4xl px-5 py-10">
        {missing && <p className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">That site went out of business. Try one of these instead.</p>}
        <h1 className="font-display text-4xl font-black tracking-tight">The simulated web</h1>
        <p className="mt-2 text-muted-foreground">{BRANDS.length} fictional companies advertising in your world. None of them are real, and nothing can be bought.</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sites" aria-label="Search sites" className="mt-6 h-11 w-full rounded-full border border-border bg-card px-5 outline-none focus:border-brand" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {list.map((b) => (
            <Link key={b.slug} to={`/w/${worldId}/site/${b.slug}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-colors hover:border-brand">
              <BrandMark brand={b} size={44} />
              <span className="min-w-0">
                <span className="block truncate font-bold">{b.name}</span>
                <span className="block truncate text-sm text-muted-foreground">{b.tag}</span>
                <span className="block truncate text-xs text-muted-foreground">{fakeDomain(b)}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
