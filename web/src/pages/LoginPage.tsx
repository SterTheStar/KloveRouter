import { useState, type FormEvent } from "react";
import { RiArrowRightLine as ArrowRight } from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SaturnMark from "@/components/SaturnMark";

export default function LoginPage({
  onLogin,
  error,
  loading,
}: {
  onLogin: (password: string) => Promise<boolean>;
  error: string | null;
  loading: boolean;
}) {
  const [password, setPassword] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onLogin(password);
  };

  return (
    <main className="flex min-h-svh flex-col bg-background">
      <header className="flex h-20 items-center px-6 sm:px-10 lg:px-14">
        <div className="flex items-center gap-3">
          <SaturnMark className="size-7 text-foreground" />
          <span className="font-heading text-xl font-semibold tracking-tight">
            Saturn
          </span>
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center px-6 pb-10 sm:px-10">
        <section className="w-full max-w-[360px] text-center">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            Welcome back
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Sign in to access your control panel.
          </p>
          <form onSubmit={submit} className="mt-8 space-y-5 text-left">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                className="h-10"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoFocus
                required
                placeholder="Enter your password"
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button
              className="h-10 w-full justify-between"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                "Signing in..."
              ) : (
                <>
                  <span>Sign in</span>
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>
          <p className="mt-8 text-xs text-tertiary">
            Your session is private and protected.
          </p>
        </section>
      </div>
      <footer className="flex h-14 items-center justify-center px-6 text-xs text-muted-foreground">
        Made by{" "}
        <a
          className="mx-1 underline underline-offset-4 transition-colors hover:text-foreground"
          href="https://github.com/SterTheStar"
          target="_blank"
          rel="noreferrer"
        >
          Esther
        </a>{" "}
        with &lt;3
      </footer>
    </main>
  );
}
