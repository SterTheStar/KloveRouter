import { useEffect, useState } from "react";
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
import { Tabs } from "@/components/ui/tabs";
import { models } from "../api/client";
import type { Model, ModelMetadataInput } from "../types";
import { useToast } from "./ui/toast";
import {
  emptyModelMetadata,
  ModelMetadataEditor,
  modelFormTabs,
  PricingEditor,
} from "./AddModelModal";
import type { PricingTier } from "../types";
import { generateDisplayName } from "../lib/model-name";
import { invalidateModels } from "../lib/query-cache";

export default function EditModelModal({
  isOpen,
  model,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  model: Model | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { success, error: notifyError } = useToast();
  const [modelId, setModelId] = useState("");
  const [prettyId, setPrettyId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [displayEdited, setDisplayEdited] = useState(false);
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [metadata, setMetadata] = useState<ModelMetadataInput>(() =>
    emptyModelMetadata(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("general");
  useEffect(() => {
    if (model) {
      const defaultEffortIndex = Math.max(
        0,
        (model.reasoning_efforts ?? []).findIndex((effort) => effort.is_default),
      );
      setModelId(model.model_id);
      setPrettyId(model.pretty_id ?? "");
      setDisplayName(model.display_name ?? generateDisplayName(model.model_id));
      setDisplayEdited(Boolean(model.display_name));
      setMetadata({
        context_window: model.context_window ?? null,
        max_output_tokens: model.max_output_tokens ?? null,
        capabilities: {
          ...emptyModelMetadata().capabilities,
          ...(model.capabilities ?? {}),
        },
        reasoning_efforts: (model.reasoning_efforts ?? []).map(
          (effort, index) => ({
            ...effort,
            is_default: index === defaultEffortIndex,
          }),
        ),
      });
      setPricingTiers(
        model.pricing_tiers?.length
          ? model.pricing_tiers
          : [
              {
                threshold_tokens: 0,
                input_per_million: 0,
                output_per_million: 0,
                cache_read_per_million: 0,
                cache_write_per_million: 0,
              },
            ],
      );
      setError(null);
      setActiveTab("general");
    }
  }, [model]);
  const updateTier = (index: number, field: keyof PricingTier, value: string) =>
    setPricingTiers((tiers) =>
      tiers.map((tier, i) =>
        i === index ? { ...tier, [field]: Number(value) || 0 } : tier,
      ),
    );
  const submit = async () => {
    if (!model || !modelId.trim()) return setError("Model ID is required.");
    if (
      metadata.reasoning_efforts.length > 0 &&
      metadata.reasoning_efforts.filter((effort) => effort.is_default)
        .length !== 1
    )
      return setError("Select exactly one default reasoning effort.");
    setLoading(true);
    try {
      await models.update(model.id, {
        model_id: modelId.trim(),
        pretty_id: prettyId.trim() || null,
        display_name: displayName || null,
        pricing_tiers: pricingTiers,
        ...metadata,
      });
      invalidateModels();
      success("Model updated");
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not update model", e.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="overflow-visible sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit model</DialogTitle>
          <DialogDescription>
            Update model identity, capabilities, limits, and pricing.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          tabs={modelFormTabs}
          active={activeTab}
          onChange={setActiveTab}
          className="-mx-1 overflow-x-auto px-1"
        />
        <div className="min-w-0 min-h-[27rem] max-h-[64vh] overflow-y-auto overflow-x-hidden pr-1">
          {activeTab === "general" && (
            <div className="space-y-5 py-1">
              <div>
                <div className="text-sm font-medium">Model identity</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upstream identifier and friendly name shown in Klove.
                </p>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="edit-model-id">Model ID</Label>
              <Input
                className="h-10 bg-muted/30 dark:bg-muted/30"
                id="edit-model-id"
                value={modelId}
                onChange={(e) => {
                  const value = e.target.value;
                  setModelId(value);
                  if (!displayEdited)
                    setDisplayName(generateDisplayName(value));
                }}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="edit-model-pretty">Pretty ID (optional)</Label>
              <Input className="h-10 bg-muted/30 dark:bg-muted/30" id="edit-model-pretty" value={prettyId} onChange={(e) => setPrettyId(e.target.value)} placeholder="friendly-model" />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="edit-model-display">Display name</Label>
              <Input
                className="h-10 bg-muted/30 dark:bg-muted/30"
                id="edit-model-display"
                value={displayName}
                onChange={(e) => {
                  setDisplayEdited(true);
                  setDisplayName(e.target.value);
                }}
              />
            </div>
              </div>
            </div>
          )}
          {activeTab === "capabilities" && (
            <ModelMetadataEditor value={metadata} onChange={setMetadata} />
          )}
          {activeTab === "pricing" && (
            <PricingEditor
              tiers={pricingTiers}
              updateTier={updateTier}
              setTiers={setPricingTiers}
            />
          )}
          {error && (
            <Alert variant="destructive" className="mt-5">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
