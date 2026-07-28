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
  RiFileListLine as RiFileListLine,
  RiEditLine as RiEditLine,
  RiDeleteBinLine as RiDeleteBinLine,
  RiAddLine as RiAddLine,
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
import { settings, rtk, caveman, customSkills } from "../api/client";
import { useToast } from "../components/ui/toast";
import type { UserProfile, RtkStatus, CavemanStatus } from "../types";

const tabs: Tab[] = [
  { id: "general", label: "General" },
  { id: "plugins", label: "Plugins" },
  { id: "security", label: "Security" },
];

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

  const [customSkillList, setCustomSkillList] = useState<import("../types").CustomSkill[]>([]);
  const [showSkillDialog, setShowSkillDialog] = useState(false);
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [skillName, setSkillName] = useState("");
  const [skillContent, setSkillContent] = useState("");

  useEffect(() => {
    customSkills.list().then(setCustomSkillList).catch(() => {});
  }, []);

  useEffect(() => {
    rtk.status().then(setRtkStatus).catch(() => {});
    caveman.status().then(setCavemanStatus).catch(() => {});
  }, []);

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

  const toggleCustomSkill = async (id: string) => {
    try {
      const updated = await customSkills.toggle(id);
      setCustomSkillList((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_active: updated.is_active } : s)),
      );
    } catch (e: any) {
      notifyError("Toggle failed", e.message);
    }
  };

  const removeCustomSkill = async (id: string) => {
    try {
      await customSkills.remove(id);
      setCustomSkillList((prev) => prev.filter((s) => s.id !== id));
      notifySuccess("Skill removed");
    } catch (e: any) {
      notifyError("Remove failed", e.message);
    }
  };

  const saveCustomSkill = async () => {
    if (!skillName.trim() || !skillContent.trim()) return;
    try {
      if (editingSkill) {
        const updated = await customSkills.update(editingSkill, {
          name: skillName.trim(),
          content: skillContent,
        });
        setCustomSkillList((prev) => prev.map((s) => (s.id === editingSkill ? updated : s)));
        notifySuccess("Skill updated");
      } else {
        const created = await customSkills.create({ name: skillName.trim(), content: skillContent });
        setCustomSkillList((prev) => [...prev, created]);
        notifySuccess("Skill created");
      }
      setShowSkillDialog(false);
    } catch (e: any) {
      notifyError("Save failed", e.message);
    }
  };

  return (
    <div className="w-full space-y-6 p-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
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
        </div>
      )}

      {activeTab === "plugins" && (
        <>  
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PuzzleLine className="size-5" />
              <span>RTK (Rust Token Killer)</span>
              {rtkStatus?.installed && rtkStatus?.latestVersion && !rtkStatus?.updateAvailable && (
                <span className="text-xs font-normal text-muted-foreground">
                  Latest: {rtkStatus.latestVersion} — up to date
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <RobotLine className="size-7 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">
                    {rtkStatus?.enabled ? "Enabled" : "Disabled"}
                  </div>
                  <div className="text-xs text-muted-foreground">
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
                    className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
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
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
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
                <span className="text-xs font-normal text-muted-foreground">
                  Latest: {cavemanStatus.latestVersion} — up to date
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">
                  {cavemanStatus?.enabled ? "Enabled" : "Disabled"}
                </div>
                <div className="text-xs text-muted-foreground">
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
                    className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
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
                    {["lite", "full", "ultra", "wenyan-lite", "wenyan-full", "wenyan-ultra"].map((lvl) => (
                      <Button
                        key={lvl}
                        variant={cavemanStatus?.level === lvl ? "default" : "outline"}
                        size="sm"
                        onClick={() => changeCavemanLevel(lvl)}
                      >
                        {lvl}
                      </Button>
                    ))}
                  </div>
                  {!cavemanStatus?.enabled && (
                    <p className="text-xs text-muted-foreground">Enable Caveman to change level</p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RiFileListLine className="size-5" />
              Custom Skills
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {customSkillList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No custom skills yet.</p>
            ) : (
              customSkillList.map((skill) => (
                <div key={skill.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{skill.name}</span>
                      {skill.content && (
                        <span className="text-xs text-muted-foreground truncate">
                          {skill.content.split('\n')[0]}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        setEditingSkill(skill.id);
                        setSkillName(skill.name);
                        setSkillContent(skill.content);
                        setShowSkillDialog(true);
                      }}
                    >
                      <RiEditLine className="size-3.5" />
                    </Button>
                    <Switch
                      checked={skill.is_active}
                      onCheckedChange={() => toggleCustomSkill(skill.id)}
                      aria-label={`Toggle ${skill.name}`}
                    />
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => removeCustomSkill(skill.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <RiDeleteBinLine className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingSkill(null);
                setSkillName("");
                setSkillContent("");
                setShowSkillDialog(true);
              }}
            >
              <RiAddLine className="size-4" />
              Add skill
            </Button>
          </CardContent>
        </Card>
        </>
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
          </CardContent>
        </Card>
      )}

      <Dialog open={showSkillDialog} onOpenChange={setShowSkillDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSkill ? "Edit skill" : "New skill"}</DialogTitle>
            <DialogDescription>
              Write a custom system prompt skill. Active skills are injected into every proxy request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="skill-name">Name</Label>
              <Input
                id="skill-name"
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
                placeholder="My custom skill"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="skill-content">Content (markdown)</Label>
              <Textarea
                id="skill-content"
                value={skillContent}
                onChange={(e) => setSkillContent(e.target.value)}
                placeholder="You are an expert at..."
                rows={8}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSkillDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveCustomSkill} disabled={!skillName.trim() || !skillContent.trim()}>
              {editingSkill ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
