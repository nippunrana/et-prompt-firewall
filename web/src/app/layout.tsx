import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// The page's only two font families: Geist for the interface, Geist Mono for email text and code.
const sans = Geist({ subsets: ["latin"], variable: "--font-sans-loaded" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono-loaded", preload: false });

export const metadata: Metadata = {
  title: "ET Prompt Firewall",
  description: "A prompt injection firewall that sits in front of an AI agent.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
