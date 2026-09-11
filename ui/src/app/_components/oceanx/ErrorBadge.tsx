"use client";

import { useEffect, useState } from "react";

// Visible runtime-error badge: turns "blank page" into an actionable message.
export function ErrorBadge() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      setMsg(`Error: ${e.message}`);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      setMsg(`Async: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  if (!msg) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 8,
        left: 8,
        zIndex: 99999,
        background: "#3b0a0a",
        color: "#ffb4b4",
        fontSize: 12,
        padding: "8px 12px",
        borderRadius: 8,
        maxWidth: "80vw",
        wordBreak: "break-word",
      }}
    >
      {msg}
    </div>
  );
}
