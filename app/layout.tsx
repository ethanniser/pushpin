import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "./NavBar";
import { MainWrapper } from "./MainWrapper";

export const metadata: Metadata = {
  title: "Serverless SSE/WebSockets Demo",
  description: "Real-time messaging with SSE and WebSockets",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-gray-50">
        <NavBar />
        <MainWrapper>{children}</MainWrapper>
      </body>
    </html>
  );
}
