import { useState } from "react";
import {
  RiCheckLine as Check,
  RiLoader4Line as LoaderCircle,
  RiLockPasswordLine as LockPasswordLine,
  RiMoonLine as MoonLine,
} from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import AvatarUpload from "../components/AvatarUpload";
import { settings } from "../api/client";
import { useToast } from "../components/ui/toast";
import type { UserProfile } from "../types";

export default function SettingsPage({
  darkMode,
  onThemeChange,
  profile,
  onProfileChange,
}: {
  darkMode: boolean;
  onThemeChange: (value: boolean) => void;
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
}) {
  const { success: notifySuccess, error: notifyError } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [saving, setSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const saveProfile = async () => {
    setProfileSaving(true);
    try {
      const updated = await settings.updateProfile({ name, avatar });
      onProfileChange(updated);
      notifySuccess("Profile updated");
    } catch (e: any) {
      notifyError("Could not update profile", e.message);
    } finally {
      setProfileSaving(false);
    }
  };
  const submit = async () => {
    setError(null);
    setSuccess(null);
    if (!current) return setError("Current password is required.");
    if (next.length < 4)
      return setError("New password must be at least 4 characters.");
    if (next !== confirm) return setError("Passwords do not match.");
    setSaving(true);
    try {
      const result = await settings.changePassword(current, next);
      setSuccess(result.message);
      notifySuccess("Password changed");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not change password", e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="w-full space-y-6 p-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Settings
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <AvatarUpload value={avatar} name={name} onChange={setAvatar} />
          <div className="space-y-2">
            <Label htmlFor="profile-name">Display name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
            />
          </div>
          <Button
            onClick={saveProfile}
            disabled={profileSaving || !name.trim()}
          >
            {profileSaving ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Save profile
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MoonLine className="size-7 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">Dark mode</div>
                <div className="text-xs text-muted-foreground">
                  {darkMode
                    ? "Dark theme is enabled"
                    : "Light theme is enabled"}
                </div>
              </div>
            </div>
            <Switch
              checked={darkMode}
              onCheckedChange={onThemeChange}
              aria-label="Toggle dark mode"
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Change panel password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <div className="relative">
              <LockPasswordLine className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="current-password"
                type="password"
                className="pl-9"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <div className="relative">
              <LockPasswordLine className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="new-password"
                type="password"
                className="pl-9"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Minimum 4 characters.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <div className="relative">
              <LockPasswordLine className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="confirm-password"
                type="password"
                className="pl-9"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}
          <Button onClick={submit} disabled={saving}>
            {saving ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Update password
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
