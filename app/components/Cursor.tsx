"use client";

import { getUserColor } from "@/app/utils/cursor-utils";

type CursorProps = {
  id: string;
  x: number;
  y: number;
};

export function Cursor({ id, x, y }: CursorProps) {
  const color = getUserColor(id);

  return (
    <div
      className="pointer-events-none absolute z-50 transition-all duration-75 ease-linear"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: "translate(-2px, -2px)",
      }}
    >
      {/* Cursor pointer */}
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
