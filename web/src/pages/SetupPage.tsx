import { useState, type FormEvent } from "react";
import { RiArrowRightLine as ArrowRight } from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SetupPage({
  onComplete,
}: {
  onComplete: (data: { name: string; password: string; confirm_password: string }) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 12) return setError("Password must be at least 12 characters");
    if (password !== confirmPassword) return setError("Passwords do not match");
    setLoading(true);
    const result = await onComplete({ name, password, confirm_password: confirmPassword });
    setLoading(false);
    if (result) setError(result);
  };
  return (
    <main className="flex min-h-svh flex-col bg-background">
      <header className="flex h-20 items-center px-6 sm:px-10 lg:px-14">
        <span className="font-heading text-xl font-semibold tracking-tight">Klove</span>
      </header>
      <div className="flex flex-1 items-center justify-center px-6 pb-10 sm:px-10">
        <section className="w-full max-w-[360px] text-center">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Set up Klove</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Create your profile and secure admin password.</p>
          <form onSubmit={submit} className="mt-8 space-y-5 text-left">
            <div className="space-y-2"><Label htmlFor="name">Name</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></div>
            <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="confirm-password">Confirm password</Label><Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></div>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <Button className="h-10 w-full justify-between" type="submit" disabled={loading}>{loading ? "Saving..." : <><span>Finish setup</span><ArrowRight className="size-4" /></>}</Button>
          </form>
          <p className="mt-8 text-xs text-muted-foreground">You will continue to sign in after setup.</p>
        </section>
      </div>
    </main>
  );
}
