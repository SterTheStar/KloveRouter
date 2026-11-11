import type React from "react";

export default function SaturnBetaBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`text-2xl font-semibold tracking-tight text-[#0b7fff] dark:text-[#64a9ff] select-none ${className}`}
      style={{ fontFamily: "'Playwrite NZ Basic', cursive" }}
      aria-label="Beta"
    >
      Beta
    </span>
  );
}
