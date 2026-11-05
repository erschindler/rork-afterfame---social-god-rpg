import { Camera, Check, Dices, ImagePlus, Loader2, RotateCcw, Shuffle, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";

import { AVATAR_STYLES, Avatar, isPhotoAvatar, parseAvatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";

const rand = () => Math.random().toString(36).slice(2, 8);
const OUT = 512;
const VIEW = 260;

interface Props {
  value: string;
  onChange: (v: string) => void;
  size?: number;
  seedBase?: string;
}

/** Avatar preview with a quick shuffle and a full picker: 16 illustrated styles, or a cropped photo. */
export function AvatarPicker({ value, onChange, size = 80, seedBase = "me" }: Props) {
  const [open, setOpen] = useState<boolean>(false);
  const shuffle = () => {
    const { styleId } = isPhotoAvatar(value) ? { styleId: "notionists" } : parseAvatar(value);
    onChange(`${styleId}:${seedBase}-${rand()}`);
  };
  return (
    <div className="flex items-center gap-4">
      <button type="button" onClick={() => setOpen(true)} className="group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label="Change avatar">
        <Avatar seed={value} size={size} />
        <span className="absolute -bottom-0.5 -right-0.5 grid size-7 place-items-center rounded-full border-2 border-card bg-brand text-brand-foreground transition-transform group-hover:scale-110 group-active:scale-95">
          <Camera className="size-3.5" />
        </span>
      </button>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Change avatar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={shuffle}>
          <Dices /> Shuffle
        </Button>
      </div>
      <PickerDialog open={open} onOpenChange={setOpen} value={value} seedBase={seedBase} onPick={(v) => { onChange(v); setOpen(false); }} />
    </div>
  );
}

function PickerDialog({ open, onOpenChange, value, seedBase, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; value: string; seedBase: string; onPick: (v: string) => void }) {
  const [tab, setTab] = useState<"styles" | "photo">("styles");
  const initial = isPhotoAvatar(value) ? { styleId: "notionists", seed: `${seedBase}-${rand()}` } : parseAvatar(value);
  const [styleId, setStyleId] = useState<string>(initial.styleId);
  const [seeds, setSeeds] = useState<string[]>(() => [initial.seed, ...Array.from({ length: 11 }, () => `${seedBase}-${rand()}`)]);
  const [file, setFile] = useState<Blob | null>(null);
  const [camera, setCamera] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setCamera(false);
    }
  }, [open]);

  const reroll = () => setSeeds(Array.from({ length: 12 }, () => `${seedBase}-${rand()}`));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto rounded-2xl border-border bg-card">
        <DialogTitle>Choose your avatar</DialogTitle>
        <DialogDescription>Pick an illustrated look or use a photo of your own.</DialogDescription>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-elevated p-1" role="tablist">
          {(["styles", "photo"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn("rounded-lg py-2 text-sm font-semibold transition-colors", tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {t === "styles" ? "Illustrated" : "Photo"}
            </button>
          ))}
        </div>

        {tab === "styles" ? (
          <div className="space-y-4">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {AVATAR_STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStyleId(s.id)}
                  className={cn("flex shrink-0 flex-col items-center gap-1 rounded-xl border p-2 transition-colors", styleId === s.id ? "border-brand bg-brand/10" : "border-border hover:border-muted-foreground")}
                >
                  <Avatar seed={`${s.id}:${seeds[0]}`} size={44} />
                  <span className={cn("text-[11px] font-medium", styleId === s.id ? "text-brand" : "text-muted-foreground")}>{s.label}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-3">
              {seeds.map((sd) => {
                const ref = `${styleId}:${sd}`;
                const on = ref === value;
                return (
                  <button
                    key={sd}
                    type="button"
                    onClick={() => onPick(ref)}
                    className={cn("relative grid place-items-center rounded-2xl border p-2 transition-all hover:-translate-y-0.5 active:scale-95", on ? "border-brand" : "border-transparent hover:border-border")}
                    aria-label="Use this avatar"
                  >
                    <Avatar seed={ref} size={64} />
                    {on && (
                      <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-brand text-brand-foreground">
                        <Check className="size-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <Button type="button" variant="secondary" className="w-full" onClick={reroll}>
              <Shuffle /> More like this
            </Button>
          </div>
        ) : file ? (
          <Cropper blob={file} onCancel={() => setFile(null)} onDone={onPick} />
        ) : camera ? (
          <CameraCapture onCancel={() => setCamera(false)} onCapture={(b) => { setCamera(false); setFile(b); }} />
        ) : (
          <div className="space-y-3">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (!f.type.startsWith("image/")) return toast.error("That file isn't an image");
                if (f.size > 15 * 1024 * 1024) return toast.error("Image is too large (max 15 MB)");
                setFile(f);
              }}
            />
            <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full items-center gap-4 rounded-2xl border border-border p-4 text-left transition-colors hover:border-brand">
              <span className="grid size-11 place-items-center rounded-xl bg-brand/10 text-brand"><ImagePlus className="size-5" /></span>
              <span>
                <span className="block font-semibold">Upload from library</span>
                <span className="block text-sm text-muted-foreground">Camera roll, photos or files</span>
              </span>
            </button>
            <button type="button" onClick={() => setCamera(true)} className="flex w-full items-center gap-4 rounded-2xl border border-border p-4 text-left transition-colors hover:border-brand">
              <span className="grid size-11 place-items-center rounded-xl bg-brand/10 text-brand"><Camera className="size-5" /></span>
              <span>
                <span className="block font-semibold">Take a photo</span>
                <span className="block text-sm text-muted-foreground">Use your device camera</span>
              </span>
            </button>
            <p className="text-xs text-muted-foreground">Photos are cropped to a square and stored publicly so others in your worlds can see them.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CameraCapture({ onCancel, onCapture }: { onCancel: () => void; onCapture: (b: Blob) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "live" | "denied" | "none">("starting");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setState("none");
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setState("live");
      } catch (err) {
        const name = (err as { name?: string }).name;
        setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "none");
      }
    })();
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1); // keep the mirrored selfie the user saw
    ctx.drawImage(v, 0, 0);
    c.toBlob((b) => b && onCapture(b), "image/jpeg", 0.92);
  };

  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-2xl bg-elevated">
        <video ref={videoRef} playsInline muted className={cn("size-full -scale-x-100 object-cover", state !== "live" && "hidden")} />
        {state !== "live" && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
            {state === "starting" ? (
              <Loader2 className="animate-spin" />
            ) : state === "denied" ? (
              "Camera access is blocked. Allow it in your browser's site settings, or upload a photo instead."
            ) : (
              "No camera found on this device. Upload a photo instead."
            )}
          </div>
        )}
        {state === "live" && <div className="pointer-events-none absolute inset-6 rounded-full border-2 border-white/60" />}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
          <X /> Back
        </Button>
        <Button type="button" className="flex-1 font-bold" disabled={state !== "live"} onClick={snap}>
          <Camera /> Capture
        </Button>
      </div>
    </div>
  );
}

function Cropper({ blob, onCancel, onDone }: { blob: Blob; onCancel: () => void; onDone: (url: string) => void }) {
  const { user } = useAuth();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [busy, setBusy] = useState<boolean>(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(blob);
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () => toast.error("Couldn't read that image");
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  // base scale so the shorter side fills the viewport
  const base = img ? VIEW / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const w = img ? img.naturalWidth * base * zoom : VIEW;
  const h = img ? img.naturalHeight * base * zoom : VIEW;

  const clamp = useCallback(
    (p: { x: number; y: number }) => {
      const mx = Math.max(0, (w - VIEW) / 2);
      const my = Math.max(0, (h - VIEW) / 2);
      return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
    },
    [w, h],
  );

  useEffect(() => setPos((p) => clamp(p)), [clamp]);

  const onDown = (e: ReactPointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setPos(clamp({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }));
  };

  const save = async () => {
    if (!img || !user) return toast.error("Sign in to upload a photo");
    setBusy(true);
    try {
      const c = document.createElement("canvas");
      c.width = OUT;
      c.height = OUT;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      const k = OUT / VIEW;
      const left = (VIEW - w) / 2 + pos.x;
      const top = (VIEW - h) / 2 + pos.y;
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, OUT, OUT);
      ctx.drawImage(img, left * k, top * k, w * k, h * k);
      const out = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.86));
      if (!out) throw new Error("Couldn't encode image");
      const path = `${user.id}/${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("avatars").upload(path, out, { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      onDone(data.publicUrl);
      toast("Photo ready. Save to apply it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        className="relative mx-auto touch-none select-none overflow-hidden rounded-2xl bg-elevated"
        style={{ width: VIEW, height: VIEW, cursor: drag.current ? "grabbing" : "grab" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => setZoom((z) => Math.min(4, Math.max(1, z - e.deltaY * 0.002)))}
      >
        {img ? (
          <img
            src={img.src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{ width: w, height: h, left: (VIEW - w) / 2 + pos.x, top: (VIEW - h) / 2 + pos.y }}
          />
        ) : (
          <div className="grid size-full place-items-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
        )}
        <div className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }} />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">Zoom</span>
        <Slider value={[zoom]} min={1} max={4} step={0.01} onValueChange={(v) => setZoom(v[0] ?? 1)} className="flex-1" />
        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => { setZoom(1); setPos({ x: 0, y: 0 }); }} aria-label="Reset crop">
          <RotateCcw className="size-4" />
        </button>
      </div>
      <p className="text-center text-xs text-muted-foreground">Drag to position. Pinch, scroll or slide to zoom.</p>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel} disabled={busy}>
          <X /> Choose another
        </Button>
        <Button type="button" className="flex-1 font-bold" onClick={save} disabled={busy || !img}>
          {busy ? <Loader2 className="animate-spin" /> : <Check />} Use photo
        </Button>
      </div>
    </div>
  );
}
