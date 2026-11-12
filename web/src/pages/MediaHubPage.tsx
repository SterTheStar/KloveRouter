import React, { useEffect, useState } from "react";
import {
  RiImageLine as ImageIcon,
  RiVoiceprintLine as TtsIcon,
  RiMovieLine as VideoIcon,
  RiCodeSSlashLine as CodeIcon,
  RiLoader4Line as LoaderIcon,
  RiPaletteLine as MediaIcon,
  RiRefreshLine as RefreshIcon,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { mediaApi, models as modelsApi } from "../api/client";
import { modelPublicId } from "../lib/model-id";
import { ImageStudio } from "../components/media/ImageStudio";
import { SpeechStudio } from "../components/media/SpeechStudio";
import { VideoStudio } from "../components/media/VideoStudio";
import { MediaApiDocs } from "../components/media/MediaApiDocs";
import type { MediaModelItem } from "../types";

type ActiveTab = "image" | "tts" | "video" | "api";

export default function MediaHubPage() {
  const [tab, setTab] = useState<ActiveTab>("image");
  const [models, setModels] = useState<MediaModelItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMediaModels = async () => {
    setLoading(true);
    try {
      const res = await mediaApi.models();
      if (res.data && res.data.length > 0) {
        setModels(res.data);
      } else {
        const all = await modelsApi.listAll();
        const mapped: MediaModelItem[] = all.filter((m) => {
          const caps = m.capabilities ?? {};
          const settings = m.media_settings ?? {};
          return caps.image_generation === true || caps.text_to_speech === true || caps.video_generation === true ||
            Boolean(settings.image) || Boolean(settings.text_to_speech) || Boolean(settings.video);
        }).map((m) => ({
          id: m.id,
          public_id: modelPublicId(m),
          model_id: m.model_id,
          pretty_id: m.pretty_id,
          display_name: m.display_name,
          provider_id: m.provider_id,
          provider_name: m.provider_name,
          capabilities: m.capabilities,
          media_settings: m.media_settings ?? {},
        }));
        setModels(mapped);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMediaModels();
  }, []);

  const imgCount = models.filter((m) => m.capabilities?.image_generation === true || Boolean(m.media_settings?.image)).length;
  const ttsCount = models.filter((m) => m.capabilities?.text_to_speech === true || Boolean(m.media_settings?.text_to_speech)).length;
  const videoCount = models.filter((m) => m.capabilities?.video_generation === true || Boolean(m.media_settings?.video)).length;

  return (
    <div className="w-full space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-normal tracking-tight text-foreground">
              Multimodal & Media Hub
            </h1>
            <Badge variant="outline" className="border-border text-xs font-normal">
              Media Engine
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Generate, edit, and synthesize generative media across heterogeneous models and providers.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadMediaModels}
          disabled={loading}
          className="gap-1.5 text-xs font-normal"
        >
          <RefreshIcon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Models
        </Button>
      </div>

      {/* Tabs Navigation */}
      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setTab("image")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors focus-visible:outline-none ${
            tab === "image"
              ? "border-foreground font-normal text-foreground"
              : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
          }`}
        >
          <ImageIcon className="size-4" />
          <span>Image Studio</span>
          <span className="rounded-full bg-accent px-1.5 py-0.2 text-[10px] text-foreground font-mono">
            {imgCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("tts")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors focus-visible:outline-none ${
            tab === "tts"
              ? "border-foreground font-normal text-foreground"
              : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
          }`}
        >
          <TtsIcon className="size-4" />
          <span>Speech (TTS)</span>
          <span className="rounded-full bg-accent px-1.5 py-0.2 text-[10px] text-foreground font-mono">
            {ttsCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("video")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors focus-visible:outline-none ${
            tab === "video"
              ? "border-foreground font-normal text-foreground"
              : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
          }`}
        >
          <VideoIcon className="size-4" />
          <span>Video Studio</span>
          <span className="rounded-full bg-accent px-1.5 py-0.2 text-[10px] text-foreground font-mono">
            {videoCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("api")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors focus-visible:outline-none ${
            tab === "api"
              ? "border-foreground font-normal text-foreground"
              : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
          }`}
        >
          <CodeIcon className="size-4" />
          <span>API Reference</span>
        </button>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div>
          {tab === "image" && <ImageStudio models={models} />}
          {tab === "tts" && <SpeechStudio models={models} />}
          {tab === "video" && <VideoStudio models={models} />}
          {tab === "api" && <MediaApiDocs />}
        </div>
      )}
    </div>
  );
}
