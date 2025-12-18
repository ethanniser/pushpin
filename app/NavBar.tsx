"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavBar() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    return pathname === path
      ? "bg-blue-600 text-white"
      : "text-gray-300 hover:bg-gray-700 hover:text-white";
  };

  return (
    <nav className="bg-gray-800 shadow-lg w-full flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <span className="text-2xl">⚡</span>
          <span className="text-xl font-bold text-white">
            Serverless SSE/WS Demo
          </span>
        </Link>
        <a
          href="https://github.com/ethanniser/serverless-sockets-demo.git"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          view the source code!
        </a>
      </div>
      <div className="flex gap-4">
        <Link
          href="/"
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive(
            "/",
          )}`}
        >
          Home
        </Link>
        <Link
          href="/stream"
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive(
            "/stream",
          )}`}
        >
          Stream (SSE)
        </Link>
        <Link
          href="/chat"
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive(
            "/chat",
          )}`}
        >
          Chat (WS)
        </Link>
        <Link
          href="/cursors"
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive(
            "/cursors",
          )}`}
        >
          Cursors
        </Link>
      </div>
    </nav>
  );
}
