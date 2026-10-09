import React from "react";
import Image from "next/image";
import logoImg from "@/assets/ET-Firewall-Logo-new.webp";

interface LogoProps {
  height?: number;
  width?: number;
  size?: number;
  className?: string;
  priority?: boolean;
}

/**
 * ET Prompt Firewall Official Brand Logo:
 * Sourced safely from @/assets/ET-Firewall-Logo-new.webp
 */
export default function Logo({
  height,
  width,
  size,
  className,
  priority = true,
}: LogoProps) {
  const h = height ?? size ?? 32;
  const w = width ?? Math.round(h * (1731 / 166));

  return (
    <Image
      src={logoImg}
      alt="ET Prompt Firewall"
      height={h}
      width={w}
      priority={priority}
      className={className}
      style={{
        height: `${h}px`,
        width: "auto",
        display: "block",
        objectFit: "contain",
      }}
    />
  );
}

