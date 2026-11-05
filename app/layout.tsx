import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Fleet Planner", description: "Recording fleet planning, scheduling and operator pay" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
