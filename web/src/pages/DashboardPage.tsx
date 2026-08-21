import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RiAddLine as Plus,
  RiLoader4Line as LoaderCircle,
} from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "../components/ConfirmDialog";
import AddProviderModal from "../components/AddProviderModal";
import ProviderCard from "../components/ProviderCard";
import { providers } from "../api/client";
import type { Provider } from "../types";
import { useToast } from "../components/ui/toast";

function ProviderSection({
  title,
  count,
  providers,
  togglingProviderId,
  onToggle,
  onEdit,
  onDelete,
}: {
  title: string;
  count: number;
  providers: Provider[];
  togglingProviderId: string | null;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section aria-labelledby={`${title.toLowerCase()}-providers-heading`}>
      <div className="mb-3 flex items-center gap-2">
        <h2
          id={`${title.toLowerCase()}-providers-heading`}
          className="font-heading text-lg font-semibold"
        >
          {title}
        </h2>
        <span className="text-sm text-muted-foreground">({count})</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            isToggling={togglingProviderId === provider.id}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}

export default function DashboardPage({
  onNavigate,
}: {
  onNavigate: (page: "provider-detail", providerId: string) => void;
}) {
  const { success, error: notifyError } = useToast();
  const [list, setList] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [target, setTarget] = useState<Provider | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingProviderId, setTogglingProviderId] = useState<string | null>(null);
  const activeProviders = useMemo(
    () => list.filter((provider) => provider.is_active === 1),
    [list],
  );
  const inactiveProviders = useMemo(
    () => list.filter((provider) => provider.is_active !== 1),
    [list],
  );
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setList(await providers.list());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const toggle = async (id: string) => {
    setTogglingProviderId(id);
    try {
      const updated = await providers.toggle(id);
      setList((items) =>
        items.map((item) =>
          item.id === id ? { ...item, is_active: updated.is_active } : item,
        ),
      );
    } catch (e: any) {
      notifyError("Could not update provider", e.message);
    } finally {
      setTogglingProviderId(null);
    }
  };
  const remove = async () => {
    if (!target) return;
    setDeleting(true);
    try {
      await providers.remove(target.id);
      setList((items) => items.filter((item) => item.id !== target.id));
      success("Provider removed");
      setTarget(null);
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not remove provider", e.message);
    } finally {
      setDeleting(false);
    }
  };
  if (loading)
    return (
      <div className="flex items-center justify-center p-12">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Providers
        </h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Add provider
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <h2 className="font-heading text-lg font-medium">No providers yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your first provider to start routing requests.
          </p>
          <Button className="mt-5" onClick={() => setAddOpen(true)}>
            Add your first provider
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {activeProviders.length > 0 && (
            <ProviderSection
              title="Active"
              count={activeProviders.length}
              providers={activeProviders}
              togglingProviderId={togglingProviderId}
              onToggle={toggle}
              onEdit={(id) => onNavigate("provider-detail", id)}
              onDelete={(id) =>
                setTarget(list.find((item) => item.id === id) ?? null)
              }
            />
          )}
          {inactiveProviders.length > 0 && (
            <ProviderSection
              title="Disabled"
              count={inactiveProviders.length}
              providers={inactiveProviders}
              togglingProviderId={togglingProviderId}
              onToggle={toggle}
              onEdit={(id) => onNavigate("provider-detail", id)}
              onDelete={(id) =>
                setTarget(list.find((item) => item.id === id) ?? null)
              }
            />
          )}
        </div>
      )}
      <AddProviderModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={load}
      />
      <ConfirmDialog
        open={!!target}
        title="Delete provider"
        message={`Remove ${target?.name} and all its models?`}
        confirmLabel="Delete"
        onConfirm={remove}
        onCancel={() => setTarget(null)}
        loading={deleting}
      />
    </div>
  );
}
