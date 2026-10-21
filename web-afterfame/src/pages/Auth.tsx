import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string(),
});
type Form = z.infer<typeof schema>;

type Mode = "signin" | "signup" | "forgot";

export default function Auth() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "signin");
  const [busy, setBusy] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { session } = useAuth();
  const navigate = useNavigate();
  const next = params.get("next") ?? "/worlds";
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  if (session) return <Navigate to={next} replace />;

  const onSubmit = async (v: Form) => {
    if (mode !== "forgot" && v.password.length < 8) {
      form.setError("password", { message: "At least 8 characters" });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(v.email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setNotice("If that email has an account, a reset link is on its way.");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: v.email, password: v.password, options: { emailRedirectTo: `${window.location.origin}/worlds` } });
        if (error) throw error;
        if (!data.session) setNotice("Check your email to verify your account, then sign in.");
        else navigate("/worlds/new");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: v.email, password: v.password });
        if (error) throw error;
        navigate(next);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg.includes("Invalid login") ? "Email or password is incorrect." : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative grid min-h-dvh place-items-center px-5 py-10">
      <div className="grain pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative w-full max-w-sm">
        <Link to="/" className="mb-8 block">
          <Logo />
        </Link>
        <div className="panel p-6">
          {mode !== "forgot" && (
            <div role="tablist" className="mb-5 grid grid-cols-2 rounded-xl bg-background p-1 ring-1 ring-border">
              {(["signin", "signup"] as const).map((m) => (
                <button key={m} role="tab" type="button" aria-selected={mode === m} onClick={() => setMode(m)} className={cn("rounded-lg py-2 text-sm font-medium transition-colors", mode === m ? "bg-elevated text-foreground" : "text-muted-foreground")}>
                  {m === "signin" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>
          )}
          {mode === "forgot" && <h1 className="mb-4 text-xl font-bold">Reset password</h1>}
          {!isSupabaseConfigured && <p className="mb-4 rounded-lg bg-infamy/10 p-3 text-sm text-infamy">Backend is not configured. Set the Supabase environment variables.</p>}
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" {...form.register("email")} aria-invalid={!!form.formState.errors.email} />
              {form.formState.errors.email && <p className="text-sm text-infamy">{form.formState.errors.email.message}</p>}
            </div>
            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "signin" && (
                    <button type="button" onClick={() => setMode("forgot")} className="text-xs text-muted-foreground hover:text-foreground">
                      Forgot?
                    </button>
                  )}
                </div>
                <Input id="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} {...form.register("password")} aria-invalid={!!form.formState.errors.password} />
                {form.formState.errors.password && <p className="text-sm text-infamy">{form.formState.errors.password.message}</p>}
              </div>
            )}
            {notice && <p role="status" className="rounded-lg bg-brand/10 p-3 text-sm text-brand">{notice}</p>}
            <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl font-bold">
              {busy && <Loader2 className="animate-spin" />}
              {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
            </Button>
            {mode === "forgot" && (
              <button type="button" onClick={() => setMode("signin")} className="w-full text-sm text-muted-foreground hover:text-foreground">
                Back to sign in
              </button>
            )}
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">AFTERFAME is a game. All other accounts are fictional simulations.</p>
      </div>
    </div>
  );
}
