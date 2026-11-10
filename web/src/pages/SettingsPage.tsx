import { useState, useEffect } from "react";
import {
  RiCheckLine as Check,
  RiLoader4Line as LoaderCircle,
  RiLockPasswordLine as LockPasswordLine,
  RiMoonLine as MoonLine,
  RiRobot2Line as RobotLine,
  RiUserLine as UserLine,
  RiShieldLine as ShieldLine,
  RiPuzzle2Line as PuzzleLine,
  RiBubbleChartLine as CavemanLine,
} from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs } from "@/components/ui/tabs";
import type { Tab } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import AvatarUpload from "../components/AvatarUpload";
import { settings, models, rtk, caveman } from "../api/client";
import { useToast } from "../components/ui/toast";
import type { UserProfile, RtkStatus, CavemanStatus } from "../types";
import { modelDisplayId, modelPublicId } from "../lib/model-id";
import GuardrailsTab from "../components/guardrails/GuardrailsTab";

const tabs: Tab[] = [
  { id: "general", label: "General" },
  { id: "chat", label: "Chat" },
  { id: "guardrails", label: "Guardrails" },
  { id: "plugins", label: "Plugins" },
  { id: "security", label: "Security" },
];

const CAVEMAN_LEVELS = [
  {
    id: "caveman",
    label: "caveman",
    desc: "Default terse mode. Drops filler words and pleasantries, preserves technical substance.",
  },
  {
    id: "ultracave",
    label: "ultracave",
    desc: "Aggressive token compression with sentence fragments (~35% extra savings).",
  },
  {
    id: "megacave",
    label: "megacave",
    desc: "Classical Chinese (文言文) concise grammar with particle-based structure.",
  },
] as const;

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
  const [activeTab, setActiveTab] = useState("general");

  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [profileSaving, setProfileSaving] = useState(false);
  const [chatTitleModel, setChatTitleModel] = useState("auto");
  const [persistModelPerChat, setPersistModelPerChat] = useState(false);
  const [chatTitleModels, setChatTitleModels] = useState<import("../types").ModelWithProvider[]>([]);
  const [chatSaving, setChatSaving] = useState(false);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [rtkStatus, setRtkStatus] = useState<RtkStatus | null>(null);
  const [rtkLoading, setRtkLoading] = useState(false);
  const [rtkToggling, setRtkToggling] = useState(false);

  const [cavemanStatus, setCavemanStatus] = useState<CavemanStatus | null>(null);
  const [cavemanToggling, setCavemanToggling] = useState(false);
  const [cavemanLoading, setCavemanLoading] = useState(false);

  useEffect(() => {
    settings.chat().then((value) => {
      setChatTitleModel(value.chat_title_model);
      setPersistModelPerChat(value.persist_model_per_chat);
    }).catch(() => {});
    models.listAll().then(setChatTitleModels).catch(() => {});
  }, []);

  useEffect(() => {
    rtk.status().then(setRtkStatus).catch(() => {});
    caveman.status().then(setCavemanStatus).catch(() => {});
  }, []);

  const saveChatSettings = async () => {
    setChatSaving(true);
    try {
      await settings.updateChat({
        chat_title_model: chatTitleModel,
        persist_model_per_chat: persistModelPerChat,
      });
      notifySuccess("Chat settings updated");
    } catch (e: any) {
      notifyError("Could not update chat settings", e.message);
    } finally {
      setChatSaving(false);
    }
  };

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

  const toggleRtk = async () => {
    setRtkToggling(true);
    try {
      if (rtkStatus?.enabled) {
        await rtk.disable();
        notifySuccess("RTK disabled");
      } else {
        await rtk.enable();
        notifySuccess("RTK enabled");
      }
      const status = await rtk.status();
      setRtkStatus(status);
    } catch (e: any) {
      notifyError("RTK toggle failed", e.message);
    } finally {
      setRtkToggling(false);
    }
  };

  const installRtk = async () => {
    setRtkLoading(true);
    try {
      const result = await rtk.install();
      if (result.success) {
        notifySuccess("RTK binary installed");
        const status = await rtk.status();
        setRtkStatus(status);
      }
    } catch (e: any) {
      notifyError("RTK install failed", e.message);
    } finally {
      setRtkLoading(false);
    }
  };

  const updateRtk = async () => {
    setRtkLoading(true);
    try {
      const result = await rtk.update();
      notifySuccess(result.message || "RTK updated");
      const status = await rtk.status();
      setRtkStatus(status);
    } catch (e: any) {
      notifyError("RTK update failed", e.message);
    } finally {
      setRtkLoading(false);
    }
  };

  const toggleCaveman = async () => {
    setCavemanToggling(true);
    try {
      if (cavemanStatus?.enabled) {
        await caveman.disable();
        notifySuccess("Caveman disabled");
      } else {
        const result = await caveman.enable();
        notifySuccess("Caveman enabled");
      }
      const status = await caveman.status();
      setCavemanStatus(status);
    } catch (e: any) {
      notifyError("Caveman toggle failed", e.message);
    } finally {
      setCavemanToggling(false);
    }
  };

  const changeCavemanLevel = async (level: string) => {
    try {
      const result = await caveman.setLevel(level);
      const status = await caveman.status();
      setCavemanStatus(status);
      notifySuccess(`Caveman level: ${level}`);
    } catch (e: any) {
      notifyError("Failed to change level", e.message);
    }
  };

  const installCaveman = async () => {
    setCavemanLoading(true);
    try {
      await caveman.install();
      notifySuccess("Caveman skill installed");
      const status = await caveman.status();
      setCavemanStatus(status);
    } catch (e: any) {
      notifyError("Caveman install failed", e.message);
    } finally {
      setCavemanLoading(false);
    }
  };

  const updateCaveman = async () => {
    setCavemanLoading(true);
    try {
      const result = await caveman.update();
      notifySuccess(result.message || "Caveman updated");
      const status = await caveman.status();
      setCavemanStatus(status);
    } catch (e: any) {
      notifyError("Caveman update failed", e.message);
    } finally {
      setCavemanLoading(false);
    }
  };

  return (
    <div className="w-full space-y-6 p-6">
      <h1 className="text-2xl font-normal tracking-tight text-foreground">
        Settings
      </h1>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "general" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <UserLine className="size-5" />
                  Profile
                </CardTitle>
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
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <AvatarUpload value={avatar} name={name} onChange={setAvatar} label="Profile avatar" fallback="user" onError={(message) => notifyError("Invalid avatar", message)} />
              <div className="space-y-2">
                <Label htmlFor="profile-name">Display name</Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MoonLine className="size-5" />
                Appearance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="text-sm font-normal text-foreground">Dark mode</div>
                    <div className="text-xs text-tertiary">
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
        </div>
      )}

      {activeTab === "chat" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><RobotLine className="size-5" />Chat titles</CardTitle>
                <Button onClick={saveChatSettings} disabled={chatSaving}>
                  {chatSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Save
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="chat-title-model">Title generation model</Label>
                <p className="mt-1 text-xs text-tertiary">
                  Choose which model creates titles for new conversations.
                </p>
              </div>
              <select id="chat-title-model" value={chatTitleModel} onChange={(event) => setChatTitleModel(event.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground transition-colors outline-none hover:border-border-strong focus-visible:border-border-strong focus-visible:bg-card">
                <option value="auto">Auto (active model)</option>
                {chatTitleModels.map((model) => {
                  const id = model.model_pool ? `pool/${model.pretty_id || model.model_id}` : modelPublicId(model);
                  return <option key={id} value={id}>{model.display_name || modelDisplayId(model)} ({model.model_pool ? "Compound model" : model.provider_name})</option>;
                })}
              </select>
              <p className="text-xs text-tertiary">Titles are generated after the first message and never replace a custom title.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Model selection</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="persist-model-per-chat">Remember the model for each chat</Label>
                  <p className="text-xs text-tertiary">
                    Keep each conversation's last selected model instead of using one global model.
                  </p>
                </div>
                <Switch
                  id="persist-model-per-chat"
                  checked={persistModelPerChat}
                  onCheckedChange={setPersistModelPerChat}
                  aria-label="Remember the model for each chat"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "guardrails" && <GuardrailsTab />}

      {activeTab === "plugins" && (
        <div className="space-y-6">  
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PuzzleLine className="size-5" />
              <span>RTK (Rust Token Killer)</span>
              {rtkStatus?.installed && rtkStatus?.latestVersion && !rtkStatus?.updateAvailable && (
                <span className="text-xs font-normal text-tertiary">
                  Latest: {rtkStatus.latestVersion} — up to date
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <RobotLine className="size-7 text-tertiary" />
                <div>
                  <div className="text-sm font-normal text-foreground">
                    {rtkStatus?.enabled ? "Enabled" : "Disabled"}
                  </div>
                  <div className="text-xs text-tertiary">
                    {rtkStatus?.installed
                      ? rtkStatus.version
                        ? `v${rtkStatus.version.replace(/^rtk\s*/, "")}`
                        : "Installed"
                      : "Not installed"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {rtkStatus?.installed === false && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={installRtk}
                    disabled={rtkLoading}
                  >
                    {rtkLoading ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      "Install"
                    )}
                  </Button>
                )}
                {rtkStatus?.installed && rtkStatus?.updateAvailable && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={updateRtk}
                    disabled={rtkLoading}
                  >
                    {rtkLoading ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      `Update to ${rtkStatus.latestVersion}`
                    )}
                  </Button>
                )}
                <Switch
                  checked={rtkStatus?.enabled ?? false}
                  onCheckedChange={toggleRtk}
                  disabled={rtkToggling || !rtkStatus?.installed}
                  aria-label="Toggle RTK"
                />
              </div>
            </div>
            {rtkStatus?.platform && rtkStatus?.arch && (
              <Separator />
            )}
            {rtkStatus?.platform && rtkStatus?.arch && (
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-tertiary">
                <span>Platform: {rtkStatus.platform}-{rtkStatus.arch}</span>
                 <span>Mode: proxy tool output</span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CavemanLine className="size-5" />
              <span>Caveman</span>
              {cavemanStatus?.installed && cavemanStatus?.latestVersion && !cavemanStatus?.updateAvailable && (
                <span className="text-xs font-normal text-tertiary">
                  Latest: {cavemanStatus.latestVersion} — up to date
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-normal text-foreground">
                  {cavemanStatus?.enabled ? "Enabled" : "Disabled"}
                </div>
                <div className="text-xs text-tertiary">
                  {cavemanStatus?.installed
                    ? cavemanStatus.version
                      ? `${cavemanStatus.version}`
                      : "Installed"
                    : "Not installed"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {cavemanStatus?.installed === false && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={installCaveman}
                    disabled={cavemanLoading}
                  >
                    {cavemanLoading ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      "Install"
                    )}
                  </Button>
                )}
                {cavemanStatus?.installed && cavemanStatus?.updateAvailable && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={updateCaveman}
                    disabled={cavemanLoading}
                  >
                    {cavemanLoading ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      `Update to ${cavemanStatus.latestVersion}`
                    )}
                  </Button>
                )}
                <Switch
                  checked={cavemanStatus?.enabled ?? false}
                  onCheckedChange={toggleCaveman}
                  disabled={cavemanToggling || !cavemanStatus?.installed}
                  aria-label="Toggle Caveman"
                />
              </div>
            </div>
            {cavemanStatus?.installed && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label>Compression level</Label>
                  <div className={cn("flex flex-wrap gap-2", !cavemanStatus?.enabled && "pointer-events-none opacity-50")}>
                    {CAVEMAN_LEVELS.map((lvl) => {
                      const isSelected =
                        cavemanStatus?.level === lvl.id ||
                        (lvl.id === "caveman" && (cavemanStatus?.level === "lite" || cavemanStatus?.level === "full")) ||
                        (lvl.id === "ultracave" && cavemanStatus?.level === "ultra") ||
                        (lvl.id === "megacave" && (cavemanStatus?.level === "wenyan" || cavemanStatus?.level === "wenyan-lite" || cavemanStatus?.level === "wenyan-full" || cavemanStatus?.level === "wenyan-ultra"));
                      return (
                        <Button
                          key={lvl.id}
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          onClick={() => changeCavemanLevel(lvl.id)}
                        >
                          {lvl.label}
                        </Button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-tertiary">
                    {!cavemanStatus?.enabled
                      ? "Enable Caveman to change level"
                      : CAVEMAN_LEVELS.find((l) =>
                          cavemanStatus?.level === l.id ||
                          (l.id === "caveman" && (cavemanStatus?.level === "lite" || cavemanStatus?.level === "full")) ||
                          (l.id === "ultracave" && cavemanStatus?.level === "ultra") ||
                          (l.id === "megacave" && (cavemanStatus?.level === "wenyan" || cavemanStatus?.level === "wenyan-lite" || cavemanStatus?.level === "wenyan-full" || cavemanStatus?.level === "wenyan-ultra"))
                        )?.desc}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        </div>
      )}

      {activeTab === "security" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ShieldLine className="size-5" />
                Change panel password
              </CardTitle>
              <Button onClick={submit} disabled={saving}>
                {saving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Update password
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <div className="relative">
                <LockPasswordLine className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tertiary" />
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
                <LockPasswordLine className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tertiary" />
                <Input
                  id="new-password"
                  type="password"
                  className="pl-9"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
              </div>
              <p className="text-xs text-tertiary">
                Minimum 4 characters.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <div className="relative">
                <LockPasswordLine className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tertiary" />
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
