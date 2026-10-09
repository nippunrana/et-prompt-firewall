import React from "react";

interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * ET Prompt Firewall Official Mark:
 * A precision defensive shield silhouette incorporating the incoming prompt token (">")
 * and the active cobalt filtration firewall barrier ("|") with a sentinel node.
 */
export default function Logo({ size = 22, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      {/* Outer shield structure */}
      <path
        d="M12 2.2L3.6 5.6V11.6C3.6 16.9 7.2 21 12 22.2C16.8 21 20.4 16.9 20.4 11.6V5.6L12 2.2Z"
        fill="var(--ink-900, #0d0f14)"
      />
      
      {/* Right faceted light plane for depth */}
      <path
        d="M12 2.5L20.1 5.8V11.6C20.1 16.7 16.6 20.7 12 21.9V2.5Z"
        fill="#ffffff"
        opacity="0.08"
      />

      {/* Incoming Prompt Chevron (">") */}
      <path
        d="M8.2 9.2L11 12L8.2 14.8"
        stroke="#ffffff"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Active Firewall Filtration Beam ("|") */}
      <path
        d="M13.8 8V16"
        stroke="var(--accent, #2847f5)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      {/* Sentinel Security Node */}
      <circle cx="13.8" cy="5.8" r="1.15" fill="var(--accent, #2847f5)" />
    </svg>
  );
}
