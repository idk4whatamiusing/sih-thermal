"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import type { Chapter } from "@/data/chapters";
import { PillButton } from "./PillButton";

gsap.registerPlugin(SplitText);

interface ChapterHeadingProps {
  chapter: Chapter;
  visible: boolean;
  onLearnMore: () => void;
}

export function ChapterHeading({ chapter, visible, onLearnMore }: ChapterHeadingProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const kickerRef = useRef<HTMLHeadingElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);
  const linkRef = useRef<HTMLDivElement>(null);
  const splitsRef = useRef<SplitText[]>([]);

  // Split once (their D7U0N6dC ChapterHeadings)
  useEffect(() => {
    const splits = [
      new SplitText(kickerRef.current!, { type: "lines", linesClass: "--line", autoSplit: true }),
      new SplitText(titleRef.current!, { type: "lines", linesClass: "--line", autoSplit: true }),
      new SplitText(subRef.current!, { type: "lines", linesClass: "--line", autoSplit: true }),
    ];
    splitsRef.current = splits;
    gsap.set(rootRef.current, { autoAlpha: 0 });
    return () => {
      splits.forEach((s) => s.revert());
    };
  }, []);

  // Enter/leave on active change
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (visible) {
      const lines = root.querySelectorAll(".--line");
      gsap.set(lines, { yPercent: 100 });
      gsap.to(root, { autoAlpha: 1, ease: "power2.out", duration: 0.6, overwrite: true });
      gsap.to(lines, { yPercent: 0, ease: "expo.out", duration: 1, stagger: 0.06, overwrite: true });
      gsap.fromTo(
        linkRef.current,
        { x: "20rem", opacity: 0 },
        { x: 0, opacity: 1, duration: 0.8, ease: "power3.out", delay: 0.3, overwrite: true },
      );
    } else {
      gsap.to(root, { autoAlpha: 0, ease: "power2.out", duration: 0.6, overwrite: true });
    }
  }, [visible]);

  return (
    <div ref={rootRef} className="ox-chapter-heading" style={{ pointerEvents: visible ? "auto" : "none" }}>
      <div className="ox-chapter-index">chapter {String(chapter.index).padStart(2, "0")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "100%" }}>
        <h3 ref={kickerRef} className="ox-chapter-kicker">
          {chapter.kicker}
        </h3>
        <h2 ref={titleRef} className="ox-chapter-title">
          {chapter.title}
        </h2>
        <p ref={subRef} className="ox-chapter-sub">
          {chapter.subtitle}
        </p>
      </div>
      <div ref={linkRef} className="ox-chapter-link">
        <PillButton transparent onClick={onLearnMore}>
          Learn More
        </PillButton>
      </div>
    </div>
  );
}
