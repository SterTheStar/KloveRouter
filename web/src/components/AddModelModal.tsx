import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { models } from "../api/client";
import { useToast } from "./ui/toast";
import type { PricingTier } from "../types";
import { generateDisplayName } from "../lib/model-name";

export default function AddModelModal({
  isOpen,
  onClose,
  onSuccess,
  providerId,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  providerId: string;
}) {
  const { success, error: notifyError } = useToast();
  const [modelId, setModelId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [displayEdited, setDisplayEdited] = useState(false);
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([
    {
      threshold_tokens: 0,
      input_per_million: 0,
      output_per_million: 0,
      cache_read_per_million: 0,
      cache_write_per_million: 0,
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    if (loading) return;
    setModelId("");
    setDisplayName("");
    setDisplayEdited(false);
    setPricingTiers([
      {
        threshold_tokens: 0,
        input_per_million: 0,
        output_per_million: 0,
        cache_read_per_million: 0,
        cache_write_per_million: 0,
      },
    ]);
    setError(null);
    onClose();
  };
  const updateTier = (index: number, field: keyof PricingTier, value: string) =>
    setPricingTiers((tiers) =>
      tiers.map((tier, i) =>
        i === index ? { ...tier, [field]: Number(value) || 0 } : tier,
      ),
    );
  const submit = async () => {
    if (!modelId.trim()) return setError("Model ID is required.");
    setLoading(true);
    try {
      await models.create(providerId, {
        model_id: modelId.trim(),
        display_name: displayName || undefined,
        pricing_tiers: pricingTiers,
      });
      success("Model added");
      onSuccess();
      close();
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not add model", e.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="overflow-visible sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add model</DialogTitle>
          <DialogDescription>
            Add a model and its pricing to this provider.
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 max-h-[72vh] space-y-5 overflow-y-auto overflow-x-hidden pr-1">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="model-id">Model ID</Label>
              <Input
                className="h-10 bg-muted/30 dark:bg-muted/30"
                id="model-id"
                value={modelId}
                onChange={(e) => {
                  const value = e.target.value;
                  setModelId(value);
                  if (!displayEdited)
                    setDisplayName(generateDisplayName(value));
                }}
                placeholder="gpt-4o"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="model-display">Display name</Label>
              <Input
                className="h-10 bg-muted/30 dark:bg-muted/30"
                id="model-display"
                value={displayName}
                onChange={(e) => {
                  setDisplayEdited(true);
                  setDisplayName(e.target.value);
                }}
                placeholder="Auto-generated from model ID"
              />
            </div>
          </div>
          <PricingEditor
            tiers={pricingTiers}
            updateTier={updateTier}
            setTiers={setPricingTiers}
          />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? "Saving..." : "Save model"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PricingEditor({
  tiers,
  updateTier,
  setTiers,
}: {
  tiers: PricingTier[];
  updateTier: (index: number, field: keyof PricingTier, value: string) => void;
  setTiers: Dispatch<SetStateAction<PricingTier[]>>;
}) {
  const [activeTier, setActiveTier] = useState(0);
  const selectedTier = Math.min(activeTier, Math.max(0, tiers.length - 1));
  const currentTier = tiers[selectedTier];
  const addTier = () => {
    setTiers((items) => [
      ...items,
      {
        threshold_tokens: (items.at(-1)?.threshold_tokens ?? 0) + 1_000_000,
        input_per_million: 0,
        output_per_million: 0,
        cache_read_per_million: 0,
        cache_write_per_million: 0,
      },
    ]);
    setActiveTier(tiers.length);
  };
  const removeTier = () => {
    if (tiers.length <= 1) return;
    setTiers((items) => items.filter((_, index) => index !== selectedTier));
    setActiveTier(Math.max(0, Math.min(selectedTier, tiers.length - 2)));
  };
  const thresholdLabel = (value: number) =>
    value === 0 ? "Base" : `${(value / 1_000_000).toLocaleString()}M+`;
  if (!currentTier) return null;
  return (
    <div className="min-w-0 space-y-5 pt-1">
      <div>
        <div className="text-sm font-medium">Pricing per 1M tokens</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Create a pricing tab for each input-token range. The closest range
          below the request size is applied.
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto border-b border-border/60 pb-2">
        {tiers.map((tier, index) => (
          <button
            key={index}
            type="button"
            className={`shrink-0 rounded-md px-3 py-2 text-sm transition-colors ${index === selectedTier ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            onClick={() => setActiveTier(index)}
          >
            Tier {index + 1}
            <span
              className={`ml-1.5 text-xs ${index === selectedTier ? "text-primary-foreground/75" : "text-muted-foreground"}`}
            >
              {thresholdLabel(tier.threshold_tokens)}
            </span>
          </button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={addTier}
        >
          + Add tier
        </Button>
      </div>
      <div className="min-w-0 space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <Label>Input threshold</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Minimum input tokens for this pricing tier.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={removeTier}
            disabled={tiers.length <= 1}
          >
            Remove tier
          </Button>
        </div>
        <Input
          className="h-10 w-full bg-muted/30 dark:bg-muted/30"
          type="number"
          min="0"
          value={currentTier.threshold_tokens}
          onChange={(e) =>
            updateTier(selectedTier, "threshold_tokens", e.target.value)
          }
        />
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <PriceField
            label="Input price"
            value={currentTier.input_per_million}
            onChange={(value) =>
              updateTier(selectedTier, "input_per_million", value)
            }
          />
          <PriceField
            label="Output price"
            value={currentTier.output_per_million}
            onChange={(value) =>
              updateTier(selectedTier, "output_per_million", value)
            }
          />
          <PriceField
            label="Cache read price"
            value={currentTier.cache_read_per_million}
            onChange={(value) =>
              updateTier(selectedTier, "cache_read_per_million", value)
            }
          />
          <PriceField
            label="Cache write price"
            value={currentTier.cache_write_per_million}
            onChange={(value) =>
              updateTier(selectedTier, "cache_write_per_million", value)
            }
          />
        </div>
      </div>
    </div>
  );
}

function PriceField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label>{label}</Label>
      <div className="relative min-w-0">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
          $
        </span>
        <Input
          className="h-10 w-full bg-muted/30 pl-7 dark:bg-muted/30"
          type="number"
          min="0"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <p className="text-xs text-muted-foreground">USD per 1M tokens</p>
    </div>
  );
}
