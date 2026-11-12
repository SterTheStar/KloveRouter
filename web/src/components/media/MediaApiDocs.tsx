import React, { useState } from "react";
import {
  RiCodeSSlashLine as CodeIcon,
  RiFileCopyLine as CopyIcon,
  RiCheckLine as CheckIcon,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

const SNIPPETS = [
  {
    id: "img-gen",
    method: "POST",
    path: "/v1/images/generations",
    title: "Image Generation",
    description: "Generates high resolution images from text prompts (DALL-E 3, Flux, etc.).",
    curl: `curl http://localhost:3000/v1/images/generations \\
  -H "Authorization: Bearer YOUR_SATURN_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/dall-e-3",
    "prompt": "A majestic eagle soaring over sunlit alpine mountains",
    "size": "1024x1024",
    "quality": "hd",
    "n": 1
  }'`,
  },
  {
    id: "img-edit",
    method: "POST",
    path: "/v1/images/edits",
    title: "Image Editing & Inpainting",
    description: "Modifies existing images using prompts and optional transparency masks.",
    curl: `curl http://localhost:3000/v1/images/edits \\
  -H "Authorization: Bearer YOUR_SATURN_KEY" \\
  -F model="openai/dall-e-2" \\
  -F prompt="Add a bright red hot air balloon in the sky" \\
  -F image="@original.png" \\
  -F mask="@mask.png"`,
  },
  {
    id: "img-var",
    method: "POST",
    path: "/v1/images/variations",
    title: "Image Variations",
    description: "Produces stylistic and composition variations of a given source image.",
    curl: `curl http://localhost:3000/v1/images/variations \\
  -H "Authorization: Bearer YOUR_SATURN_KEY" \\
  -F model="openai/dall-e-2" \\
  -F image="@original.png" \\
  -F n=1`,
  },
  {
    id: "audio-speech",
    method: "POST",
    path: "/v1/audio/speech",
    title: "Text to Speech (TTS)",
    description: "Synthesizes expressive spoken audio in MP3, WAV, AAC, or Opus format.",
    curl: `curl http://localhost:3000/v1/audio/speech \\
  -H "Authorization: Bearer YOUR_SATURN_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/tts-1",
    "input": "Welcome to Saturn Router. High performance AI control plane.",
    "voice": "alloy",
    "response_format": "mp3",
    "speed": 1.0
  }' --output speech.mp3`,
  },
  {
    id: "video-create",
    method: "POST",
    path: "/v1/videos",
    title: "Create Video Generation Task",
    description: "Submits an asynchronous video generation job returning a job ID.",
    curl: `curl http://localhost:3000/v1/videos \\
  -H "Authorization: Bearer YOUR_SATURN_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/sora-2",
    "prompt": "Cinematic drone hyperlapse moving across Tokyo neon towers",
    "seconds": 5,
    "size": "1280x720"
  }'`,
  },
  {
    id: "video-status",
    method: "GET",
    path: "/v1/videos/:id",
    title: "Video Task Status & Details",
    description: "Retrieves status and completion state for a specific video job.",
    curl: `curl http://localhost:3000/v1/videos/video_abc123 \\
  -H "Authorization: Bearer YOUR_SATURN_KEY"`,
  },
  {
    id: "video-stream",
    method: "GET",
    path: "/v1/videos/:id/content",
    title: "Video Content Binary Stream",
    description: "Streams or downloads the completed MP4 binary video file.",
    curl: `curl http://localhost:3000/v1/videos/video_abc123/content \\
  -H "Authorization: Bearer YOUR_SATURN_KEY" \\
  --output video.mp4`,
  },
];

export function MediaApiDocs() {
  const { success } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copySnippet = (curl: string, id: string) => {
    navigator.clipboard.writeText(curl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    success("cURL copied to clipboard!");
  };

  return (
    <div className="space-y-4">
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CodeIcon className="size-5 text-foreground" />
            <CardTitle className="text-base font-normal tracking-tight">Multimodal & Media Hub API Reference</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Standard OpenAI-compatible media endpoints. Connect any third-party app, CLI, agent, or custom SDK using Saturn API Keys.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {SNIPPETS.map((snippet) => (
              <div key={snippet.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={snippet.method === "POST" ? "default" : "outline"} className="font-mono text-[10px]">
                      {snippet.method}
                    </Badge>
                    <span className="font-mono text-xs font-semibold text-foreground">{snippet.path}</span>
                    <span className="text-xs text-muted-foreground">• {snippet.title}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => copySnippet(snippet.curl, snippet.id)}
                    className="text-xs gap-1.5"
                  >
                    {copiedId === snippet.id ? <CheckIcon className="size-3.5 text-emerald-500" /> : <CopyIcon className="size-3.5" />}
                    Copy cURL
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{snippet.description}</p>
                <pre className="overflow-x-auto rounded-lg bg-muted/40 p-3 font-mono text-[11px] text-foreground border border-border/60">
                  {snippet.curl}
                </pre>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
