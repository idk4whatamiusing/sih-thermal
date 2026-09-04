"use client";

// PS162 Sidebar — stripped chat/rag, GIS nav only
import { useState } from "react";

export default function Sidebar({
  activeId,
  onNavigate,
}: {
  activeId?: string;
  onNavigate?: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="flex w-12 flex-col items-center gap-3 border-r border-zinc-800 bg-zinc-950 p-2">
        <button onClick={() => setCollapsed(false)} aria-label="expand" className="text-zinc-400 hover:text-zinc-100">»</button>
        <div className="text-[10px] leading-none text-zinc-500">PS162</div>
      </div>
    );
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between p-3">
        <span className="text-sm font-semibold text-zinc-200">NTRO • PS162</span>
        <button onClick={() => setCollapsed(true)} aria-label="collapse" className="text-zinc-500 hover:text-zinc-200">«</button>
      </div>

      <div className="px-3 pb-2 space-y-1">
        <div className="rounded-lg bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
          <div className="font-medium">Thermal Intelligence</div>
          <div className="text-[11px] text-zinc-500">FIRMS + OSM • Industrial vs Forest</div>
        </div>
        <a href="/dashboard" className={`block rounded-lg px-3 py-2 text-sm ${activeId === "dashboard" ? "bg-zinc-800 text-white" : "text-zinc-300 hover:bg-zinc-900"}`}>
          ● Map — live overlay
        </a>
        <div className="px-3 py-1 text-[11px] uppercase tracking-wide text-zinc-500">Filters</div>
        <div className="px-3 py-1 text-xs text-zinc-600">Date • BBox • Class • Persistence slider (wired to firmsPoints query next iter)</div>
      </div>

      <div className="border-t border-zinc-800 p-3 text-xs text-zinc-400 space-y-1">
        <div className="text-[11px] text-zinc-500">SIH26162</div>
        <a href="/" className="block py-1 hover:text-zinc-100">Home</a>
        <a href="/pricing" className="block py-1 hover:text-zinc-100">Pricing</a>
      </div>
    </aside>
  );
}
