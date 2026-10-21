import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

// One terminal face for headlines, reading and tool traces alike: JetBrains
// Mono, the font of the owner's portfolio site, so the agent looks like part
// of it. Variable, so every weight the UI uses comes from one file; italic for
// the Q./A. markers and emphasis.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Portfolio Agent",
  description: "An LLM agent that answers questions about a GitHub portfolio through an MCP server.",
};

// Browser chrome (mobile address bar, PWA title bar) in the page's own paper colour.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3efe6" },
    { media: "(prefers-color-scheme: dark)", color: "#13120f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
