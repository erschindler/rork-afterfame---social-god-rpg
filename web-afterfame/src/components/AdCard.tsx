import { EyeOff, Info, MoreHorizontal, ExternalLink } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FONT_FAMILY, ensureBrandFonts, fakeDomain, hideBrand, whyThisAd, type AdView, type Brand } from "@/lib/ads";
import { topicName } from "@/lib/topics";
import { useWorld } from "@/providers/WorldProvider";

export function BrandMark({ brand, size = 44 }: { brand: Brand; size?: number }) {
  const [bg, , accent] = brand.c;
  return (
    <span
      className="grid shrink-0 place-items-center rounded-xl font-bold leading-none"
      style={{ width: size, height: size, background: accent, color: bg, fontFamily: FONT_FAMILY[brand.font], fontSize: size * (brand.mark.length > 2 ? 0.3 : 0.42) }}
      aria-hidden
    >
      {brand.mark}
    </span>
  );
}

/** A promoted post from a fictional advertiser, linking to its fake website. */
export const AdCard = memo(function AdCard({ ad, onHide }: { ad: AdView; onHide: () => void }) {
  const { base, player } = useWorld();
  const navigate = useNavigate();
  const [why, setWhy] = useState<boolean>(false);
  const b = ad.brand;
  const [bg, fg, accent] = b.c;
  const href = `${base}/site/${b.slug}?p=${encodeURIComponent(ad.product[0])}`;

  useEffect(() => ensureBrandFonts(), []);

  return (
    <article className="group relative border-b border-border px-4 py-3 transition-colors hover:bg-elevated/30" aria-label={`Promoted by ${b.name}`}>
      <div className="flex gap-3">
        <BrandMark brand={b} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[15px]">
            <button type="button" onClick={() => navigate(href)} className="truncate font-bold hover:underline">{b.name}</button>
            <span className="truncate text-muted-foreground">{fakeDomain(b)}</span>
            <DropdownMenu>
              <DropdownMenuTrigger className="ml-auto rounded-full p-1.5 text-muted-foreground hover:bg-elevated hover:text-foreground" aria-label="Ad options">
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setWhy(true)}><Info /> Why am I seeing this ad?</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { onHide(); toast("Ad hidden"); }}><EyeOff /> Hide this ad</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { hideBrand(b.slug); onHide(); toast(`You won't see ads from ${b.name}`); }}><EyeOff /> Hide all from {b.name}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p className="mt-0.5 text-[15px] leading-snug">{ad.body}</p>

          <button
            type="button"
            onClick={() => navigate(href)}
            className="mt-2.5 block w-full overflow-hidden rounded-2xl border border-border text-left transition-transform active:scale-[0.99]"
          >
            <div className="relative px-5 py-6" style={{ background: bg, color: fg }}>
              <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full opacity-90" style={{ background: accent === fg ? `${fg}22` : accent }} aria-hidden />
              <p className="relative text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">{b.tag}</p>
              <p className="relative mt-2 max-w-[85%] text-[26px] leading-[1.05]" style={{ fontFamily: FONT_FAMILY[b.font], fontWeight: 800 }}>{ad.headline}</p>
              <div className="relative mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{ad.product[0]}</p>
                  <p className="text-xs opacity-70">{ad.product[2]}</p>
                </div>
                <span className="shrink-0 rounded-full px-3 py-1 text-sm font-bold tabular-nums" style={{ background: fg, color: bg }}>{ad.product[1]}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 bg-card px-4 py-2.5">
              <span className="truncate text-xs text-muted-foreground">{fakeDomain(b)}</span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground px-3 py-1 text-xs font-bold text-background">
                {ad.cta} <ExternalLink className="h-3 w-3" />
              </span>
            </div>
          </button>
          <p className="mt-1.5 text-xs text-muted-foreground">Promoted · Fictional ad</p>
        </div>
      </div>

      <Dialog open={why} onOpenChange={setWhy}>
        <DialogContent className="max-w-md rounded-2xl border-border bg-card">
          <DialogTitle>Why you're seeing this</DialogTitle>
          <DialogDescription>{b.name} wanted to reach people like you.</DialogDescription>
          <ul className="space-y-2 text-sm">
            {whyThisAd(b, player?.interests ?? [], topicName).map((l) => (
              <li key={l} className="rounded-xl bg-elevated px-3 py-2">{l}</li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </article>
  );
});
