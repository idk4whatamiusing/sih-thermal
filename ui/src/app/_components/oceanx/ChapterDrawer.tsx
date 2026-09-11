"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import type { Chapter } from "@/data/chapters";

interface ChapterDrawerProps {
  chapter: Chapter | null;
  open: boolean;
  onClose: () => void;
}

const TIMOR_BGS = ["#f2ead6", "#327172", "#2d3e58", "#f47e72", "#f2cab1", "#bd1603", "#3aa4ac"];
const TIMOR_IMGS = [1, 2, 3, 4, 5, 6, 7].map(
  (i) => `/static/images/timor-leste-0${i}.jpg`,
);

export function ChapterDrawer({ chapter, open, onClose }: ChapterDrawerProps) {
  const [mapOpen, setMapOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const isTimor = chapter?.index === 5;

  // Reset per chapter
  useEffect(() => {
    setSlide(0);
    rightRef.current?.scrollTo({ top: 0 });
  }, [chapter?.index]);

  // Open/close motion (their SharedCustomDrawer re/_e, simplified to our DOM)
  useEffect(() => {
    if (!overlayRef.current || !frameRef.current) return;
    if (open) {
      setMapOpen(false);
      const t = setTimeout(() => setMapOpen(true), 300);
      gsap.fromTo(
        overlayRef.current,
        { backgroundColor: "rgba(0,0,0,0)" },
        { backgroundColor: "rgba(0,0,0,0.3)", duration: 0.5, ease: "power2.out", overwrite: true },
      );
      gsap.fromTo(
        frameRef.current,
        { yPercent: 100, xPercent: 0 },
        { yPercent: 0, xPercent: 0, duration: 0.8, ease: "expo.out", overwrite: true },
      );
      return () => clearTimeout(t);
    } else {
      gsap.to(overlayRef.current, {
        backgroundColor: "rgba(0,0,0,0)",
        duration: 0.5,
        ease: "power2.out",
        overwrite: true,
      });
    }
  }, [open]);

  // ESC + body scroll lock
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!chapter) return null;

  const go = (dir: 1 | -1) => setSlide((s) => Math.min(Math.max(s + dir, 0), TIMOR_IMGS.length - 1));

  return (
    <div
      ref={overlayRef}
      className={`ox-drawer-overlay ${open ? "open" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={frameRef}
        className="ox-drawer-frame"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ox-drawer-inner">
          <button className="ox-drawer-close" onClick={onClose} aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 10 10">
              <path stroke="currentColor" strokeWidth="1.5" d="M0 10 10 0M0 0l10 10" />
            </svg>
          </button>

          <div className={`ox-drawer-left ${mapOpen ? "open" : ""}`}>
            <div className={`ox-article-map ${mapOpen ? "open" : ""}`}>
              <div
                className="ox-article-map-marker"
                style={{ "--x": chapter.mapX, "--y": chapter.mapY } as React.CSSProperties}
              >
                <div className="ox-article-map-marker-inner" />
                <div className="ox-article-map-marker-outer" />
              </div>
              <div
                className="ox-article-map-coord"
                style={chapter.mapCoordSide === "left" ? { left: "auto", right: "5.3rem" } : undefined}
              >
                <span>{chapter.mapCoord}</span>
              </div>
              <div style={{ width: "100%", height: "100%", position: "relative", zIndex: 1 }}>
                <img
                  src={chapter.mapImage}
                  alt={chapter.kicker}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            </div>
          </div>

          <div ref={rightRef} className="ox-drawer-right">
            <div className="ox-article">
              <ul className="ox-article-badges">
                {chapter.badges.map((b, i) => (
                  <li key={i}>
                    <div className={`ox-badge ${b.variant === "dark" ? "ox-badge-dark" : "ox-badge-light"}`}>
                      {b.label}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="ox-article-content">
                <h2>{chapter.title}</h2>
                <h3>{chapter.subtitle}</h3>
                {chapter.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>

              {isTimor && (
                <div className="ox-timor-slider">
                  <div className="ox-slider-container">
                    <ul className="ox-slider-track">
                      {TIMOR_IMGS.map((src, i) => (
                        <li
                          key={src}
                          className={`ox-slider-item ${i === slide ? "active" : ""} ${i === TIMOR_IMGS.length - 1 ? "last" : ""}`}
                          style={{ backgroundColor: TIMOR_BGS[i] }}
                        >
                          <div className="ox-slider-item-frame">
                            <img src={src} alt={`Image 0${i + 1}`} />
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="ox-slider-arrows">
                      <button
                        className={`ox-slider-btn ${slide === 0 ? "disable" : ""}`}
                        onClick={() => go(-1)}
                        aria-label="Previous"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="9" fill="none" viewBox="0 0 10 9">
                          <path fill="currentColor" fillRule="evenodd" d="m1.263 4.453 7.464-7.464-.786-.786-8.25 8.25 8.25 8.25.786-.786z" clipRule="evenodd" />
                          <path fill="currentColor" fillRule="evenodd" d="M16.111 3.888H.556v1.111H16.11z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        className={`ox-slider-btn ${slide === TIMOR_IMGS.length - 1 ? "disable" : ""}`}
                        onClick={() => go(1)}
                        aria-label="Next"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="9" fill="none" viewBox="0 0 10 9" className="inverse">
                          <path fill="currentColor" fillRule="evenodd" d="m1.263 4.453 7.464-7.464-.786-.786-8.25 8.25 8.25 8.25.786-.786z" clipRule="evenodd" />
                          <path fill="currentColor" fillRule="evenodd" d="M16.111 3.888H.556v1.111H16.11z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <ul className="ox-slider-indicator">
                    {TIMOR_IMGS.map((_, i) => (
                      <li key={i} className={i === slide ? "active" : ""}>
                        <span className={`ox-slider-text ${i === slide ? "active" : ""}`}>Image 0{i + 1}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="ox-slider-progress">
                    <div
                      className="ox-slider-progress-fill"
                      style={{ transform: `scaleX(${(slide + 1) / TIMOR_IMGS.length})` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="ox-article-footer">
              <div className="ox-article-footer-title">
                <span className="ox-article-footer-sub">Thermal Sentinel 2026 in review</span>
                <h2>Keep Exploring</h2>
              </div>
              <button className="ox-pill ox-pill-transparent" onClick={onClose}>
                <span className="ox-pill-mask">
                  <span className="ox-pill-bw1">Back to Timeline</span>
                  <span className="ox-pill-bw2">Back to Timeline</span>
                </span>
                <span className="ox-pill-dot shared">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="9" fill="none" viewBox="0 0 10 9">
                    <path fill="currentColor" fillRule="evenodd" d="m1.263 4.453 7.464-7.464-.786-.786-8.25 8.25 8.25 8.25.786-.786z" clipRule="evenodd" />
                    <path fill="currentColor" fillRule="evenodd" d="M16.111 3.888H.556v1.111H16.11z" clipRule="evenodd" />
                  </svg>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
