import { useState, type FormEvent } from "react";
import { RiLock2Line as LockKeyhole } from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage({ onLogin, error, loading }: { onLogin: (password: string) => Promise<boolean>; error: string | null; loading: boolean }) {
  const [password, setPassword] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); await onLogin(password); };
  return <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-sm"><CardHeader className="items-center text-center"><div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground"><LockKeyhole className="size-6" /></div><CardTitle className="font-heading text-2xl">Klove</CardTitle><CardDescription>AI Router Panel</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="space-y-4"><div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required placeholder="Enter panel password" /></div>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<Button className="w-full" type="submit" disabled={loading}>{loading ? "Authenticating..." : "Enter panel"}</Button></form></CardContent></Card></div>;
}
