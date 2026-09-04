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
                <Link href="/dashboard" className="flex items-center gap-2 text-[#84907f] hover:text-[#2d3329]">◆ Dashboard</Link>
                <Link href="/dashboard/map" className="flex items-center gap-2 text-[#84907f] hover:text-[#2d3329]">◇ Thermal</Link>
                <Link href="https://sih-thermal-gateway.dsjzcjmsh6.workers.dev/api/auth/google" className="flex items-center gap-2 text-[#84907f] hover:text-[#2d3329]">↗ Google</Link>
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
              <div>EN / FR</div>
              <div className="mt-2 text-[9px] leading-none">EST.2025 — 16.113.35.234.sslip.io</div>
            </div>
          </aside>

          {/* Center - Terrain + Headline */}
          <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden border-x border-[#2d3329]/10 bg-[#dde2e4]">
            {/* Topographic SVG as faint bg + divider */}
            <img
              src="/media/terrain/topology.svg"
              alt="terrain"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.18] mix-blend-multiply"
            />
            <img
              src="/media/terrain/topology.svg"
              alt="terrain overlay"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.35] mix-blend-multiply"
              style={{ maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)" } as React.CSSProperties}
            />

            {/* Headline split like San Rita */}
            <div className="relative z-10 w-full px-6 py-16 text-center">
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
                <Link href="/dashboard" className="rounded-full bg-[#2d3329] px-6 py-3 text-[#dde2e4] hover:bg-[#161b13]">Enter Dashboard — Map</Link>
                <Link href="#latest" className="rounded-full border border-[#2d3329] px-6 py-3 text-[#2d3329] hover:bg-[#2d3329] hover:text-[#dde2e4]">View Latest Incident</Link>
              </div>
              <div className="mt-6 font-mono text-[10px] uppercase tracking-wide text-[#84907f]">Scroll to enter our world ↓</div>
            </div>

            {/* Hotspot like San Rita R3F */}
            <div className="pointer-events-none absolute left-[62%] top-[38%] z-20 hidden md:block">
              <div className="relative h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2">
                <div
                  className="absolute inset-0 overflow-hidden rounded-full border border-[#2d3329]/20 bg-[#e2ffcc] shadow-xl transition-all duration-500"
                  style={{ maskImage: "radial-gradient(farthest-side, #000 68%, transparent 100%)", WebkitMaskImage: "radial-gradient(farthest-side, #000 68%, transparent 100%)" } as React.CSSProperties}
                >
                  <img src="https://www.datocms-assets.com/116050/1770712969-river.webp" alt="hotspot" className="h-full w-full object-cover" />
                  <div className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-white">Jamnagar 22.47°N 70.06°E • FRP 45 • 0.92 persistence</div>
                </div>
                <div className="absolute -right-2 -top-2 rounded-full bg-[#e91200] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide text-white">HOT</div>
              </div>
            </div>

            {/* Bottom fade */}
            <div className="pointer-events-none absolute bottom-0 h-32 w-full bg-gradient-to-t from-[#dde2e4] to-transparent" />
          </div>

          {/* Right Rail - Latest Incident ala Podium Global */}
          <aside id="latest" className="sticky top-0 hidden h-dvh flex-col border-l border-[#2d3329]/10 bg-[#dde2e4] md:flex">
            <div className="p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#84907f]">Latest hot spot added</div>
              <h3 className="mt-2 font-black uppercase leading-none tracking-tight text-[#2d3329]" style={{ fontFamily: "var(--font-display)" } as React.CSSProperties}>
                Sector B —<br />Persist. Thermal
              </h3>
              <div className="mt-2 font-mono text-[11px] uppercase tracking-wide text-[#84907f]">Refinery flare • Jamnagar • FIRMS VIIRS</div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <img src="https://www.datocms-assets.com/116050/1769197477-podium-cover-1.webp" alt="cover1" className="aspect-[4/3] w-full object-cover" />
                <img src="https://www.datocms-assets.com/116050/1779374757-1775438346-auclair-3-1.png" alt="cover2" className="aspect-[4/3] w-full object-cover" />
              </div>
              <div className="mt-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-wide">
                <span className="text-[#84907f]">Industrial • 0.85 prob</span>
                <Link href="/dashboard" className="underline decoration-[#2d3329] underline-offset-4 hover:bg-[#e2ffcc]">Explore Incident ↗</Link>
              </div>
              <div className="mt-6 border-t border-[#2d3329]/10 pt-4 font-mono text-[10px] uppercase leading-relaxed tracking-wide text-[#84907f]">
                <div>— Terraforming activated</div>
                <div className="text-[#2d3329]">Sensor sweep • GIS base • Evac trails • Drone overwatch • Incident log</div>
              </div>
            </div>
            <div className="mt-auto border-t border-[#2d3329]/10 p-6 font-mono text-[10px] uppercase tracking-wide">
              <div className="flex gap-4 text-[#84907f]">
                <span>↓ 16.113.35.234.sslip.io</span>
                <span className="ml-auto">EN</span>
              </div>
              <div className="mt-4 text-[9px] leading-relaxed text-[#84907f]">© Atelier PS162 Inc. — Inspired by San Rita terrain (direct assets under public/media, renamed, internal)</div>
            </div>
          </aside>
        </div>

        {/* Mobile fallback */}
        <div className="border-t border-[#2d3329]/10 bg-[#2d3329] p-6 text-[#dde2e4] md:hidden">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#84907f]">PS162 • FIRMS + OSM</div>
          <div className="mt-2 font-mono text-xs uppercase leading-relaxed tracking-wide">
            Industrial fires vs forest/agri via persistence. <Link href="/dashboard" className="bg-[#e2ffcc] px-1 text-[#2d3329]">Open Map →</Link>
          </div>
        </div>

        {/* Footer marquee like San Rita */}
        <div className="hidden border-t border-[#2d3329]/10 bg-[#161b13] py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#84907f] md:block">
          <div className="mx-auto flex max-w-[1600px] justify-between px-10">
            <span>Sensor & mapping Purveyors</span>
            <span>hand-calibrated incident Refuge</span>
            <span>Gold idEAs seekers</span>
            <span>Republic of collaborative minds</span>
          </div>
        </div>
      </main>
    </LenisProvider>
  );
}
