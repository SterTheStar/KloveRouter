import React, { useState, useEffect } from "react";
import {
  RiVoiceprintLine as TtsIcon,
  RiDownloadLine as DownloadIcon,
  RiPlayLine as PlayIcon,
  RiPauseLine as PauseIcon,
  RiLoader4Line as LoaderIcon,
  RiVolumeUpLine as VolumeIcon,
  RiSparklingLine as SparkleIcon,
  RiDeleteBinLine as DeleteIcon,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { mediaApi } from "../../api/client";
import { useToast } from "@/components/ui/toast";
import type { MediaModelItem } from "../../types";

interface SpeechStudioProps {
  models: MediaModelItem[];
}

interface AudioHistoryItem {
  id: string;
  url: string;
  text: string;
  voice: string;
  format: string;
  model: string;
  timestamp: string;
}

const VOICES = [
  { id: "alloy", name: "Alloy", desc: "Neutral & balanced" },
  { id: "echo", name: "Echo", desc: "Warm & conversational" },
  { id: "fable", name: "Fable", desc: "Expressive & story-like" },
  { id: "onyx", name: "Onyx", desc: "Authoritative & deep" },
  { id: "nova", name: "Nova", desc: "Friendly & energetic" },
  { id: "shimmer", name: "Shimmer", desc: "Clear & bright" },
];

const FORMATS = ["mp3", "opus", "aac", "flac", "wav"];

export function SpeechStudio({ models }: SpeechStudioProps) {
  const { success, error: notifyError } = useToast();
  const ttsModels = models.filter(
    (m) => m.capabilities?.text_to_speech === true || Boolean(m.media_settings?.text_to_speech),
  );

  const [selectedModel, setSelectedModel] = useState<string>(
    ttsModels[0]?.public_id || "",
  );

  useEffect(() => {
    if (!selectedModel && ttsModels.length > 0) {
      setSelectedModel(ttsModels[0].public_id);
    }
  }, [ttsModels, selectedModel]);

  const [text, setText] = useState("");
  const [voice, setVoice] = useState("alloy");
  const [format, setFormat] = useState("mp3");
  const [speed, setSpeed] = useState<number>(1.0);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [audioItems, setAudioItems] = useState<AudioHistoryItem[]>([]);
  const [activeAudioUrl, setActiveAudioUrl] = useState<string | null>(null);

  const activeModelObj = ttsModels.find((m) => m.public_id === selectedModel);

  const handleSynthesize = async () => {
    if (!selectedModel) {
      notifyError("No model selected", "Please select a text-to-speech model.");
      return;
    }

    if (!text.trim()) {
      notifyError("Text required", "Please enter the script or message to synthesize.");
      return;
    }

    setIsSynthesizing(true);
    try {
      const blob = await mediaApi.speech({
        model: selectedModel,
        input: text.trim(),
        voice,
        response_format: format,
        speed,
      });

      const audioUrl = URL.createObjectURL(blob);
      const newItem: AudioHistoryItem = {
        id: `speech_${Date.now()}`,
        url: audioUrl,
        text: text.trim(),
        voice,
        format,
        model: selectedModel,
        timestamp: new Date().toLocaleTimeString(),
      };

      setAudioItems((prev) => [newItem, ...prev]);
      setActiveAudioUrl(audioUrl);
      success("Speech synthesized successfully!");
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : typeof err === "string" ? err : JSON.stringify(err);
      notifyError("Synthesis failed", msg);
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleDownload = (item: AudioHistoryItem) => {
    const a = document.createElement("a");
    a.href = item.url;
    a.download = `saturn-speech-${item.voice}-${Date.now()}.${item.format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleRemove = (id: string) => {
    setAudioItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Input & Parameters Controls */}
        <div className="space-y-4 lg:col-span-1">
          <Card className="border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-normal tracking-tight">Speech Studio (TTS)</CardTitle>
              <CardDescription className="text-xs">
                Synthesize spoken audio from text with natural voices and audio formats.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {/* Model Picker */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Model</Label>
                {ttsModels.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                    No active text-to-speech models found. Please configure a provider with TTS capabilities (e.g., OpenAI TTS-1, ElevenLabs).
                  </div>
                ) : (
                  <select
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                  >
                    {ttsModels.map((m) => (
                      <option key={m.id} value={m.public_id}>
                        {m.display_name || m.model_id} ({m.provider_name})
                      </option>
                    ))}
                  </select>
                )}
                {activeModelObj && (
                  <p className="font-mono text-[10px] text-muted-foreground">ID: {activeModelObj.public_id}</p>
                )}
              </div>

              {/* Text Input */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Text Script</Label>
                <Textarea
                  placeholder="Enter the text to read aloud..."
                  rows={4}
                  className="resize-none text-xs"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </div>

              {/* Voice Selection */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Voice</Label>
                <div className="grid grid-cols-2 gap-2">
                  {VOICES.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVoice(v.id)}
                      className={`flex flex-col items-start rounded-lg border p-2 text-left transition-colors ${
                        voice === v.id
                          ? "border-foreground bg-accent text-foreground"
                          : "border-border text-muted-foreground hover:bg-accent/40"
                      }`}
                    >
                      <span className="text-xs font-normal text-foreground">{v.name}</span>
                      <span className="text-[10px] text-muted-foreground">{v.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Format & Speed Settings */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Format</Label>
                  <select
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                  >
                    {FORMATS.map((f) => (
                      <option key={f} value={f}>
                        {f.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-muted-foreground">Speed</Label>
                    <span className="font-mono text-[10px] text-muted-foreground">{speed.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.25"
                    max="4.0"
                    step="0.05"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    className="w-full h-2 rounded-lg bg-accent cursor-pointer accent-foreground"
                  />
                </div>
              </div>

              {/* Action Button */}
              <Button
                className="w-full gap-2 text-xs font-normal"
                onClick={handleSynthesize}
                disabled={isSynthesizing || ttsModels.length === 0}
              >
                {isSynthesizing ? (
                  <>
                    <LoaderIcon className="size-4 animate-spin" />
                    Synthesizing audio...
                  </>
                ) : (
                  <>
                    <SparkleIcon className="size-4" />
                    Synthesize Speech
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Player and History Column */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="h-full border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-normal tracking-tight">Audio Player & History</CardTitle>
                <CardDescription className="text-xs">
                  {audioItems.length === 0 ? "Synthesized voice clips will be available here." : `${audioItems.length} clip(s) synthesized`}
                </CardDescription>
              </div>
              {audioItems.length > 0 && (
                <Button variant="ghost" size="xs" onClick={() => setAudioItems([])} className="text-xs text-muted-foreground">
                  Clear History
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Active Audio Player */}
              {activeAudioUrl ? (
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-accent p-2.5 text-foreground">
                      <VolumeIcon className="size-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-normal text-foreground">Active Preview</p>
                      <audio controls autoPlay src={activeAudioUrl} className="mt-2 w-full h-8" />
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Clip List */}
              {audioItems.length === 0 ? (
                <div className="flex h-80 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/50 text-center">
                  <div className="rounded-full bg-accent p-3 text-muted-foreground">
                    <TtsIcon className="size-8" />
                  </div>
                  <h3 className="mt-3 text-sm font-normal text-foreground">No audio clips yet</h3>
                  <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                    Type a sentence and choose a voice profile to generate realistic speech in seconds.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {audioItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/20"
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <p className="line-clamp-2 text-xs font-normal text-foreground">"{item.text}"</p>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="font-semibold capitalize text-foreground">{item.voice}</span>
                          <span>•</span>
                          <span className="uppercase">{item.format}</span>
                          <span>•</span>
                          <span>{item.timestamp}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="icon-xs"
                          variant="outline"
                          className="size-8"
                          onClick={() => setActiveAudioUrl(item.url)}
                          title="Load in Player"
                        >
                          <PlayIcon className="size-4" />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="outline"
                          className="size-8"
                          onClick={() => handleDownload(item)}
                          title="Download Audio"
                        >
                          <DownloadIcon className="size-4" />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          className="size-8 text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemove(item.id)}
                          title="Delete Clip"
                        >
                          <DeleteIcon className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
