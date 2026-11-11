import { useEffect, useRef, useState } from "react";
import {
  RiCheckLine as Check,
  RiCloseLine as Close,
  RiDownload2Line as Download,
  RiErrorWarningLine as ErrorWarning,
  RiLoader4Line as LoaderCircle,
  RiRestartLine as Restart,
  RiTerminalBoxLine as Terminal,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { UpdateProgressState } from "@/types";

interface UpdateProgressModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: UpdateProgressState;
  onRestart: () => Promise<void>;
  onReset: () => Promise<void>;
}

export default function UpdateProgressModal({
  open,
  onOpenChange,
  progress,
  onRestart,
  onReset,
}: UpdateProgressModalProps) {
  const [showLogs, setShowLogs] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartMessage, setRestartMessage] = useState("");
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (showLogs && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [progress.logs, showLogs]);

  const handleRestartClick = async () => {
    setRestarting(true);
    setRestartMessage("Sending restart signal...");
    try {
      await onRestart();
      setRestartMessage("Server is restarting. Waiting for reconnection...");

      // Poll until the server is back up
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const res = await fetch("/api", { cache: "no-store" });
          if (res.ok) {
            clearInterval(interval);
            setRestartMessage("Reconnected successfully! Reloading page...");
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }
        } catch {
          if (attempts > 30) {
            clearInterval(interval);
            setRestartMessage("The server is taking longer than expected. Please reload manually.");
          }
        }
      }, 1500);
    } catch {
      setRestarting(false);
      setRestartMessage("");
    }
  };

  const isCompleted = progress.status === "ready_restart";
  const isFailed = progress.status === "error";
  const isRunning =
    progress.status === "checking" ||
    progress.status === "downloading" ||
    progress.status === "installing_deps" ||
    progress.status === "building";

  const getStepStatus = (stepIndex: number) => {
    if (isCompleted) return "done";
    if (isFailed) return "error";
    if (stepIndex === 0) {
      if (progress.status === "downloading") return "current";
      if (progress.progress > 40) return "done";
      return "pending";
    }
    if (stepIndex === 1) {
      if (progress.status === "installing_deps") return "current";
      if (progress.progress > 75) return "done";
      return "pending";
    }
    if (stepIndex === 2) {
      if (progress.status === "building") return "current";
      if (progress.progress > 90) return "done";
      return "pending";
    }
    return "pending";
  };

  const steps = [
    { title: "Download code", desc: "Fetching release from GitHub" },
    { title: "Dependencies", desc: "Running bun install" },
    { title: "Build frontend", desc: "Compiling production assets" },
    { title: "Ready", desc: "Restart required" },
  ];

  return (
    <Dialog open={open} onOpenChange={(val) => !restarting && onOpenChange(val)}>
      <DialogContent className="max-w-lg sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="size-5 text-primary" />
            Saturn Router Update
          </DialogTitle>
          <DialogDescription>
            {progress.targetTag ? `Installing version ${progress.targetTag}` : "Updating to the latest version"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{progress.step}</span>
              <span>{progress.progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full transition-all duration-500 ${
                  isFailed
                    ? "bg-destructive"
                    : isCompleted
                      ? "bg-emerald-500"
                      : "bg-primary"
                }`}
                style={{ width: `${progress.progress}%` }}
              />
            </div>
          </div>

          {/* Stepper */}
          <div className="grid grid-cols-4 gap-2 pt-1 text-center">
            {steps.map((s, idx) => {
              const status = getStepStatus(idx);
              return (
                <div key={idx} className="flex flex-col items-center space-y-1">
                  <div
                    className={`flex size-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                      status === "done"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                        : status === "current"
                          ? "bg-primary/15 text-primary border border-primary animate-pulse"
                          : status === "error"
                            ? "bg-destructive/15 text-destructive border border-destructive/30"
                            : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {status === "done" ? (
                      <Check className="size-4" />
                    ) : status === "current" ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span className="text-[11px] font-medium leading-tight text-foreground line-clamp-1">
                    {s.title}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Restarting State */}
          {restarting && (
            <Alert className="border-primary/50 bg-primary/10">
              <LoaderCircle className="size-4 animate-spin text-primary" />
              <AlertTitle className="font-semibold">Restarting</AlertTitle>
              <AlertDescription className="text-xs">{restartMessage}</AlertDescription>
            </Alert>
          )}

          {/* Success State */}
          {isCompleted && !restarting && (
            <Alert className="border-emerald-500/50 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100">
              <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
              <AlertTitle className="font-semibold">Update installed successfully!</AlertTitle>
              <AlertDescription className="text-xs">
                All files, dependencies, and web assets were updated. Restart the server to activate the new version.
              </AlertDescription>
            </Alert>
          )}

          {/* Error State */}
          {isFailed && (
            <Alert variant="destructive">
              <ErrorWarning className="size-4" />
              <AlertTitle>Update failed</AlertTitle>
              <AlertDescription className="text-xs">
                {progress.error || "An unexpected error occurred during update."}
              </AlertDescription>
            </Alert>
          )}

          {/* Collapsible Log Viewer */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowLogs(!showLogs)}
              >
                <Terminal className="mr-1.5 size-3.5" />
                {showLogs ? "Hide terminal logs" : "Show terminal logs"}
              </Button>
              <span className="text-[11px] text-muted-foreground">
                {progress.logs.length} log lines
              </span>
            </div>

            {showLogs && (
              <ScrollArea className="h-44 w-full rounded-md border border-border bg-black/90 p-3 font-mono text-xs text-zinc-300">
                {progress.logs.length === 0 ? (
                  <span className="text-zinc-500">No logs recorded yet.</span>
                ) : (
                  progress.logs.map((log, idx) => (
                    <div key={idx} className="whitespace-pre-wrap break-all leading-relaxed">
                      {log}
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </ScrollArea>
            )}
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <div>
            {isFailed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await onReset();
                  onOpenChange(false);
                }}
              >
                Cancel
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isCompleted && !restarting && (
              <Button
                className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={handleRestartClick}
              >
                <Restart className="size-4" />
                Restart Saturn Router
              </Button>
            )}

            {!isCompleted && !isRunning && !restarting && (
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            )}

            {isRunning && (
              <Button disabled variant="outline" size="sm">
                <LoaderCircle className="mr-2 size-4 animate-spin" />
                Updating...
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
