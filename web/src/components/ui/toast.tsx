import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  RiCheckLine as Check,
  RiCloseLine as Close,
  RiErrorWarningLine as Warning,
  RiInformationLine as Info,
} from "@remixicon/react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";
type Toast = {
  id: number;
  title: string;
  description?: string;
  type: ToastType;
};
type ToastInput = Omit<Toast, "id">;
type ToastContextValue = {
  toast: (input: ToastInput | string) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((input: ToastInput | string) => {
    const item: Toast =
      typeof input === "string"
        ? { id: Date.now(), title: input, type: "info" }
        : { ...input, id: Date.now() };
    setItems((current) => [...current.slice(-3), item]);
    window.setTimeout(
      () =>
        setItems((current) => current.filter((toast) => toast.id !== item.id)),
      4500,
    );
  }, []);
  const value = useMemo(
    () => ({
      toast: push,
      success: (title: string, description?: string) =>
        push({ title, description, type: "success" }),
      error: (title: string, description?: string) =>
        push({ title, description, type: "error" }),
      info: (title: string, description?: string) =>
        push({ title, description, type: "info" }),
    }),
    [push],
  );
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-lg",
              item.type === "error" && "border-destructive/50",
              item.type === "success" && "border-green-500/40",
            )}
          >
            <div
              className={cn(
                "mt-0.5",
                item.type === "error"
                  ? "text-destructive"
                  : item.type === "success"
                    ? "text-green-500"
                    : "text-muted-foreground",
              )}
            >
              {item.type === "error" ? (
                <Warning className="size-4" />
              ) : item.type === "success" ? (
                <Check className="size-4" />
              ) : (
                <Info className="size-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{item.title}</div>
              {item.description && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {item.description}
                </div>
              )}
            </div>
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={() =>
                setItems((current) =>
                  current.filter((toast) => toast.id !== item.id),
                )
              }
              aria-label="Dismiss notification"
            >
              <Close className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
