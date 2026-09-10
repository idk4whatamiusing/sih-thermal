import localFont from "next/font/local";
import Link from "next/link";
import LenisProvider from "@/components/lenis-provider";

const display = localFont({
  src: "../../public/media/fonts/display-black.woff2",
  variable: "--font-display",
  display: "swap",
});
const mono400 = localFont({
  src: "../../public/media/fonts/mono-book.woff2",
  variable: "--font-mono-book",
  display: "swap",
});
const mono700 = localFont({
  src: "../../public/media/fonts/mono-bold.woff2",
  variable: "--font-mono-bold",
  display: "swap",
});

export default function Home() {
  return (
    <LenisProvider>
      <main
        className={`${display.variable} ${mono400.variable} ${mono700.variable} min-h-screen bg-[#dde2e4] text-[#2d3329] antialiased selection:bg-[#e2ffcc] selection:text-[#2d3329]`}
        style={{ fontFamily: "var(--font-mono-book), ui-monospace, monospace" } as React.CSSProperties}
      >
        {/* Preloader mimic - static for now, GSAP would animate */}
        <div className="pointer-events-none fixed inset-0 z-[99] flex items-center justify-center bg-[#dde2e4] opacity-0">
          <span className="font-mono text-xs tabular-nums">Terraforming 0%</span>
        </div>

        {/* Grid shell like San Rita: 40px gutters, 350px asides */}
        <div className="mx-auto grid min-h-screen w-full max-w-[1600px] grid-cols-[40px_350px_1fr_350px_40px] max-[799px]:grid-cols-[0_1fr_0]">
          {/* Left Rail */}
          <aside className="sticky top-0 hidden h-dvh flex-col justify-between border-r border-[#2d3329]/10 py-10 pr-4 md:flex">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#84907f]">The trails of PS162</div>
              <nav className="mt-8 space-y-3 font-mono text-[11px] uppercase tracking-wide">
                <Link href="/" className="flex items-center gap-2 text-[#2d3329]">● Map</Link>
                <Link href="/dashboard/default" className="flex items-center gap-2 text-[#84907f] hover:text-[#2d3329]">◆ Dashboard</Link>
                <a href={`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/auth/google`} className="flex items-center gap-2 text-[#84907f] hover:text-[#2d3329]">↗ Google</a>
              </nav>
              <div className="mt-12 flex gap-4 font-mono text-[10px] uppercase tracking-wide text-[#84907f]">
                <span className="flex items-center gap-1.5"><span className="h-[2px] w-8 bg-[#2d3329]" /> perimeter</span>
                <span className="flex items-center gap-1.5"><span className="h-[2px] w-8 border-t border-dashed border-[#84907f]" /> evac</span>
              </div>
              <div className="mt-4 flex gap-4 font-mono text-[10px] uppercase tracking-wide text-[#84907f]">
                <span className="flex items-center gap-1">◎ hydrant</span>
                <span className="flex items-center gap-1">⬡ drone</span>
              </div>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wide text-[#84907f]">
              <div>Team Meridian</div>
              <div className="mt-2 text-[9px] leading-none">SIH2026 — SIH26162</div>
            </div>
          </aside>

          {/* Center - Terrain + Headline */}
          <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden border-x border-[#2d3329]/10 bg-[#dde2e4]">
            {/* Topographic SVG as faint bg + divider - increased contrast */}
            <img
              src="/media/terrain/topology.svg"
              alt="terrain"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.26] mix-blend-multiply"
            />
            <img
              src="/media/terrain/topology.svg"
              alt="terrain overlay"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.48] mix-blend-multiply"
              style={{ maskImage: "radial-gradient(ellipse at center, black 45%, transparent 75%)" } as React.CSSProperties}
            />

            {/* Headline split like San Rita - z-30 above hotspot */}
            <div className="relative z-30 w-full px-6 py-16 text-center">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#84907f]">NTRO • SIH26162 • FIRMS VIIRS 375m • OSM</div>
              <h1
                className="mt-4 font-black uppercase leading-[0.85] tracking-[-0.04em] text-[#2d3329]"
                style={{ fontFamily: "var(--font-display), Impact, sans-serif", fontSize: "clamp(2.5rem, 8vw, 5.5rem)" } as React.CSSProperties}
              >
                <span className="block">An industrial site</span>
                <span className="block">where data and</span>
                <span className="block text-[#84907f]">stories move off-grid</span>
              </h1>
              <p className="mx-auto mt-6 max-w-xl font-mono text-[11px] uppercase tracking-wide leading-relaxed text-[#2d3329]/70">
                AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources Using NASA FIRMS, OSM & Satellite Data — <span className="bg-[#e2ffcc] px-1">PS162</span>
              </p>
              <div className="mt-8 flex justify-center gap-3 font-mono text-[11px] uppercase tracking-wide">
                <Link href="/dashboard/default" className="rounded-full bg-[#2d3329] px-6 py-3 text-[#dde2e4] hover:bg-[#161b13]">Enter Dashboard — Map</Link>
                <Link href="#latest" className="rounded-full border border-[#2d3329] px-6 py-3 text-[#2d3329] hover:bg-[#2d3329] hover:text-[#dde2e4]">View Latest Incident</Link>
              </div>
              <div className="mt-6 font-mono text-[10px] uppercase tracking-wide text-[#84907f]">Scroll to enter our world ↓</div>
            </div>

            {/* Hotspot like San Rita R3F - repositioned lower to avoid headline overlap, z-0 behind text */}
            <div className="pointer-events-none absolute left-[50%] top-[72%] z-0 hidden md:block">
              <div className="relative h-[220px] w-[220px] md:h-[260px] md:w-[260px] lg:h-[300px] lg:w-[300px] -translate-x-1/2 -translate-y-1/2">
                <div
                  className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-full border border-[#2d3329]/20 bg-[#e2ffcc] shadow-xl transition-all duration-500"
                  style={{ maskImage: "radial-gradient(farthest-side, #000 68%, transparent 100%)", WebkitMaskImage: "radial-gradient(farthest-side, #000 68%, transparent 100%)" } as React.CSSProperties}
                >
                  <img
                    src="/media/terrain/topology.svg"
                    alt="thermal detection example"
                    className="h-full w-full object-cover opacity-70 mix-blend-multiply"
                  />
                  <div className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-white">
                    example: FRP 45 · persistence 0.92
                  </div>
                </div>
                <div className="absolute -right-2 -top-2 rounded-full bg-[#e91200] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide text-white">HOT</div>
              </div>
            </div>

            {/* Bottom fade */}
            <div className="pointer-events-none absolute bottom-0 h-32 w-full bg-gradient-to-t from-[#dde2e4] to-transparent" />
          </div>

          {/* Right Rail - How it works */}
          <aside id="latest" className="sticky top-0 hidden h-dvh flex-col border-l border-[#2d3329]/10 bg-[#dde2e4] md:flex">
            <div className="p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#84907f]">How it works</div>
              <h3 className="mt-2 font-black uppercase leading-none tracking-tight text-[#2d3329]" style={{ fontFamily: "var(--font-display)" } as React.CSSProperties}>
                Ingest —<br />Enrich — Classify
              </h3>
              <ol className="mt-4 space-y-3 font-mono text-[11px] uppercase tracking-wide text-[#2d3329]/80">
                <li><span className="text-[#84907f]">01</span> Pull FIRMS VIIRS thermal detections</li>
                <li><span className="text-[#84907f]">02</span> Enrich with OSM industrial-site distance + ESA WorldCover landcover</li>
                <li><span className="text-[#84907f]">03</span> Cluster recurring detections, classify industrial vs. natural</li>
                <li><span className="text-[#84907f]">04</span> Ambiguous cases get an AI second opinion, RAG-augmented with similar past cases</li>
              </ol>
              <div className="mt-6 flex items-center justify-between font-mono text-[11px] uppercase tracking-wide">
                <span className="text-[#84907f]">See it on real data</span>
                <Link href="/dashboard/incidents" className="underline decoration-[#2d3329] underline-offset-4 hover:bg-[#e2ffcc]">View Incidents ↗</Link>
              </div>
            </div>
            <div className="mt-auto border-t border-[#2d3329]/10 p-6 font-mono text-[10px] uppercase tracking-wide">
              <div className="flex gap-4 text-[#84907f]">
                <span>Team Meridian</span>
                <span className="ml-auto">EN</span>
              </div>
              <div className="mt-4 text-[9px] leading-relaxed text-[#84907f]">© Team Meridian, Smart India Hackathon 2026 — PS162</div>
            </div>
          </aside>
        </div>

        {/* Mobile fallback */}
        <div className="border-t border-[#2d3329]/10 bg-[#2d3329] p-6 text-[#dde2e4] md:hidden">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#84907f]">PS162 • FIRMS + OSM</div>
          <div className="mt-2 font-mono text-xs uppercase leading-relaxed tracking-wide">
            Industrial fires vs forest/agri via persistence. <Link href="/dashboard/default" className="bg-[#e2ffcc] px-1 text-[#2d3329]">Open Map →</Link>
          </div>
        </div>

        <div className="hidden border-t border-[#2d3329]/10 bg-[#161b13] py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#84907f] md:block">
          <div className="mx-auto flex max-w-[1600px] justify-between px-10">
            <span>NASA FIRMS VIIRS 375m</span>
            <span>OpenStreetMap industrial sites</span>
            <span>ESA WorldCover 10m landcover</span>
            <span>Smart India Hackathon 2026 · PS162</span>
          </div>
        </div>
      </main>
    </LenisProvider>
  );
}
