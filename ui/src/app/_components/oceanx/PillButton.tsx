"use client";

import { type ReactNode } from "react";

interface PillButtonProps {
  children: ReactNode;
  transparent?: boolean;
  dotColor?: "accent" | "cyan";
  onClick?: () => void;
  className?: string;
}

export function PillButton({
  children,
  transparent = false,
  dotColor = "accent",
  onClick,
  className = "",
}: PillButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`ox-pill ${transparent ? "ox-pill-transparent" : "ox-pill-white"} ${className}`}
    >
      <span className="ox-pill-mask">
        <span className="ox-pill-bw1">{children}</span>
        <span className="ox-pill-bw2">{children}</span>
      </span>
      <span className={`ox-pill-dot ${dotColor === "cyan" ? "shared" : ""}`}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="10"
          height="9"
          fill="none"
          viewBox="0 0 10 9"
        >
          <path
            fill="currentColor"
            fillRule="evenodd"
            d="m1.263 4.453 7.464-7.464-.786-.786-8.25 8.25 8.25 8.25.786-.786z"
            clipRule="evenodd"
          />
          <path
            fill="currentColor"
            fillRule="evenodd"
            d="M16.111 3.888H.556v1.111H16.11z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    </button>
  );
}
