"use client";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function LenisProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const lenis = new Lenis({ autoRaf: true, lerp: 0.075, smoothWheel: true, syncTouch: false });
    lenis.on("scroll", () => {
      ScrollTrigger.update();
    });
    return () => lenis.destroy();
  }, []);
  return <>{children}</>;
}
