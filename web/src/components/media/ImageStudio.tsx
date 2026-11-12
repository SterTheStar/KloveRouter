import React, { useState, useEffect } from "react";
import {
  RiImageLine as ImageIcon,
  RiDownloadLine as DownloadIcon,
  RiFileCopyLine as CopyIcon,
  RiLoader4Line as LoaderIcon,
  RiSparklingLine as SparkleIcon,
  RiUploadCloud2Line as UploadIcon,
  RiCheckLine as CheckIcon,
  RiZoomInLine as ZoomIcon,
  RiCloseLine as CloseIcon,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mediaApi } from "../../api/client";
import { useToast } from "@/components/ui/toast";
import type { MediaModelItem } from "../../types";

interface ImageStudioProps {
  models: MediaModelItem[];
}

export function ImageStudio({ models }: ImageStudioProps) {
  const { success, error: notifyError } = useToast();
  const imageModels = models.filter(
    (m) => m.capabilities?.image_generation === true || Boolean(m.media_settings?.image),
  );

  const [selectedModel, setSelectedModel] = useState<string>(
    imageModels[0]?.public_id || "",
  );

  useEffect(() => {
    if (!selectedModel && imageModels.length > 0) {
      setSelectedModel(imageModels[0].public_id);
    }
  }, [imageModels, selectedModel]);

  const [mode, setMode] = useState<"generate" | "edit" | "variation">("generate");
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [quality, setQuality] = useState("standard");
  const [style, setStyle] = useState("vivid");
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<Array<{ url?: string; b64_json?: string; revised_prompt?: string }>>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [maskFile, setMaskFile] = useState<File | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [previewModalImg, setPreviewModalImg] = useState<string | null>(null);

  const activeModelObj = imageModels.find((m) => m.public_id === selectedModel);
  const isDallE3 = Boolean(activeModelObj && /dall[-_ ]?e[-_ ]?3/i.test(activeModelObj.model_id));

  const handleGenerate = async () => {
    if (!selectedModel) {
      notifyError("No model selected", "Please select an image generation model.");
      return;
    }

    if (mode !== "variation" && !prompt.trim()) {
      notifyError("Prompt required", "Please describe what image you want to generate.");
      return;
    }

    setIsGenerating(true);
    try {
      if (mode === "generate") {
        const payload: any = {
          model: selectedModel,
          prompt: prompt.trim(),
          size,
          n: 1,
        };
        if (isDallE3) {
          payload.quality = quality;
          payload.style = style;
        }
        const res = await mediaApi.generateImage(payload);
        if (res.data && res.data.length > 0) {
          setResults((prev) => [...res.data, ...prev]);
          success("Image generated successfully!");
        }
      } else if (mode === "edit") {
        if (!selectedFile) {
          notifyError("Image required", "Please upload a source image to edit.");
          setIsGenerating(false);
          return;
        }
        const formData = new FormData();
        formData.append("model", selectedModel);
        formData.append("prompt", prompt.trim());
        formData.append("image", selectedFile);
        if (maskFile) formData.append("mask", maskFile);
        formData.append("size", size);

        const res = await mediaApi.editImage(formData);
        if (res.data && res.data.length > 0) {
          setResults((prev) => [...res.data, ...prev]);
          success("Image edited successfully!");
        }
      } else if (mode === "variation") {
        if (!selectedFile) {
          notifyError("Image required", "Please upload a source image for variations.");
          setIsGenerating(false);
          return;
        }
        const formData = new FormData();
        formData.append("model", selectedModel);
        formData.append("image", selectedFile);
        formData.append("size", size);

        const res = await mediaApi.varyImage(formData);
        if (res.data && res.data.length > 0) {
          setResults((prev) => [...res.data, ...prev]);
          success("Image variation generated successfully!");
        }
      }
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : typeof err === "string" ? err : JSON.stringify(err);
      notifyError("Generation failed", msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const getImgSrc = (item: { url?: string; b64_json?: string }) => {
    if (item.url) return item.url;
    if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
    return "";
  };

  const copyImage = (item: { url?: string; b64_json?: string }, index: number) => {
    const src = getImgSrc(item);
    if (!src) return;
    navigator.clipboard.writeText(src);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
    success("Copied to clipboard!");
  };

  const downloadImage = (item: { url?: string; b64_json?: string }, index: number) => {
    const src = getImgSrc(item);
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = `saturn-image-${Date.now()}-${index + 1}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Controls Column */}
        <div className="space-y-4 lg:col-span-1">
          <Card className="border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-normal tracking-tight">Image Studio</CardTitle>
              <CardDescription className="text-xs">
                Generate images, perform inpainting edits, or create visual variations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {/* Mode Selector */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Operation Mode</Label>
                <div className="grid grid-cols-3 gap-1 rounded-lg border border-border p-1 bg-muted/30">
                  <button
                    type="button"
                    onClick={() => setMode("generate")}
                    className={`rounded-md py-1.5 text-xs font-normal transition-colors ${
                      mode === "generate" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Generate
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("edit")}
                    className={`rounded-md py-1.5 text-xs font-normal transition-colors ${
                      mode === "edit" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("variation")}
                    className={`rounded-md py-1.5 text-xs font-normal transition-colors ${
                      mode === "variation" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Variations
                  </button>
                </div>
              </div>

              {/* Model Picker */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Model</Label>
                {imageModels.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                    No active image generation models found. Please configure a provider with image capabilities (e.g., DALL-E, Flux, Imagen).
                  </div>
                ) : (
                  <select
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                  >
                    {imageModels.map((m) => (
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

              {/* Image Upload for Edit & Variation */}
              {(mode === "edit" || mode === "variation") && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Source Image (PNG / JPG)</Label>
                    <label className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-4 hover:bg-accent/40 cursor-pointer">
                      <UploadIcon className="size-6 text-muted-foreground" />
                      <span className="mt-1 text-xs text-foreground font-normal">
                        {selectedFile ? selectedFile.name : "Select or drop image"}
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>

                  {mode === "edit" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Mask Image (Optional)</Label>
                      <label className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-3 hover:bg-accent/40 cursor-pointer">
                        <UploadIcon className="size-4 text-muted-foreground" />
                        <span className="mt-1 text-[11px] text-foreground font-normal">
                          {maskFile ? maskFile.name : "Select transparent mask"}
                        </span>
                        <input
                          type="file"
                          accept="image/png"
                          className="hidden"
                          onChange={(e) => setMaskFile(e.target.files?.[0] || null)}
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Prompt Input */}
              {mode !== "variation" && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Prompt</Label>
                  <Textarea
                    placeholder={
                      mode === "generate"
                        ? "A futuristic cyberpunk city at sunset with neon reflections..."
                        : "Add a red umbrella in the center of the image..."
                    }
                    rows={4}
                    className="resize-none text-xs"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                </div>
              )}

              {/* Size & Quality Settings */}
              <div className={`grid gap-2 ${isDallE3 && mode === "generate" ? "grid-cols-2" : "grid-cols-1"}`}>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Dimensions</Label>
                  <select
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                  >
                    <option value="1024x1024">1024 × 1024 (Square)</option>
                    <option value="1024x1792">1024 × 1792 (Portrait)</option>
                    <option value="1792x1024">1792 × 1024 (Landscape)</option>
                    <option value="512x512">512 × 512</option>
                    <option value="256x256">256 × 256</option>
                  </select>
                </div>
                {isDallE3 && mode === "generate" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Quality</Label>
                    <select
                      className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={quality}
                      onChange={(e) => setQuality(e.target.value)}
                    >
                      <option value="standard">Standard</option>
                      <option value="hd">High Definition (HD)</option>
                    </select>
                  </div>
                )}
              </div>

              {isDallE3 && mode === "generate" && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Visual Style</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setStyle("vivid")}
                      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                        style === "vivid" ? "border-foreground bg-accent text-foreground font-normal" : "border-border text-muted-foreground hover:bg-accent/40"
                      }`}
                    >
                      Vivid & Hyper-real
                    </button>
                    <button
                      type="button"
                      onClick={() => setStyle("natural")}
                      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                        style === "natural" ? "border-foreground bg-accent text-foreground font-normal" : "border-border text-muted-foreground hover:bg-accent/40"
                      }`}
                    >
                      Natural & Soft
                    </button>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <Button
                className="w-full gap-2 text-xs font-normal"
                onClick={handleGenerate}
                disabled={isGenerating || imageModels.length === 0}
              >
                {isGenerating ? (
                  <>
                    <LoaderIcon className="size-4 animate-spin" />
                    Generating image...
                  </>
                ) : (
                  <>
                    <SparkleIcon className="size-4" />
                    {mode === "generate" ? "Generate Image" : mode === "edit" ? "Apply Image Edit" : "Generate Variation"}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Gallery / Results Column */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="h-full border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-normal tracking-tight">Generated Output</CardTitle>
                <CardDescription className="text-xs">
                  {results.length === 0 ? "Images generated during this session will display below." : `${results.length} image(s) generated`}
                </CardDescription>
              </div>
              {results.length > 0 && (
                <Button variant="ghost" size="xs" onClick={() => setResults([])} className="text-xs text-muted-foreground">
                  Clear Gallery
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {results.length === 0 ? (
                <div className="flex h-96 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/50 text-center">
                  <div className="rounded-full bg-accent p-3 text-muted-foreground">
                    <ImageIcon className="size-8" />
                  </div>
                  <h3 className="mt-3 text-sm font-normal text-foreground">Canvas is ready</h3>
                  <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                    Type a prompt on the left and select an active model to generate high-resolution AI artwork.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {results.map((item, index) => {
                    const src = getImgSrc(item);
                    return (
                      <div key={index} className="group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                        <div className="relative aspect-square w-full overflow-hidden bg-muted/20">
                          <img
                            src={src}
                            alt={item.revised_prompt || `Result ${index + 1}`}
                            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 flex items-center justify-center gap-2">
                            <Button
                              size="icon-xs"
                              variant="secondary"
                              className="size-8 rounded-full"
                              onClick={() => setPreviewModalImg(src)}
                              title="Zoom Preview"
                            >
                              <ZoomIcon className="size-4" />
                            </Button>
                            <Button
                              size="icon-xs"
                              variant="secondary"
                              className="size-8 rounded-full"
                              onClick={() => copyImage(item, index)}
                              title="Copy URL or base64"
                            >
                              {copiedIndex === index ? <CheckIcon className="size-4 text-emerald-500" /> : <CopyIcon className="size-4" />}
                            </Button>
                            <Button
                              size="icon-xs"
                              variant="secondary"
                              className="size-8 rounded-full"
                              onClick={() => downloadImage(item, index)}
                              title="Download PNG"
                            >
                              <DownloadIcon className="size-4" />
                            </Button>
                          </div>
                        </div>
                        {item.revised_prompt && (
                          <div className="border-t border-border p-2.5">
                            <p className="line-clamp-2 text-[11px] text-muted-foreground" title={item.revised_prompt}>
                              {item.revised_prompt}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Image Zoom Modal */}
      {previewModalImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewModalImg(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-lg bg-card" onClick={(e) => e.stopPropagation()}>
            <button
              className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
              onClick={() => setPreviewModalImg(null)}
            >
              <CloseIcon className="size-5" />
            </button>
            <img src={previewModalImg} alt="Preview" className="max-h-[85vh] max-w-[85vw] object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
