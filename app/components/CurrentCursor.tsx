"use client";

import { useLayoutEffect, useRef } from "react";
import { getUserColor } from "@/app/utils/cursor-utils";

export function CurrentCursor({ id }: { id: string }) {
  const cursorRef = useRef<HTMLDivElement>(null);
  const color = getUserColor(id);

  useLayoutEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      // Directly update DOM for zero-latency cursor movement
      if (cursorRef.current) {
        const container = cursorRef.current.parentElement;
        if (container) {
          const rect = container.getBoundingClientRect();
          cursorRef.current.style.left = `${event.clientX - rect.left}px`;
          cursorRef.current.style.top = `${event.clientY - rect.top}px`;
        }
      }
    };

    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <div
      ref={cursorRef}
      className="pointer-events-none absolute z-50"
      style={{
        left: 0,
        top: 0,
        transform: "translate(-2px, -2px)",
      }}
    >
      {/* Cursor pointer - NO transitions for local cursor */}
      <svg
        width="25"
        height="25"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))" }}
      >
        <path
          d="M3 3L3 17L8 12L13 12L3 3Z"
          fill={color}
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>

      {/* Name tag */}
      <div
        className="absolute left-2 top-5 whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium text-white shadow-lg"
        style={{
          backgroundColor: color,
        }}
      >
        @{id}
      </div>
    </div>
  );
}
