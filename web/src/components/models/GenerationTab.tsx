import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { modelCategories } from "@/lib/model-modality";
import type { ModelMetadataInput } from "../../types";

interface GenerationTabProps {
  value: ModelMetadataInput;
  onChange: (value: ModelMetadataInput) => void;
  modelIdentity?: string;
}

export function GenerationTab({
  value,
  onChange,
  modelIdentity = "",
}: GenerationTabProps) {
  const generationKeys = [
    "image_generation",
    "text_to_speech",
    "video_generation",
  ] as const;
  const detectedTypes = modelCategories({
    model_id: modelIdentity,
    capabilities: value.capabilities,
  });

  const updateCapability = (key: (typeof generationKeys)[number]) => {
    const current = value.capabilities[key] ?? null;
    const category =
      key === "image_generation"
        ? "image"
        : key === "text_to_speech"
          ? "tts"
          : "video";
    const detected = current === null && detectedTypes.includes(category);
    onChange({
      ...value,
      capabilities: {
        ...value.capabilities,
        [key]: current === true || detected ? false : true,
      },
    });
  };

  const updateSetting = (
    section: "image" | "text_to_speech" | "video",
    key: string,
    raw: string,
  ) => {
    const numeric = key === "speed" || key === "seconds";
    const previous = value.media_settings ?? {};
    const current = { ...(previous[section] ?? {}) } as Record<
      string,
      string | number | undefined
    >;
    current[key] = raw === "" ? undefined : numeric ? Number(raw) : raw;
    const media_settings = {
      ...previous,
      [section]: Object.fromEntries(
        Object.entries(current).filter(([, item]) => item !== undefined),
      ),
    };
    if (!Object.keys(media_settings[section] ?? {}).length) {
      delete media_settings[section];
    }
    onChange({ ...value, media_settings });
  };

  const field = (
    section: "image" | "text_to_speech" | "video",
    key: string,
    label: string,
    placeholder: string,
    type = "text",
    min?: number,
    max?: number,
    step?: number,
  ) => {
    const current = value.media_settings?.[section]?.[key as never] as
      | string
      | number
      | undefined;
    return (
      <div key={key} className="space-y-1.5">
        <Label className="text-xs font-normal">{label}</Label>
        <Input
          type={type}
          min={min}
          max={max}
          step={step}
          className="h-8 text-xs"
          value={current ?? ""}
          placeholder={placeholder}
          onChange={(event) => updateSetting(section, key, event.target.value)}
        />
      </div>
    );
  };

  const modalityChoices = [
    {
      title: "Image",
      key: "image_generation" as const,
      category: "image" as const,
      hint: "Image generation, edits, and variations",
    },
    {
      title: "Text to speech",
      key: "text_to_speech" as const,
      category: "tts" as const,
      hint: "Speech synthesis and audio generation",
    },
    {
      title: "Video",
      key: "video_generation" as const,
      category: "video" as const,
      hint: "Video generation tasks and clips",
    },
  ] as const;

  const activeModalities = modalityChoices.filter(
    ({ key, category }) =>
      value.capabilities[key] === true ||
      (value.capabilities[key] == null && detectedTypes.includes(category)),
  );

  const configSection = (
    title: string,
    description: string,
    fields: ReactNode,
  ) => (
    <section key={title} className="space-y-3 rounded-lg border border-border bg-card p-3.5">
      <div>
        <h4 className="text-xs font-normal text-foreground">{title} Defaults</h4>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{fields}</div>
    </section>
  );

  return (
    <div className="space-y-5 py-1">
      <div>
        <h3 className="text-sm font-normal text-foreground">
          Supported generation types
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Select only the modalities this model supports. Configuration fields appear only for enabled types.
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3">
        {modalityChoices.map(({ key, title, hint }) => {
          const state = value.capabilities[key] ?? null;
          return (
            <button
              key={key}
              type="button"
              onClick={() => updateCapability(key)}
              aria-pressed={state === true}
              className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                state === true
                  ? "border-primary/50 bg-primary/10 shadow-xs"
                  : state === false
                    ? "border-border bg-muted/20 text-muted-foreground opacity-60"
                    : "border-dashed border-border bg-card text-muted-foreground hover:bg-accent/50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-normal text-foreground">{title}</span>
                <span className="text-[10px] font-mono text-muted-foreground font-normal">
                  {state === true ? "On" : state === false ? "Off" : "Auto"}
                </span>
              </div>
              <span className="mt-1.5 block text-[11px] text-muted-foreground leading-snug">
                {hint}
              </span>
            </button>
          );
        })}
      </div>

      {activeModalities.length ? (
        <div className="space-y-3 border-t border-border pt-4">
          <div>
            <h4 className="text-xs font-normal text-foreground">
              Defaults for supported types
            </h4>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Defaults are applied only when incoming requests do not specify a value.
            </p>
          </div>

          {value.capabilities.image_generation === true &&
            configSection(
              "Image",
              "Image size, quality, and output format.",
              <>
                {field("image", "size", "Default size", "e.g. 1024x1024")}
                {field("image", "quality", "Default quality", "e.g. auto, high, standard")}
                {field("image", "output_format", "Output format", "e.g. png, jpeg, webp")}
              </>,
            )}

          {value.capabilities.text_to_speech === true &&
            configSection(
              "Text to speech",
              "Default voice, audio format, and speed.",
              <>
                {field("text_to_speech", "voice", "Default voice", "e.g. alloy")}
                {field("text_to_speech", "response_format", "Audio format", "e.g. mp3, wav, opus")}
                {field("text_to_speech", "speed", "Speed", "1", "number", 0.25, 4, 0.05)}
              </>,
            )}

          {value.capabilities.video_generation === true &&
            configSection(
              "Video",
              "Default frame size and duration.",
              <>
                {field("video", "size", "Default size", "e.g. 1280x720")}
                {field("video", "seconds", "Duration (seconds)", "e.g. 4", "number", 0.1, 600, 0.1)}
              </>,
            )}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-card p-4 text-xs text-muted-foreground text-center">
          Standard text chat model. Toggle Image, Text to speech, or Video above if this model supports multimodal generation jobs.
        </p>
      )}
    </div>
  );
}
