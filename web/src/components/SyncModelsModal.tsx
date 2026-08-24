import { useEffect, useMemo, useState } from "react";
import { RiCheckLine as Check, RiCheckboxMultipleBlankLine as DeselectAll, RiCheckboxMultipleLine as SelectAll, RiGiftLine as Free, RiRefreshLine as Reset, RiSearchLine as Search } from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import ConfirmDialog from "./ConfirmDialog";

export type SyncModelItem = {
  id: string;
  display_name: string;
  is_free: boolean;
  is_existing: boolean;
};

function ModelSourceDetails({ model }: { model: SyncModelItem }) {
  return (
    <div className="space-y-1">
      <p className="font-medium">Model details</p>
      <p className="text-muted-foreground">{model.id}</p>
      {model.is_free && <p>Free model</p>}
      {model.is_existing && <p>Already configured</p>}
    </div>
  );
}

export default function SyncModelsModal({
  open,
  items,
  loading,
  onOpenChange,
  onSync,
}: {
  open: boolean;
  items: SyncModelItem[];
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onSync: (modelIds: string[], freeOnly: boolean, resetExisting: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const [resetExisting, setResetExisting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hoveredModel, setHoveredModel] = useState<SyncModelItem | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (open) setSelected(new Set(items.map((model) => model.id)));
  }, [open, items]);

  const visible = useMemo(() => {
    const value = query.trim().toLowerCase();
    return items.filter((model) => !value || `${model.id} ${model.display_name}`.toLowerCase().includes(value));
  }, [items, query]);
  const selectable = visible.filter((model) =>
    (!freeOnly || model.is_free) && (!resetExisting || model.is_existing),
  );
  const selectedSelectable = selectable.filter((model) => selected.has(model.id));
  const allSelectableSelected = selectable.length > 0 && selectedSelectable.length === selectable.length;
  const toggle = (id: string) => {
    const model = items.find((item) => item.id === id);
    if (!model || (freeOnly && !model.is_free) || (resetExisting && !model.is_existing)) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allSelectableSelected) selectable.forEach((model) => next.delete(model.id));
      else selectable.forEach((model) => next.add(model.id));
      return next;
    });
  };
  const applyFilters = (nextFreeOnly: boolean, nextExistingOnly: boolean) => {
    setFreeOnly(nextFreeOnly);
    setResetExisting(nextExistingOnly);
    setSelected((current) =>
      new Set(
        [...current].filter((id) => {
          const model = items.find((item) => item.id === id);
          return model && (!nextFreeOnly || model.is_free) && (!nextExistingOnly || model.is_existing);
        }),
      ),
    );
  };
  const setFreeFilter = (enabled: boolean) => applyFilters(enabled, resetExisting);
  const setExistingFilter = (enabled: boolean) => applyFilters(freeOnly, enabled);
  const submit = () => {
    if (resetExisting) setConfirmOpen(true);
    else onSync([...selected], freeOnly, false);
  };
  const confirm = () => {
    setConfirmOpen(false);
    onSync([...selected], freeOnly, true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl gap-2">
          <DialogHeader>
            <DialogTitle>Synchronize provider models</DialogTitle>
            <DialogDescription>Select models to import. Existing models stay unchanged unless reset is enabled.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search models"
                className="h-8 border-none bg-muted pl-9"
                placeholder="Search models"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleAll}
              disabled={!selectable.length}
              aria-label={allSelectableSelected ? "Deselect visible models" : "Select visible models"}
              title={allSelectableSelected ? "Deselect visible models" : "Select visible models"}
            >
              {allSelectableSelected ? <DeselectAll className="size-4" /> : <SelectAll className="size-4" />}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 py-1">
            <Button
              variant={freeOnly ? "secondary" : "outline"}
              size="sm"
              onClick={() => setFreeFilter(!freeOnly)}
              className={freeOnly ? "text-primary" : "text-muted-foreground"}
            >
              <Free className="size-4" />
              Free only
            </Button>
            <Button
              variant={resetExisting ? "secondary" : "outline"}
              size="sm"
              onClick={() => setExistingFilter(!resetExisting)}
              className={resetExisting ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}
            >
              <Reset className="size-4" />
              Existing only
            </Button>
            <span className="ml-auto text-sm text-muted-foreground">
              <strong className="font-medium text-foreground">{selected.size}</strong> selected of {selectable.length}
            </span>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-md border">
            {visible.map((model) => {
              const disabled = (freeOnly && !model.is_free) || (resetExisting && !model.is_existing);
              const checked = selected.has(model.id);
              return (
                <div
                  key={model.id}
                  role="checkbox"
                  aria-checked={checked}
                  aria-disabled={disabled}
                  tabIndex={disabled ? -1 : 0}
                  onMouseEnter={(event) => {
                    setHoveredModel(model);
                    setPointer({ x: event.clientX, y: event.clientY });
                  }}
                  onMouseMove={(event) => setPointer({ x: event.clientX, y: event.clientY })}
                  onMouseLeave={() => setHoveredModel(null)}
                  onClick={() => toggle(model.id)}
                  onKeyDown={(event) => {
                    if (!disabled && (event.key === " " || event.key === "Enter")) {
                      event.preventDefault();
                      toggle(model.id);
                    }
                  }}
                  className={`flex w-full items-center gap-3 border-b p-2 text-left last:border-b-0 ${disabled ? "cursor-not-allowed bg-muted/30 opacity-45" : "cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"}`}
                >
                  <span className={`flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"} ${disabled ? "border-muted-foreground/30 bg-muted" : ""}`}>
                    {checked && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1"><span className="block truncate">{model.display_name}</span><span className="block truncate font-mono text-xs text-muted-foreground">{model.id}</span></span>
                  {model.is_free && <Badge variant="secondary" className="text-green-700 dark:text-green-400">Free</Badge>}
                  {model.is_existing && <Badge variant="outline">Existing</Badge>}
                </div>
              );
            })}
            {!visible.length && <p className="p-6 text-center text-sm text-muted-foreground">No models found.</p>}
          </div>
          {resetExisting && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
              Reset replaces provider metadata on selected existing models. Custom metadata can be lost.
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} disabled={loading || !selected.size}>{loading ? "Synchronizing..." : `Sync ${selected.size} models`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {hoveredModel && (
        <div
          className="pointer-events-none fixed z-[100] rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-xl"
          style={{ left: pointer.x + 16, top: pointer.y + 16 }}
        >
          <ModelSourceDetails model={hoveredModel} />
        </div>
      )}
      <ConfirmDialog open={confirmOpen} title="Reset existing models?" message="This replaces metadata and clears custom metadata for selected existing models. Continue?" confirmLabel="Reset and sync" onConfirm={confirm} onCancel={() => setConfirmOpen(false)} loading={loading} />
    </>
  );
}
