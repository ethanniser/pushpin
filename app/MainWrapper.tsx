"use client";

import { usePathname } from "next/navigation";

export function MainWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Cursors page is fullscreen, no wrapper needed
  if (pathname === "/cursors") {
    return <>{children}</>;
  }

  return <main className="container mx-auto px-6 py-8">{children}</main>;
}
