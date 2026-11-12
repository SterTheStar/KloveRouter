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
    const next = current === true ? false : current === false ? null : detected ? false : true;
    onChange({
      ...value,
      capabilities: {
        ...value.capabilities,
        [key]: next,
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

  const isImageActive =
    value.capabilities.image_generation === true ||
    (value.capabilities.image_generation == null && detectedTypes.includes("image")) ||
    Boolean(value.media_settings?.image);

  const isTtsActive =
    value.capabilities.text_to_speech === true ||
    (value.capabilities.text_to_speech == null && detectedTypes.includes("tts")) ||
    Boolean(value.media_settings?.text_to_speech);

  const isVideoActive =
    value.capabilities.video_generation === true ||
    (value.capabilities.video_generation == null && detectedTypes.includes("video")) ||
    Boolean(value.media_settings?.video);

  const activeModalities = modalityChoices.filter(({ key }) => {
    if (key === "image_generation") return isImageActive;
    if (key === "text_to_speech") return isTtsActive;
    if (key === "video_generation") return isVideoActive;
    return false;
  });

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

  const modelTypeChoices = [
    { type: "chat" as const, label: "Chat / LLM", hint: "Conversational & instruction text" },
    { type: "image" as const, label: "Image Generation", hint: "Text-to-image synthesis & edits" },
    { type: "tts" as const, label: "Text-to-Speech", hint: "Audio & voice generation" },
    { type: "video" as const, label: "Video Generation", hint: "Text & image to video synthesis" },
    { type: "embedding" as const, label: "Text Embeddings", hint: "Vector representations for RAG" },
    { type: "systemone" as const, label: "SystemOne Decision", hint: "Structured decisions & evaluations" },
  ];

  const currentType = value.model_type || (detectedTypes.includes("image") ? "image" : detectedTypes.includes("tts") ? "tts" : detectedTypes.includes("video") ? "video" : detectedTypes.includes("embedding") ? "embedding" : detectedTypes.includes("systemone") ? "systemone" : "chat");

  const selectPrimaryType = (type: typeof modelTypeChoices[number]["type"]) => {
    const isImg = type === "image";
    const isTts = type === "tts";
    const isVid = type === "video";
    onChange({
      ...value,
      model_type: type,
      capabilities: {
        ...value.capabilities,
        image_generation: isImg ? true : isImg === false && value.capabilities.image_generation === true ? false : value.capabilities.image_generation,
        text_to_speech: isTts ? true : isTts === false && value.capabilities.text_to_speech === true ? false : value.capabilities.text_to_speech,
        video_generation: isVid ? true : isVid === false && value.capabilities.video_generation === true ? false : value.capabilities.video_generation,
      },
    });
  };

  return (
    <div className="space-y-5 py-1">
      <div>
        <h3 className="text-sm font-normal text-foreground">
          Primary Model Architecture
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Categorizes the model for routing, target endpoints, and administrative management.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {modelTypeChoices.map(({ type, label, hint }) => {
          const isSelected = currentType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => selectPrimaryType(type)}
              className={`rounded-xl border p-2.5 text-left transition-colors cursor-pointer ${
                isSelected
                  ? "border-primary bg-primary/10 shadow-xs"
                  : "border-border bg-card text-muted-foreground hover:bg-accent/40"
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className={`text-xs font-medium ${isSelected ? "text-foreground" : "text-foreground/80"}`}>{label}</span>
              </div>
              <span className="mt-1 block text-[11px] text-muted-foreground leading-tight">
                {hint}
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-normal text-foreground">
          Supported generation modalities
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Configure default generation parameters and overrides for media models.
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3">
        {modalityChoices.map(({ key, title, hint, category }) => {
          const state = value.capabilities[key] ?? null;
          const isAutoOn = state === null && detectedTypes.includes(category);
          return (
            <button
              key={key}
              type="button"
              onClick={() => updateCapability(key)}
              aria-pressed={state === true || isAutoOn}
              className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                state === true
                  ? "border-primary/50 bg-primary/10 shadow-xs"
                  : state === false
                    ? "border-border bg-muted/20 text-muted-foreground opacity-60"
                    : isAutoOn
                      ? "border-primary/40 bg-primary/5 text-foreground"
                      : "border-dashed border-border bg-card text-muted-foreground hover:bg-accent/50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-normal text-foreground">{title}</span>
                <span className="text-[10px] font-mono text-muted-foreground font-normal">
                  {state === true ? "On" : state === false ? "Off" : isAutoOn ? "Auto (On)" : "Auto (Off)"}
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

          {isImageActive &&
            configSection(
              "Image",
              "Image size, quality, and output format.",
              <>
                {field("image", "size", "Default size", "e.g. 1024x1024")}
                {field("image", "quality", "Default quality", "e.g. auto, high, standard")}
                {field("image", "output_format", "Output format", "e.g. png, jpeg, webp")}
              </>,
            )}

          {isTtsActive &&
            configSection(
              "Text to speech",
              "Default voice, audio format, and speed.",
              <>
                {field("text_to_speech", "voice", "Default voice", "e.g. alloy")}
                {field("text_to_speech", "response_format", "Audio format", "e.g. mp3, wav, opus")}
                {field("text_to_speech", "speed", "Speed", "1", "number", 0.25, 4, 0.05)}
              </>,
            )}

          {isVideoActive &&
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
