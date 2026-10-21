import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

export default function ResetPassword() {
  const { session, setRecovering } = useAuth();
  const [password, setPassword] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Use at least 8 characters.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    setRecovering(false);
    toast("Password updated");
    navigate("/worlds");
  };

  return (
    <div className="grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-sm">
        <Logo className="mb-8" />
        <div className="panel p-6">
          <h1 className="mb-4 text-xl font-bold">Choose a new password</h1>
          {!session ? (
            <p className="text-sm text-muted-foreground">
              This reset link is invalid or expired. <Link to="/auth" className="text-brand hover:underline">Request a new one</Link>.
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="np">New password</Label>
                <Input id="np" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" disabled={busy} className="w-full font-bold">
                {busy && <Loader2 className="animate-spin" />} Update password
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
