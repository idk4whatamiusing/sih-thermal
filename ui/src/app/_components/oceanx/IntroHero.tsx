"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { PillButton } from "./PillButton";
import {
  PartnerA,
  PartnerB,
  PartnerC,
  PartnerD,
  PartnerE,
  PartnerF,
  PartnerG,
} from "./BrandSvgs";

gsap.registerPlugin(SplitText);

interface IntroHeroProps {
  onEnter: () => void;
  entered: boolean;
}

export function IntroHero({ onEnter, entered }: IntroHeroProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLParagraphElement>(null);
  const t1Ref = useRef<HTMLHeadingElement>(null);
  const t2Ref = useRef<HTMLHeadingElement>(null);
  const descRef = useRef<HTMLParagraphElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const enteredRef = useRef(entered);
  enteredRef.current = entered;

  // Intro animate timeline (their q_EadbwV.js Introduction.animate)
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const labelSplit = new SplitText(labelRef.current!, {
      type: "lines, words",
      linesClass: "--line",
      wordsClass: "--word",
      mask: "lines",
    });
    const t1Split = new SplitText(t1Ref.current!, {
      type: "lines, chars",
      linesClass: "--line",
      charsClass: "--char",
      mask: "lines",
    });
    const t2Split = new SplitText(t2Ref.current!, {
      type: "lines, chars",
      linesClass: "--line",
      charsClass: "--char",
      mask: "lines",
    });
    const descSplit = new SplitText(descRef.current!, {
      type: "lines",
      linesClass: "--line",
      mask: "lines",
    });

    gsap.set(root, { autoAlpha: 1 });
    gsap.set([labelSplit.words, t1Split.chars, t2Split.chars], { yPercent: 100 });
    gsap.set(descSplit.lines, { yPercent: 100 });
    gsap.set(buttonRef.current, { scale: 0, y: 10 });
    gsap.set([descRef.current, linksRef.current], { opacity: 0 });

    const tl = gsap.timeline({ defaults: { ease: "expo.out", duration: 1.3, delay: 0.35 } });
    tl.fromTo(buttonRef.current, { scale: 0, y: 10 }, { scale: 1, y: -1 }, 0);
    tl.to(labelSplit.words, { yPercent: 0, stagger: 0.075, duration: 1.1 }, 0);
    tl.to([t1Split.chars, t2Split.chars], { yPercent: 0, stagger: 0.03, duration: 1.1 }, 0.1);
    tl.to(descRef.current, { opacity: 1, y: 0, duration: 1.4 }, 0.6);
    tl.to(descSplit.lines, { yPercent: 0, stagger: 0.05 }, 0.8);
    tl.to(linksRef.current, { opacity: 1, duration: 1 }, 1);

    return () => {
      tl.kill();
      labelSplit.revert();
      t1Split.revert();
      t2Split.revert();
      descSplit.revert();
    };
  }, []);

  const handleEnter = () => {
    const root = rootRef.current;
    if (!root) return;
    // Hide timeline (their Introduction.hide) then emit enter
    const chars1 = root.querySelectorAll(".t1 .--char");
    const chars2 = root.querySelectorAll(".t2 .--char");
    const tl = gsap.timeline({
      defaults: { ease: "power3.inOut", duration: 1.4 },
      onComplete: () => onEnter(),
    });
    tl.to(root, { opacity: 0, y: -300 }, 0);
    tl.to(chars1, { yPercent: -100, opacity: 0, stagger: { from: "center", each: 0.004 } }, 0);
    tl.to(chars2, { yPercent: 100, opacity: 0, stagger: { from: "center", each: 0.004 } }, 0);
    tl.to([buttonRef.current, linksRef.current], { opacity: 0, duration: 0.8 }, 0.2);
  };

  return (
    <div ref={rootRef} className="ox-intro" style={{ opacity: 0 }}>
      <div className="introduction-content">
        <div className="main-content">
          <div className="label-wrapper">
            <p ref={labelRef} className="ox-intro-label mono-16">
              Thermal Sentinel 2026 in review
            </p>
          </div>
          <div className="ox-intro-title title-big">
            <h2 ref={t1Ref} className="title-el t1">
              A Year of
            </h2>
            <h2 ref={t2Ref} className="title-el t2">
              Detection
            </h2>
          </div>
          <div ref={buttonRef} className="button">
            <PillButton onClick={handleEnter}>Enter Experience</PillButton>
          </div>
        </div>
        <p ref={descRef} className="ox-intro-description text-regular">
          Across 2026, Thermal Sentinel turns NASA FIRMS heat into classified industrial
          intelligence — every fire from space, only the industrial ones flagged.
        </p>
      </div>

      <div ref={linksRef} className="ox-intro-links mono-10">
        <p className="ox-copyright">©2026 Thermal Sentinel</p>
        <a href="/dashboard/default">Open Dashboard</a>
        <a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noopener noreferrer">
          NASA FIRMS
        </a>
      </div>

      <div className="ox-intro-partners">
        <p className="ox-partners-label">Made possible by our partners</p>
        <div className="ox-partners-list">
          <div className="ox-partners-row first-row">
            <PartnerA />
            <PartnerB />
            <PartnerC />
            <PartnerD />
          </div>
          <div className="ox-partners-row second-row">
            <PartnerE />
            <PartnerF />
            <PartnerG />
          </div>
        </div>
      </div>
    </div>
  );
}
