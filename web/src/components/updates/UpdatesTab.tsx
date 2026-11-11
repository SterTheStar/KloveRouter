import { useEffect, useState } from "react";
import {
  RiCheckLine as Check,
  RiDownload2Line as Download,
  RiExternalLinkLine as ExternalLink,
  RiGitBranchLine as GitBranch,
  RiLoader4Line as LoaderCircle,
  RiRefreshLine as Refresh,
  RiSettings4Line as SettingsIcon,
  RiSparklingLine as Sparkling,
} from "@remixicon/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { updates } from "@/api/client";
import type {
  AppUpdateStatusResponse,
  UpdateProgressState,
  UpdateSettings,
} from "@/types";
import UpdateProgressModal from "./UpdateProgressModal";
import MarkdownRenderer from "./MarkdownRenderer";

export default function UpdatesTab() {
  const { success: notifySuccess, error: notifyError, info: notifyInfo } = useToast();

  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [statusData, setStatusData] = useState<AppUpdateStatusResponse | null>(null);

  // Modal and updating state
  const [modalOpen, setModalOpen] = useState(false);
  const [progressState, setProgressState] = useState<UpdateProgressState>({
    status: "idle",
    step: "Ready",
    progress: 0,
    error: null,
    targetVersion: null,
    targetTag: null,
    startedAt: null,
    completedAt: null,
    logs: [],
  });

  // Settings
  const [autoCheck, setAutoCheck] = useState(true);
  const [includePrerelease, setIncludePrerelease] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchStatus = async () => {
    try {
      const data = await updates.status();
      setStatusData(data);
      setAutoCheck(data.settings.autoCheck);
      setIncludePrerelease(data.settings.includePrerelease);
      if (data.progress) {
        setProgressState(data.progress);
        if (
          data.progress.status === "downloading" ||
          data.progress.status === "installing_deps" ||
          data.progress.status === "building" ||
          data.progress.status === "ready_restart"
        ) {
          setModalOpen(true);
        }
      }
    } catch (e: any) {
      notifyError("Failed to load update status", e?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // Polling during active update
  useEffect(() => {
    let timer: NodeJS.Timeout;
    const isUpdating =
      progressState.status === "checking" ||
      progressState.status === "downloading" ||
      progressState.status === "installing_deps" ||
      progressState.status === "building";

    if (modalOpen && isUpdating) {
      timer = setInterval(async () => {
        try {
          const p = await updates.progress();
          setProgressState(p);
          if (p.status === "ready_restart" || p.status === "error") {
            clearInterval(timer);
            fetchStatus();
          }
        } catch {}
      }, 1500);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [modalOpen, progressState.status]);

  const handleCheckUpdates = async () => {
    setChecking(true);
    try {
      const result = await updates.check();
      setStatusData((prev) =>
        prev
          ? {
              ...prev,
              hasUpdate: result.hasUpdate,
              latestRelease: result.latestRelease,
              lastCheck: result.checkedAt,
              repo: result.repo,
            }
          : null,
      );

      if (result.hasUpdate && result.latestRelease) {
        notifySuccess(
          "Update available!",
          `Version ${result.latestRelease.tag} is ready to install.`,
        );
      } else {
        notifyInfo("Saturn Router is up to date.");
      }
    } catch (e: any) {
      notifyError("Failed to check for updates", e?.message);
    } finally {
      setChecking(false);
    }
  };

  const handleStartUpdate = async (releaseTag?: string) => {
    try {
      setModalOpen(true);
      const res = await updates.apply(releaseTag);
      if (res.progress) {
        setProgressState(res.progress);
      }
    } catch (e: any) {
      notifyError("Could not start update", e?.message);
    }
  };

  const handleRestart = async () => {
    await updates.restart();
  };

  const handleReset = async () => {
    const res = await updates.reset();
    setProgressState(res);
  };

  const handleSaveSettings = async (updatesPayload: Partial<UpdateSettings>) => {
    setSavingSettings(true);
    try {
      const updated = await updates.updateSettings(updatesPayload);
      setAutoCheck(updated.autoCheck);
      setIncludePrerelease(updated.includePrerelease);
      notifySuccess("Update settings saved");
    } catch (e: any) {
      notifyError("Failed to save update settings", e?.message);
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentVersion = statusData?.currentVersion || "0.1.2-beta";
  const hasUpdate = Boolean(statusData?.hasUpdate && statusData?.latestRelease);
  const latestRelease = statusData?.latestRelease;

  return (
    <div className="space-y-6">
      {/* Overview & Status Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="size-5" />
                System Updates
              </CardTitle>
              <CardDescription>
                Check and install official Saturn Router updates directly from GitHub.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckUpdates}
                disabled={checking}
                className="gap-2"
              >
                <Refresh className={cn("size-4", checking && "animate-spin")} />
                Check for updates
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-card/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                  hasUpdate
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {hasUpdate ? <Download className="size-5" /> : <Check className="size-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-foreground">
                    Saturn Router v{currentVersion}
                  </span>
                  {hasUpdate ? (
                    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      Update available
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      Up to date
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {hasUpdate
                    ? `New version ${latestRelease?.tag} is ready to install.`
                    : "You are running the latest version."}
                </p>
              </div>
            </div>

            <div className="text-xs text-muted-foreground sm:text-right">
              <div>
                Official Repository:{" "}
                <span className="font-mono text-foreground font-medium">
                  {statusData?.repo || "SterTheStar/SaturnRouter"}
                </span>
              </div>
              <div className="mt-0.5">
                Last checked:{" "}
                {statusData?.lastCheck
                  ? new Date(statusData.lastCheck).toLocaleString()
                  : "Never checked"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Available Update Card */}
      {hasUpdate && latestRelease && (
        <Card className="border-border shadow-xs">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Sparkling className="size-4 text-primary" />
                  <CardTitle className="text-base font-semibold">
                    {latestRelease.name || `Saturn Router ${latestRelease.tag}`}
                  </CardTitle>
                  {latestRelease.prerelease && (
                    <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground border-border h-5 px-1.5">
                      Pre-release
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-xs">
                  Published on {new Date(latestRelease.publishedAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                {latestRelease.htmlUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => window.open(latestRelease.htmlUrl, "_blank")}
                  >
                    <ExternalLink className="size-3" />
                    GitHub
                  </Button>
                )}
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => handleStartUpdate(latestRelease.tag)}
                >
                  <Download className="size-3.5" />
                  Update to {latestRelease.tag}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              <span className="text-xs font-medium text-muted-foreground">
                Release Notes
              </span>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-card p-4">
                {latestRelease.body ? (
                  <MarkdownRenderer content={latestRelease.body} stripFirstH1={true} />
                ) : (
                  <p className="text-muted-foreground italic text-xs">
                    No detailed release notes provided for this release.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Update Preferences Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="size-5" />
            Update Preferences
          </CardTitle>
          <CardDescription>
            Configure how Saturn Router checks for updates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-check">Automatically check for updates</Label>
              <p className="text-xs text-muted-foreground">
                Periodically check for new releases on GitHub in the background.
              </p>
            </div>
            <Switch
              id="auto-check"
              checked={autoCheck}
              onCheckedChange={(checked) => {
                setAutoCheck(checked);
                handleSaveSettings({ autoCheck: checked });
              }}
              disabled={savingSettings}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="include-prereleases">Include Beta / Pre-releases</Label>
              <p className="text-xs text-muted-foreground">
                Check and update to preview and pre-release builds.
              </p>
            </div>
            <Switch
              id="include-prereleases"
              checked={includePrerelease}
              onCheckedChange={(checked) => {
                setIncludePrerelease(checked);
                handleSaveSettings({ includePrerelease: checked });
              }}
              disabled={savingSettings}
            />
          </div>
        </CardContent>
      </Card>

      {/* Progress & Restart Modal */}
      <UpdateProgressModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        progress={progressState}
        onRestart={handleRestart}
        onReset={handleReset}
      />
    </div>
  );
}
