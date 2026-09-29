import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "ET Prompt Firewall",
  description: "A prompt injection firewall that sits in front of an AI agent.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: "2.5rem auto", maxWidth: "56rem", padding: "0 1.5rem" }}>
        {children}
      </body>
    </html>
  );
}
