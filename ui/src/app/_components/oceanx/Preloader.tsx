"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { PreloaderCircleOuter, PreloaderCircleInner } from "./BrandSvgs";

gsap.registerPlugin(SplitText);

interface PreloaderProps {
  onComplete: () => void;
}

export function Preloader({ onComplete }: PreloaderProps) {
  const [pct, setPct] = useState(0);
  const [hidden, setHidden] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    // Infinite orbit + pulse (their Preloader intro)
    gsap.set(dotRef.current, { autoAlpha: 1 });
    gsap.fromTo(dotRef.current, { scale: 0 }, { scale: 1, duration: 0.5, ease: "power2.inOut" });
    gsap.to(rootRef.current, { opacity: 1, duration: 1, delay: 0.4, ease: "power2.inOut" });
    const spin1 = gsap.to(outerRef.current, { rotation: 360, duration: 12, repeat: -1, ease: "none" });
    const spin2 = gsap.to(innerRef.current, { rotation: -360, duration: 9, repeat: -1, ease: "none" });

    const split = new SplitText(textRef.current!, { type: "chars", charsClass: "--char" });
    const pulse = gsap.timeline({ repeat: -1, repeatDelay: 0.2, defaults: { stagger: 0.05, duration: 0.3, ease: "power1.inOut" } });
    pulse.fromTo(split.chars, { opacity: 0.25 }, { opacity: 1 });
    pulse.to(split.chars, { opacity: 0.25 });

    // Real progress: fonts + window load, eased
    let target = 15;
    const onFonts = () => {
      target = Math.max(target, 60);
    };
    if (document.fonts) document.fonts.ready.then(onFonts).catch(() => {});
    const onLoad = () => {
      target = 100;
    };
    if (document.readyState === "complete") target = 100;
    else window.addEventListener("load", onLoad);

    const proxy = { v: 0 };
    const tween = gsap.to(proxy, {
      v: 100,
      duration: 2.6,
      ease: "power2.out",
      onUpdate() {
        setPct(Math.min(Math.round(proxy.v), 100));
      },
      onComplete() {
        if (doneRef.current) return;
        doneRef.current = true;
        // Outro timeline (their Preloader H)
        const out = gsap.timeline({
          defaults: { ease: "expo.out", duration: 0.8 },
          onComplete() {
            setHidden(true);
            setTimeout(onComplete, 100);
          },
        });
        out.to(split.chars, { autoAlpha: 0, stagger: 0.0075, duration: 0.6 }, 0);
        out.to(outerRef.current, { scale: 0.6, opacity: 0 }, 0);
        out.to(innerRef.current, { scale: 0.7, opacity: 0, duration: 0.7 }, 0.1);
        out.to(textRef.current, { scale: 0.6 }, 0);
        out.to(rootRef.current, { autoAlpha: 0, ease: "power2.inOut", duration: 0.8 }, 0);
      },
    });

    return () => {
      tween.kill();
      spin1.kill();
      spin2.kill();
      pulse.kill();
      split.revert();
      window.removeEventListener("load", onLoad);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={rootRef} className={`ox-preloader ${hidden ? "hidden" : ""}`} style={{ opacity: 0 }}>
      <div className="ox-preloader-circle">
        <div ref={outerRef} className="ox-preloader-outer">
          <PreloaderCircleOuter />
        </div>
        <div ref={innerRef} className="ox-preloader-inner">
          <PreloaderCircleInner />
        </div>
        <div ref={dotRef} className="ox-preloader-dot" style={{ opacity: 0 }} />
      </div>
      <p ref={textRef} className="ox-preloader-text">
        Loading assets
      </p>
      <div className="ox-preloader-pct">{pct}%</div>
    </div>
  );
}
