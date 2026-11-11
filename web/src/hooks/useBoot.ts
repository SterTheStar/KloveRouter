import { useEffect, useRef, useState } from "react";
import { BOOT_TASKS, BOOT_TOTAL_STEPS, SESSION_STEP_LABEL, type BootHandlers } from "../lib/boot-tasks";

const TASK_TIMEOUT_MS = 8_000;
const MIN_SPLASH_MS = 600;
const COMPLETE_HOLD_MS = 250;

export interface BootState {
  booting: boolean;
  /** 0..1 */
  progress: number;
  label: string;
  completedSteps: number;
  totalSteps: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Boot task timed out")), ms);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

export function useBoot({
  authLoading,
  isAuth,
  handlers,
}: {
  authLoading: boolean;
  isAuth: boolean;
  handlers: BootHandlers;
}): BootState {
  const [authResolved, setAuthResolved] = useState(false);
  const [completed, setCompleted] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!authLoading) setAuthResolved(true);
  }, [authLoading]);

  useEffect(() => {
    setReady(false);
    setCompleted([]);
    if (!authResolved || !isAuth) return;

    let cancelled = false;
    let holdTimer: number | undefined;
    const startedAt = Date.now();

    const runs = BOOT_TASKS.map((task) =>
      withTimeout(Promise.resolve().then(() => task.run(handlersRef.current)), TASK_TIMEOUT_MS)
        .catch(() => undefined)
        .then(() => {
          if (!cancelled) setCompleted((current) => [...current, task.id]);
        }),
    );

    Promise.all(runs).then(() => {
      if (cancelled) return;
      const remaining = MIN_SPLASH_MS - (Date.now() - startedAt);
      holdTimer = window.setTimeout(() => {
        if (!cancelled) setReady(true);
      }, Math.max(COMPLETE_HOLD_MS, remaining));
    });

    return () => {
      cancelled = true;
      window.clearTimeout(holdTimer);
    };
  }, [authResolved, isAuth]);

  const booting = !authResolved || (isAuth && !ready);
  const completedSteps = authResolved ? 1 + completed.length : 0;
  const pendingTask = BOOT_TASKS.find((task) => !completed.includes(task.id));
  const label = !authResolved ? SESSION_STEP_LABEL : pendingTask?.label ?? "Starting Saturn";

  return {
    booting,
    progress: completedSteps / BOOT_TOTAL_STEPS,
    label,
    completedSteps,
    totalSteps: BOOT_TOTAL_STEPS,
  };
}
