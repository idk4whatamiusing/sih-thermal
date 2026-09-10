"use client";

import { useEffect, useRef, useState } from "react";

import { createClient, FIRMS_POINTS_QUERY, type FirmsPoint } from "@/lib/gqlClient";

const api = createClient(process.env.NEXT_PUBLIC_API_URL ?? "");

function toGeoJSON(points: FirmsPoint[]) {
  return {
    type: "FeatureCollection" as const,
    features: points.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.longitude, p.latitude] },
      properties: { frp: p.frp, class: p.predictedClass, persistence: p.persistenceScore },
    })),
  };
}

export function ThermalMap() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !ref.current) return;
      let map: import("maplibre-gl").Map;
      try {
        map = new maplibre.Map({
          container: ref.current,
          style: "https://demotiles.maplibre.org/style.json",
          center: [78.96, 20.59],
          zoom: 4,
        });
      } catch (e) {
        console.error("maplibre init failed:", e);
        setStatus("error");
        return;
      }
      map.addControl(new maplibre.NavigationControl(), "top-right");
      map.on("error", (e) => {
        console.error("maplibre error:", e.error);
        if (!cancelled) setStatus("error");
      });

      const fetchForCurrentView = async () => {
        const b = map.getBounds();
        try {
          const d = await api.graphql<{ firmsPoints: FirmsPoint[] }>(FIRMS_POINTS_QUERY, {
            bbox: { minLat: b.getSouth(), minLon: b.getWest(), maxLat: b.getNorth(), maxLon: b.getEast() },
            limit: 2000,
          });
          const source = map.getSource("firms") as import("maplibre-gl").GeoJSONSource | undefined;
          source?.setData(toGeoJSON(d.firmsPoints) as never);
          setCount(d.firmsPoints.length);
          setStatus("ready");
        } catch {
          setStatus("error");
        }
      };

      map.on("load", () => {
        map.addSource("firms", { type: "geojson", data: toGeoJSON([]) as never });
        map.addLayer({
          id: "firms-points",
          type: "circle",
          source: "firms",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["get", "frp"], 0, 4, 50, 14],
            "circle-color": [
              "match",
              ["get", "class"],
              "industrial_flare",
              "#ef4444",
              "thermal_power",
              "#f97316",
              "mining",
              "#a855f7",
              "forest",
              "#22c55e",
              "agriculture",
              "#eab308",
              "#6b7280", // unknown
            ],
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
            "circle-opacity": 0.85,
          },
        });
        fetchForCurrentView();
      });

      map.on("moveend", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(fetchForCurrentView, 400);
      });

      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      mapRef.current?.remove();
    };
  }, []);

  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-xl border bg-card">
      <div ref={ref} className="h-full w-full bg-muted" />
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-white">
        {status === "loading" && "loading map…"}
        {status === "ready" && `${count} FIRMS detection${count === 1 ? "" : "s"} in view`}
        {status === "error" && "map failed to load (see console) - could not load thermal points"}
      </div>
      <div className="absolute bottom-2 right-2 flex flex-wrap justify-end gap-1.5 text-[10px]">
        <span className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-white">
          <span className="h-2 w-2 rounded-full bg-red-500" /> industrial flare
        </span>
        <span className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-white">
          <span className="h-2 w-2 rounded-full bg-orange-500" /> thermal power
        </span>
        <span className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-white">
          <span className="h-2 w-2 rounded-full bg-purple-500" /> mining
        </span>
        <span className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-white">
          <span className="h-2 w-2 rounded-full bg-green-500" /> forest
        </span>
        <span className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-white">
          <span className="h-2 w-2 rounded-full bg-yellow-400" /> agriculture
        </span>
      </div>
    </div>
  );
}
