import type React from "react";

export default function SidebarResizeHandle({
  onMouseDown,
  onDoubleClick,
  isResizing = false,
  className = "",
}: {
  onMouseDown: (event: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  isResizing?: boolean;
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      tabIndex={0}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      title="Drag to resize (double-click to reset)"
      className={`group absolute -right-1.5 top-0 bottom-0 z-30 hidden w-3 cursor-col-resize select-none items-center justify-center md:flex ${className}`}
    >
      <div
        className={`h-full w-[2px] transition-colors duration-150 ${
          isResizing
            ? "bg-primary"
            : "bg-transparent group-hover:bg-primary/50 group-active:bg-primary"
        }`}
      />
    </div>
  );
}
