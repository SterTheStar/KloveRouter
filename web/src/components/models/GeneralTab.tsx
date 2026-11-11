import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateDisplayName } from "@/lib/model-name";

interface GeneralTabProps {
  modelId: string;
  onModelIdChange: (value: string) => void;
  prettyId: string;
  onPrettyIdChange: (value: string) => void;
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  displayEdited: boolean;
  onDisplayEditedChange: (edited: boolean) => void;
  isEditMode?: boolean;
}

export function GeneralTab({
  modelId,
  onModelIdChange,
  prettyId,
  onPrettyIdChange,
  displayName,
  onDisplayNameChange,
  displayEdited,
  onDisplayEditedChange,
  isEditMode = false,
}: GeneralTabProps) {
  return (
    <div className="space-y-5 py-1">
      <div>
        <h3 className="text-sm font-normal text-foreground">Model identity</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Upstream identifier and friendly name shown across Saturn Router.
        </p>
      </div>

      <div className="space-y-4">
        {/* Model ID */}
        <div className="space-y-2">
          <Label htmlFor="model-id" className="text-xs font-normal">
            Model ID <span className="text-destructive">*</span>
          </Label>
          <Input
            id="model-id"
            className="h-9 font-mono text-xs"
            placeholder="e.g. gpt-4o, claude-3-7-sonnet, gemini-2.5-pro"
            value={modelId}
            onChange={(e) => {
              const val = e.target.value;
              onModelIdChange(val);
              if (!displayEdited) {
                onDisplayNameChange(generateDisplayName(val));
              }
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            The exact model identifier expected by the upstream provider.
          </p>
        </div>

        {/* Display Name */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="model-display" className="text-xs font-normal">
              Display Name
            </Label>
            {displayEdited && (
              <button
                type="button"
                onClick={() => {
                  onDisplayEditedChange(false);
                  onDisplayNameChange(generateDisplayName(modelId));
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Reset to auto-generated
              </button>
            )}
          </div>
          <Input
            id="model-display"
            className="h-9 text-xs"
            placeholder="Auto-generated from Model ID"
            value={displayName}
            onChange={(e) => {
              onDisplayEditedChange(true);
              onDisplayNameChange(e.target.value);
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Friendly name displayed in logs, charts, and routing dropdowns.
          </p>
        </div>

        {/* Pretty ID (optional) */}
        <div className="space-y-2">
          <Label htmlFor="model-pretty" className="text-xs font-normal">
            Pretty ID / Public Alias <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="model-pretty"
            className="h-9 font-mono text-xs"
            placeholder="e.g. fast-model, smart-code"
            value={prettyId}
            onChange={(e) => onPrettyIdChange(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Alternative friendly ID exposed to API clients. Use letters, numbers, dots, hyphens, and underscores.
          </p>
        </div>
      </div>
    </div>
  );
}
