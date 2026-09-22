import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./ui-polish.css";

export const metadata: Metadata = {
  title: "ProОбъект",
  description: "ProОбъект — система автоматизированного сбора информации",
  manifest: "/manifest.webmanifest",
  icons: {
    shortcut: "/favicon.ico",
    apple: "/favicon-black.png"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" }
  ]
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link
          rel="icon"
          type="image/png"
          href="/favicon-black.png?v=06152"
          media="(prefers-color-scheme: light)"
        />
        <link
          rel="icon"
          type="image/png"
          href="/favicon-white.png?v=06152"
          media="(prefers-color-scheme: dark)"
        />
        <link rel="shortcut icon" href="/favicon.ico?v=06152" />
      </head>
      <body>{children}</body>
    </html>
  );
}
