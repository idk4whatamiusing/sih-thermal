"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { CHAPTERS } from "@/data/chapters";
import { Preloader } from "./Preloader";
import { IntroHero } from "./IntroHero";
import { OceanCanvas } from "./OceanCanvas";
import { ChapterHeading } from "./ChapterHeading";
import { ChapterDrawer } from "./ChapterDrawer";
import { EndingShare } from "./EndingShare";
import { ErrorBadge } from "./ErrorBadge";
import { Logo } from "./BrandSvgs";

// Damp helper mirroring their We.Damp (exponential smoothing)
function damp(current: number, target: number, lambda: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function ExperienceScroller() {
  const [loaded, setLoaded] = useState(false);
  const [entered, setEntered] = useState(false);
  const [activeChapter, setActiveChapter] = useState(0);
  const [showEnding, setShowEnding] = useState(false);
  const [drawerChapter, setDrawerChapter] = useState<number | null>(null);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const headerProgressRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
    target: 0,
    value: 0,
    smoother: 0,
    headerDamped: 0,
    entered: false,
    active: 0,
    ending: false,
  });

  const handlePreloaderComplete = useCallback(() => {
    setLoaded(true);
  }, []);

  const handleEnter = useCallback(() => {
    stateRef.current.entered = true;
    setEntered(true);
  }, []);

  // Scroll read + smoothing loop (their provider pattern)
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let raf = 0;
    let last = performance.now();

    const onScroll = () => {
      const max = Math.max(scroller.scrollHeight - window.innerHeight, 1);
      stateRef.current.target = scroller.scrollTop / max;
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const s = stateRef.current;
      s.value = damp(s.value, s.target, 6, dt);
      s.smoother = damp(s.smoother, s.value, 4, dt);
      s.headerDamped = damp(s.headerDamped, s.value, 8, dt);

      const progress = s.entered ? s.value : 0;

      // Header fill writes directly to DOM (no re-render)
      if (headerProgressRef.current) {
        headerProgressRef.current.style.setProperty(
          "--progress",
          progress.toFixed(4),
        );
      }

      // Chapter + ending derivation
      let next = s.active;
      let ending = s.ending;
      if (progress >= 0.98) {
        ending = true;
      } else {
        ending = progress >= 0.97 ? ending : false;
        if (!ending) {
          const t = Math.min(Math.max((progress - 0.08) / 0.8, 0), 0.999);
          next = Math.min(Math.floor(t * CHAPTERS.length), CHAPTERS.length - 1);
        }
      }
      if (next !== s.active) {
        s.active = next;
        setActiveChapter(next);
      }
      if (ending !== s.ending) {
        s.ending = ending;
        setShowEnding(ending);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, []);

  const jumpToChapter = useCallback((idx: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const max = Math.max(scroller.scrollHeight - window.innerHeight, 1);
    const dest = (0.08 + (idx / CHAPTERS.length) * 0.8) * max;
    const proxy = { value: scroller.scrollTop };
    gsap.to(proxy, {
      value: dest,
      duration: 4,
      ease: "power3.out",
      overwrite: true,
      onUpdate() {
        scroller.scrollTo({ top: proxy.value, behavior: "instant" as ScrollBehavior });
      },
    });
  }, []);

  const handleLearnMore = useCallback(() => {
    setDrawerChapter(stateRef.current.active);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerChapter(null);
  }, []);

  return (
    <div className="oceanx-root" style={{ height: "100svh", overflow: "hidden" }}>
      {/* Preloader */}
      {!loaded && <Preloader onComplete={handlePreloaderComplete} />}

      {/* WebGL background (both scenes, crossfade driven by scroll) */}
      <OceanCanvas stateRef={stateRef} entered={entered} />

      {/* Header — fill driven via ref, line reveals on enter */}
      <header className="ox-header">
        <div className="ox-header-logo">
          <Logo />
        </div>
        <div ref={headerProgressRef} className={`ox-header-line ${entered ? "visible" : ""}`}>
          <div className="ox-header-fill" />
        </div>
      </header>
      <div className="ox-logo-overlay">
        <div className={`ox-logo-container ${entered ? "visible" : ""}`}>
          <Logo />
        </div>
      </div>

      {/* Mobile swiper dots */}
      {entered && !showEnding && (
        <div className="ox-swiper-dots">
          {CHAPTERS.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to chapter ${i + 1}`}
              className={`ox-swiper-dot ${i === activeChapter ? "active" : ""}`}
              onClick={() => jumpToChapter(i)}
            />
          ))}
        </div>
      )}

      {/* Main scrollable area */}
      <div ref={scrollerRef} className="ox-scroller no-scrollbar">
        {loaded && <IntroHero onEnter={handleEnter} entered={entered} />}

        <div className="ox-scroll-container">
            <div className="ox-scroll-spacer" />
            <div className="ox-scroll-sticky">
              {CHAPTERS.map((ch, i) => (
                <ChapterHeading
                  key={ch.index}
                  chapter={ch}
                  visible={activeChapter === i && !showEnding}
                  onLearnMore={handleLearnMore}
                />
              ))}
              {showEnding && <EndingShare />}
            </div>
        </div>
      </div>

      {/* Chapter drawer */}
      <ChapterDrawer
        chapter={drawerChapter !== null ? CHAPTERS[drawerChapter] : null}
        open={drawerChapter !== null}
        onClose={handleCloseDrawer}
      />

      {/* Surfaces any runtime failure as a visible badge */}
      <ErrorBadge />
    </div>
  );
}
