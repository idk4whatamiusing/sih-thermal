"use client";
import { useEffect, useRef, useState } from "react";
export function ThermalMap() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !ref.current) return;
      const map = new maplibre.Map({
        container: ref.current,
        style: "https://demotiles.maplibre.org/style.json",
        center: [78.96, 20.59] as any,
        zoom: 4,
      });
      map.addControl(new maplibre.NavigationControl(), "top-right");
      map.on("load", () => {
        map.addSource("firms-demo", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [
              { type: "Feature", geometry: { type: "Point", coordinates: [70.06, 22.47] }, properties: { frp: 45.2, class: "industrial_flare", persistence: 0.92 } },
              { type: "Feature", geometry: { type: "Point", coordinates: [82.68, 22.35] }, properties: { frp: 12.1, class: "forest", persistence: 0.08 } },
            ],
          },
        });
        map.addLayer({
          id: "firms-points",
          type: "circle",
          source: "firms-demo",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["get", "frp"], 0, 4, 50, 14],
            "circle-color": ["match", ["get", "class"], "industrial_flare", "#ef4444", "thermal_power", "#f97316", "forest", "#22c55e", "agriculture", "#eab308", "#6b7280"],
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
            "circle-opacity": 0.85,
          },
        });
        setLoaded(true);
      });
      (mapRef as any).current = map;
    })();
    return () => { cancelled = true; (mapRef as any).current?.remove?.(); };
  }, []);
  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-xl border bg-card">
      <div ref={ref} className="h-full w-full bg-muted" />
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-muted-foreground">
        {loaded ? "FIRMS VIIRS NRT — demo points (Jamnagar flare vs forest)" : "loading map…"}
      </div>
      <div className="absolute bottom-2 right-2 flex gap-1.5 text-[10px]">
        <span className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-white"><span className="h-2 w-2 rounded-full bg-red-500" /> industrial</span>
        <span className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-white"><span className="h-2 w-2 rounded-full bg-green-500" /> forest</span>
        <span className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-white"><span className="h-2 w-2 rounded-full bg-yellow-400" /> agriculture</span>
      </div>
    </div>
  );
}
