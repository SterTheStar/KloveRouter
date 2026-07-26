import { useState, type FormEvent } from "react";
import { RiArrowRightLine as ArrowRight } from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function KloveMark() {
  return <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-7 text-foreground" aria-hidden="true"><path d="M5.6906 6.00001L3.16512 1.62576C4.50811 0.605527 6.18334 0 8 0C8.37684 0 8.74759 0.0260554 9.11056 0.076463L5.6906 6.00001Z" fill="currentColor" /><path d="M5.11325 9L1.69363 3.07705C0.632438 4.43453 0 6.14341 0 8C0 8.33866 0.0210434 8.67241 0.0618939 9H5.11325Z" fill="currentColor" /><path d="M4.89635 15.3757C2.93947 14.5512 1.37925 12.9707 0.581517 11H7.42265L4.89635 15.3757Z" fill="currentColor" /><path d="M8 16C7.62316 16 7.25241 15.9739 6.88944 15.9235L10.3094 10L12.8349 14.3742C11.4919 15.3945 9.81666 16 8 16Z" fill="currentColor" /><path d="M16 8C16 9.85659 15.3676 11.5655 14.3064 12.9229L10.8868 7H15.9381C15.979 7.32759 16 7.66134 16 8Z" fill="currentColor" /><path d="M11.1036 0.624326C13.0605 1.44877 14.6208 3.02927 15.4185 5H8.57735L11.1036 0.624326Z" fill="currentColor" /></svg>;
}

export default function LoginPage({ onLogin, error, loading }: { onLogin: (password: string) => Promise<boolean>; error: string | null; loading: boolean }) {
  const [password, setPassword] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); await onLogin(password); };

  return (
    <main className="flex min-h-svh flex-col bg-background">
      <header className="flex h-20 items-center px-6 sm:px-10 lg:px-14">
        <div className="flex items-center gap-3"><KloveMark /><span className="font-heading text-xl font-semibold tracking-tight">Klove</span></div>
      </header>
      <div className="flex flex-1 items-center justify-center px-6 pb-10 sm:px-10">
        <section className="w-full max-w-[360px] text-center">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in to access your control panel.</p>
          <form onSubmit={submit} className="mt-8 space-y-5 text-left">
            <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" className="h-10" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus required placeholder="Enter your password" /></div>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <Button className="h-10 w-full justify-between" type="submit" disabled={loading}>{loading ? "Signing in..." : <><span>Sign in</span><ArrowRight className="size-4" /></>}</Button>
          </form>
          <p className="mt-8 text-xs text-muted-foreground">Your session is private and protected.</p>
        </section>
      </div>
      <footer className="flex h-14 items-center justify-center px-6 text-xs text-muted-foreground">
        Made by <a className="mx-1 underline underline-offset-4 transition-colors hover:text-foreground" href="https://github.com/SterTheStar" target="_blank" rel="noreferrer">Esther</a> with &lt;3
      </footer>
    </main>
  );
}
