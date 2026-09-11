"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { PillButton } from "./PillButton";
import { safeSplit } from "./split";
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

export function EndingShare() {
  const rootRef = useRef<HTMLDivElement>(null);
  const t1Ref = useRef<HTMLSpanElement>(null);
  const t2Ref = useRef<HTMLSpanElement>(null);
  const descRef = useRef<HTMLParagraphElement>(null);
  const [label, setLabel] = useState("Share website");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const tl = gsap.timeline({ defaults: { ease: "expo.out", duration: 1.3 } });
    const w1 = safeSplit(t1Ref.current, {
      type: "lines, chars",
      linesClass: "--line",
      charsClass: "--char",
      mask: "lines",
    });
    const w2 = safeSplit(t2Ref.current, {
      type: "lines, chars",
      linesClass: "--line",
      charsClass: "--char",
      mask: "lines",
    });
    const d = safeSplit(descRef.current, {
      type: "lines",
      linesClass: "--line",
      mask: "lines",
      autoSplit: true,
    });
    const chars = [...(w1?.chars ?? []), ...(w2?.chars ?? [])];
    if (chars.length) gsap.set(chars, { yPercent: 100 });
    if (d) gsap.set(d.lines, { yPercent: 100 });
    gsap.set(descRef.current, { opacity: 0, y: 25 });
    if (chars.length) tl.to(chars, { yPercent: 0, stagger: 0.03, duration: 1.1 }, 0.1);
    tl.to(descRef.current, { opacity: 1, y: 0, duration: 1.4 }, 0.8);
    if (d) tl.to(d.lines, { yPercent: 0, stagger: 0.05 }, 0.6);
    return () => {
      tl.kill();
      w1?.revert();
      w2?.revert();
      d?.revert();
    };
  }, []);

  // Their ShareButton logic: dataLayer → navigator.share → clipboard
  const share = async () => {
    (window as unknown as { dataLayer?: unknown[] }).dataLayer?.push({ event: "share_clicked" });
    const url = window.location.href;
    const isMobile = matchMedia("(hover: none)").matches;
    if (isMobile && navigator.share) {
      try {
        await navigator.share({ title: document.title, url });
      } catch (err) {
        console.error("Error sharing:", err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setLabel("URL Copied!");
        setCopied(true);
        setTimeout(() => {
          setLabel("Share website");
          setCopied(false);
        }, 2000);
      } catch (err) {
        console.error("Failed to copy URL:", err);
      }
    }
  };

  return (
    <div ref={rootRef} className="ox-ending visible">
      <div className="ox-ending-inner">
        <div className="ox-ending-title">
          <div className="label-wrapper">
            <div className="ox-intro-label">Thermal Sentinel 2026 in review</div>
          </div>
          <span ref={t1Ref} className="ox-ending-title-line">
            Share the
          </span>
          <span ref={t2Ref} className="ox-ending-title-line t2">
            Mission
          </span>
        </div>

        <p ref={descRef} className="ox-ending-desc text-small">
          Thank you for exploring with us. Share the mission, spread the awareness, and join us
          as we work to make thermal intelligence accessible to everyone throughout 2026.
        </p>

        <div className={`ox-share-button ${copied ? "success" : ""}`} onClick={share}>
          <PillButton dotColor="cyan">{label}</PillButton>
        </div>

        <div className="ox-partners">
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

        <div className="ox-copyright" style={{ marginTop: "2rem" }}>
          ©2026 Thermal Sentinel
        </div>
      </div>
    </div>
  );
}
