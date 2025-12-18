// Utility functions for cursor feature

const ADJECTIVES = [
  "happy",
  "clever",
  "bright",
  "swift",
  "calm",
  "bold",
  "wise",
  "kind",
  "cool",
  "warm",
];

const NOUNS = [
  "panda",
  "tiger",
  "eagle",
  "dolphin",
  "fox",
  "wolf",
  "owl",
  "bear",
  "lion",
  "hawk",
];

export function generateUsername(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adjective}${noun}${num}`;
}

export function getUserColor(userId: string): string {
  const COLORS = [
    "#E879F9", // purple
    "#FBBF24", // yellow
    "#34D399", // green
    "#60A5FA", // blue
    "#F87171", // red
    "#A78BFA", // violet
    "#FB923C", // orange
    "#2DD4BF", // teal
    "#F472B6", // pink
    "#4ADE80", // lime
  ];

  const index = userId
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);

  return COLORS[index % COLORS.length];
}

export type CursorPosition = {
  id: string;
  x: number;
  y: number;
  t: number; // timestamp
};

export type CursorUpdate = {
  type: "cursor-update";
  id: string;
  positions: Array<{
    x: number;
    y: number;
    t: number;
  }>;
};

export type CursorJoin = {
  type: "cursor-join";
  id: string;
};

export type CursorLeave = {
  type: "cursor-leave";
  id: string;
};

export type CursorMessage = CursorUpdate | CursorJoin | CursorLeave;
