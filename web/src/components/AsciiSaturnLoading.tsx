import { useEffect, useRef, useState } from "react";

const PATH_1 =
  "M495.947,111.21c-18.032-31.24-62.452-43.284-125.068-33.92c-6.476,0.976-10.94,7.008-9.968,13.488 c0.964,6.48,7.008,10.944,13.48,9.98c51.556-7.712,88.372,0.42,101.012,22.316c24.088,41.72-39.852,138.192-173.432,215.312 c-61.076,35.264-123.98,58.544-177.132,65.56c-48.868,6.448-83.876-1.936-96.048-23.016c-12.636-21.892-1.284-57.828,31.14-98.592 c4.076-5.128,3.228-12.588-1.9-16.668c-5.116-4.08-12.584-3.228-16.664,1.896C1.979,317.09-9.785,361.562,8.243,392.794 c14.02,24.272,44.172,37,86.408,37c10.392,0,21.508-0.776,33.292-2.336c56.16-7.412,122.18-31.752,185.888-68.532 C450.571,279.978,530.563,171.17,495.947,111.21z";

const PATH_2 =
  "M252.099,38.574c-117.684,0-213.432,95.744-213.432,213.428c0,69.496,33.408,131.32,84.984,170.32 c5.712-0.348,11.656-0.92,17.828-1.74c53.152-7.012,116.06-30.296,177.132-65.56c66.98-38.668,116.436-82.204,146.084-121.264 C455.403,124.59,363.631,38.574,252.099,38.574z";

const PATH_3 =
  "M330.471,375.566c-59.5,34.352-121.008,57.84-174.616,66.832c28.936,14.692,61.624,23.028,96.248,23.028 c111.5,0,203.248-85.964,212.588-195.088C431.775,306.83,385.767,343.642,330.471,375.566z";

const CHARSET = " .:-=+*#%@";
const GLITCH = "01#%*+=-:.░▒▓";

const COLS = 64;
const ROWS = 30;

function sampleSaturnGrid(cols: number, rows: number): number[][] {
  if (typeof document === "undefined") return [];
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  ctx.clearRect(0, 0, cols, rows);
  ctx.fillStyle = "#ffffff";

  const charAspect = 0.55;
  const targetSize = Math.min(cols, rows / charAspect) * 0.82;
  const scaleX = targetSize / 504;
  const scaleY = (targetSize * charAspect) / 504;
  const tx = (cols - 504 * scaleX) / 2;
  const ty = (rows - 504 * scaleY) / 2;

  ctx.save();
  ctx.translate(tx, ty);
  ctx.scale(scaleX, scaleY);

  if (typeof Path2D !== "undefined") {
    try {
      const p1 = new Path2D(PATH_1);
      const p2 = new Path2D(PATH_2);
      const p3 = new Path2D(PATH_3);
      ctx.fill(p1);
      ctx.fill(p2);
      ctx.fill(p3);
    } catch {
      // Fallback
    }
  }
  ctx.restore();

  const imgData = ctx.getImageData(0, 0, cols, rows);
  const grid: number[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: number[] = [];
    for (let x = 0; x < cols; x++) {
      const idx = (y * cols + x) * 4;
      const alpha = imgData.data[idx + 3] / 255;
      const r = imgData.data[idx] / 255;
      row.push(r * alpha);
    }
    grid.push(row);
  }
  return grid;
}

export default function AsciiSaturnLoading({
  status = "Initializing Saturn",
}: {
  status?: string;
}) {
  const [asciiArt, setAsciiArt] = useState<string>("");
  const gridRef = useRef<number[][] | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const clickWaveRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    gridRef.current = sampleSaturnGrid(COLS, ROWS);
  }, []);

  useEffect(() => {
    let animationFrameId: number;

    const render = () => {
      const grid = gridRef.current;
      if (!grid || grid.length === 0) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      // Reveal spreads outward smoothly over 3.0 seconds
      const revealProgress = Math.min(1.0, elapsed / 3.0);
      const isFullyRevealed = revealProgress >= 1.0;
      const maxDistance = 0.9;
      const currentRevealRadius = revealProgress * maxDistance;

      const clickWave = clickWaveRef.current;
      const clickElapsed = clickWave ? (Date.now() - clickWave.time) / 1000 : 999;
      const clickRadius = clickElapsed * 1.5;

      const lines: string[] = [];
      const cx = COLS / 2;
      const cy = ROWS / 2;

      for (let y = 0; y < ROWS; y++) {
        let line = "";
        for (let x = 0; x < COLS; x++) {
          const brightness = grid[y][x];

          if (brightness < 0.03) {
            line += " ";
            continue;
          }

          if (!isFullyRevealed) {
            // Distance from center for radial typewriter wave
            const dx = (x - cx) / COLS;
            const dy = (y - cy) / ROWS;
            const dist = Math.hypot(dx, dy * 1.4);

            if (dist > currentRevealRadius) {
              line += " ";
              continue;
            }

            // On the reveal wave front, scramble with random glitch characters
            if (dist > currentRevealRadius - 0.08) {
              const randIdx = Math.floor(Math.random() * GLITCH.length);
              line += GLITCH[randIdx];
              continue;
            }
          }

          // Optional click ripple sweep
          let extraBrightness = 0;
          if (clickWave && clickElapsed < 2.0) {
            const cdx = (x - clickWave.x) / COLS;
            const cdy = (y - clickWave.y) / ROWS;
            const cdist = Math.hypot(cdx, cdy * 1.4);
            if (Math.abs(cdist - clickRadius) < 0.08) {
              const randIdx = Math.floor(Math.random() * GLITCH.length);
              line += GLITCH[randIdx];
              continue;
            }
            if (Math.abs(cdist - clickRadius) < 0.18) {
              extraBrightness = 0.25;
            }
          }

          // Subtle atmospheric wave that shimmers continuously
          const wave = Math.sin(x * 0.22 + y * 0.15 - elapsed * 2.2) * 0.07;
          const totalB = Math.max(0, Math.min(1, brightness + wave + extraBrightness));
          const charIndex = Math.min(
            CHARSET.length - 1,
            Math.max(1, Math.floor(totalB * (CHARSET.length - 1))),
          );

          line += CHARSET[charIndex];
        }
        lines.push(line);
      }

      setAsciiArt(lines.join("\n"));
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * COLS;
    const clickY = ((e.clientY - rect.top) / rect.height) * ROWS;
    clickWaveRef.current = { x: clickX, y: clickY, time: Date.now() };
  };

  return (
    <div
      onClick={handleClick}
      className="flex min-h-svh w-full flex-col items-center justify-center bg-background px-2 sm:px-4 select-none cursor-pointer overflow-hidden animate-in fade-in duration-300"
      title="Click to ripple ASCII waves"
    >
      <div className="flex flex-col items-center max-w-full">
        <pre
          className="font-mono text-[7px] leading-[1.08] sm:text-[9.5px] sm:leading-[1.1] md:text-[11px] md:leading-[1.12] tracking-wider text-foreground font-semibold drop-shadow-[0_0_12px_rgba(255,255,255,0.08)] overflow-visible text-center"
          style={{ fontFamily: "'Geist Mono', ui-monospace, SFMono-Regular, monospace" }}
        >
          {asciiArt}
        </pre>

        <div className="mt-8 flex flex-col items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <span className="font-mono text-xs font-medium tracking-wide text-foreground">
            {status}
          </span>
          <span className="text-[11px] text-tertiary">Connecting gateway services</span>
        </div>
      </div>
    </div>
  );
}
