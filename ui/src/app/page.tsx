import { Button } from "@/components/ui/button";

import { GlobePanel } from "./_components/globe-panel";
import { Reveal } from "./_components/reveal";

const STEPS = [
  {
    title: "Thermal ingest, worldwide",
    body: "VIIRS (SNPP, NOAA-20, NOAA-21) plus MODIS hotspots stream in from NASA FIRMS — every 10-day window, every sensor, deduplicated.",
  },
  {
    title: "Industrial context",
    body: "Each detection is joined against OpenStreetMap industrial sites (refineries, power plants, steel, mining, LNG) and ESA WorldCover land use.",
  },
  {
    title: "AI classification",
    body: "A transformer trained on persistent thermal clusters separates industrial flares and thermal plants from forest fires, crop burning, and mining heat.",
  },
  {
    title: "GIS overlay",
    body: "Classified points and persistent clusters render as a live overlay on the map — filterable by class, date, and persistence.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-6 py-10 lg:grid-cols-2 lg:gap-6">
      {/* Left: revolving globe, click -> dashboard if logged in, else login */}
      <div className="lg:sticky lg:top-10 lg:self-start">
        <Reveal>
          <GlobePanel />
        </Reveal>
      </div>

      {/* Right: scroll story */}
      <div className="flex flex-col gap-16 pb-16">
        <Reveal>
          <section>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              PS162 · Smart India Hackathon 2026
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight">
              Every fire from space. Only the industrial ones, flagged.
            </h1>
            <p className="mt-4 max-w-md text-sm text-muted-foreground">
              Satellites see heat. They can&apos;t tell a refinery flare from a forest fire. This system
              classifies NASA FIRMS thermal detections into industrial vs natural sources and puts them
              on a live GIS map.
            </p>
          </section>
        </Reveal>

        {STEPS.map((s, i) => (
          <Reveal key={s.title} delay={80}>
            <section className="border-l-2 border-primary/40 pl-5">
              <p className="text-xs font-mono text-muted-foreground">0{i + 1}</p>
              <h2 className="mt-1 text-xl font-semibold">{s.title}</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">{s.body}</p>
            </section>
          </Reveal>
        ))}

        <Reveal>
          <section className="rounded-xl border bg-card p-6">
            <h2 className="text-xl font-semibold">See it live</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Sign in to open the dashboard: the same detections as this globe, on a full FIRMS-style
              world map with class filters and per-point explanations.
            </p>
            <Button asChild size="lg" className="mt-4">
              <a href="/dashboard/default">Open the live map</a>
            </Button>
          </section>
        </Reveal>
      </div>
    </main>
  );
}
