import React, { useState, useEffect } from "react";
import {
  RiMovieLine as VideoIcon,
  RiDownloadLine as DownloadIcon,
  RiLoader4Line as LoaderIcon,
  RiRefreshLine as RefreshIcon,
  RiStopCircleLine as StopIcon,
  RiDeleteBinLine as DeleteIcon,
  RiCheckLine as CheckIcon,
  RiErrorWarningLine as ErrorIcon,
  RiSparklingLine as SparkleIcon,
  RiFilmLine as FilmIcon,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mediaApi } from "../../api/client";
import { useToast } from "@/components/ui/toast";
import type { MediaModelItem, VideoJobItem } from "../../types";

interface VideoStudioProps {
  models: MediaModelItem[];
}

export function VideoStudio({ models }: VideoStudioProps) {
  const { success, error: notifyError } = useToast();
  const videoModels = models.filter(
    (m) => m.capabilities?.video_generation === true || Boolean(m.media_settings?.video),
  );

  const [selectedModel, setSelectedModel] = useState<string>(
    videoModels[0]?.public_id || "",
  );

  useEffect(() => {
    if (!selectedModel && videoModels.length > 0) {
      setSelectedModel(videoModels[0].public_id);
    }
  }, [videoModels, selectedModel]);

  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<string>("std");
  const [seconds, setSeconds] = useState(5);
  const [size, setSize] = useState("1280x720");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobs, setJobs] = useState<VideoJobItem[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  const activeModelObj = videoModels.find((m) => m.public_id === selectedModel);

  const loadJobs = async () => {
    setLoadingJobs(true);
    try {
      const res = await mediaApi.listVideos({ limit: 20 });
      if (res.data) {
        setJobs(res.data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingJobs(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  // Poll for incomplete jobs every 5 seconds
  useEffect(() => {
    const hasPending = jobs.some((j) => j.status === "queued" || j.status === "processing" || j.status === "in_progress");
    if (!hasPending) return;

    const interval = setInterval(() => {
      loadJobs();
    }, 5000);

    return () => clearInterval(interval);
  }, [jobs]);

  const handleCreateVideo = async () => {
    if (!selectedModel) {
      notifyError("No model selected", "Please select a video generation model.");
      return;
    }

    if (!prompt.trim()) {
      notifyError("Prompt required", "Please describe what video you want to generate.");
      return;
    }

    setIsSubmitting(true);
    try {
      const job = await mediaApi.createVideo({
        model: selectedModel,
        prompt: prompt.trim(),
        mode: mode || "std",
        seconds,
        size,
      });

      setJobs((prev) => [job, ...prev]);
      success("Video generation task queued!");
      setPrompt("");
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : typeof err === "string" ? err : JSON.stringify(err);
      notifyError("Failed to queue video", msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelJob = async (id: string) => {
    try {
      await mediaApi.cancelVideo(id);
      success("Video task canceled");
      loadJobs();
    } catch (err: any) {
      notifyError("Cancel failed", err.message);
    }
  };

  const handleDeleteJob = async (id: string) => {
    try {
      await mediaApi.deleteVideo(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
      if (activeVideoId === id) setActiveVideoId(null);
      success("Video deleted");
    } catch (err: any) {
      notifyError("Delete failed", err.message);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]"><CheckIcon className="size-3 mr-1" />Completed</Badge>;
      case "failed":
        return <Badge variant="destructive" className="text-[10px]"><ErrorIcon className="size-3 mr-1" />Failed</Badge>;
      case "cancelled":
        return <Badge variant="secondary" className="text-[10px]">Canceled</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px] animate-pulse"><LoaderIcon className="size-3 mr-1 animate-spin" />Processing</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Controls Column */}
        <div className="space-y-4 lg:col-span-1">
          <Card className="border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-normal tracking-tight">Video Studio</CardTitle>
              <CardDescription className="text-xs">
                Generate asynchronous video clips and cinematic animations from textual prompts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {/* Model Picker */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Model</Label>
                {videoModels.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                    No active video generation models found. Please configure a provider with video capabilities (e.g., Sora, Luma, Runway, Wan).
                  </div>
                ) : (
                  <select
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                  >
                    {videoModels.map((m) => (
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

              {/* Prompt Input */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Video Prompt</Label>
                <Textarea
                  placeholder="A cinematic drone shot flying over a majestic misty mountain range at sunrise..."
                  rows={4}
                  className="resize-none text-xs"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>

              {/* Video Settings */}
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Generation Mode</Label>
                  <select
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                  >
                    <option value="std">Standard (std) - Default</option>
                    <option value="pro">Professional (pro) - High fidelity</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Resolution</Label>
                    <select
                      className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                    >
                      <option value="1280x720">720p Landscape (1280×720)</option>
                      <option value="1920x1080">1080p Full HD (1920×1080)</option>
                      <option value="720x1280">720p Portrait (720×1280)</option>
                      <option value="1080x1920">1080p Portrait (1080×1920)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Duration (Seconds)</Label>
                    <Input
                      type="number"
                      min={2}
                      max={30}
                      className="h-8 text-xs"
                      value={seconds}
                      onChange={(e) => setSeconds(Math.max(1, Number(e.target.value)))}
                    />
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <Button
                className="w-full gap-2 text-xs font-normal"
                onClick={handleCreateVideo}
                disabled={isSubmitting || videoModels.length === 0}
              >
                {isSubmitting ? (
                  <>
                    <LoaderIcon className="size-4 animate-spin" />
                    Submitting task...
                  </>
                ) : (
                  <>
                    <SparkleIcon className="size-4" />
                    Generate Video Task
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Video Player & Task List Column */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="h-full border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-normal tracking-tight">Active Tasks & Player</CardTitle>
                <CardDescription className="text-xs">
                  Video generation runs asynchronously on upstream GPUs.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="xs"
                onClick={loadJobs}
                disabled={loadingJobs}
                className="text-xs gap-1"
              >
                <RefreshIcon className={`size-3.5 ${loadingJobs ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Active Video Player */}
              {activeVideoId && (
                <div className="overflow-hidden rounded-xl border border-border bg-black shadow-sm">
                  <video
                    controls
                    autoPlay
                    src={mediaApi.getVideoContentUrl(activeVideoId)}
                    className="w-full max-h-80 object-contain mx-auto"
                  />
                  <div className="bg-card p-3 flex items-center justify-between border-t border-border">
                    <p className="font-mono text-xs text-muted-foreground truncate">Task: {activeVideoId}</p>
                    <a
                      href={mediaApi.getVideoContentUrl(activeVideoId)}
                      download={`saturn-video-${activeVideoId}.mp4`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:bg-accent"
                    >
                      <DownloadIcon className="size-3.5" />
                      Download MP4
                    </a>
                  </div>
                </div>
              )}

              {/* Jobs List */}
              {jobs.length === 0 ? (
                <div className="flex h-80 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/50 text-center">
                  <div className="rounded-full bg-accent p-3 text-muted-foreground">
                    <FilmIcon className="size-8" />
                  </div>
                  <h3 className="mt-3 text-sm font-normal text-foreground">No video tasks yet</h3>
                  <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                    Submit a prompt to start rendering high-quality video clips asynchronously.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                  {jobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/20"
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-foreground truncate">{job.id}</span>
                          {getStatusBadge(job.status)}
                        </div>
                        {job.model && (
                          <p className="mt-1 font-mono text-[10px] text-muted-foreground">Model: {job.model}</p>
                        )}
                        {job.error && (
                          <p className="mt-1 text-[11px] text-destructive truncate">{job.error.message}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {job.status === "completed" && (
                          <>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => setActiveVideoId(job.id)}
                              className="text-xs gap-1"
                            >
                              <VideoIcon className="size-3.5" />
                              Watch
                            </Button>
                            <a
                              href={mediaApi.getVideoContentUrl(job.id)}
                              download={`saturn-video-${job.id}.mp4`}
                              className="inline-flex size-7 items-center justify-center rounded-md border border-border hover:bg-accent text-foreground"
                              title="Download MP4"
                            >
                              <DownloadIcon className="size-3.5" />
                            </a>
                          </>
                        )}
                        {(job.status === "queued" || job.status === "processing" || job.status === "in_progress") && (
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            className="size-7 text-muted-foreground hover:text-foreground"
                            onClick={() => handleCancelJob(job.id)}
                            title="Cancel Job"
                          >
                            <StopIcon className="size-4" />
                          </Button>
                        )}
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          className="size-7 text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteJob(job.id)}
                          title="Delete Job Record"
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
