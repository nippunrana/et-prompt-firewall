"use client";

import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

// Every GSAP duration goes through this, so visitors who ask for reduced motion get instant state changes.
export const duration = (seconds: number) =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : seconds;

export { gsap, useGSAP };
