"use client";

// FIRMS-clone dashboard map (issue #23): world view on a dark canvas with
// FIRMS-style dots, class segregation toggles (deliverable i), date window,
// cluster overlay, and per-point popups. Export-safe: maplibre is dynamically
// imported so static prerender never touches WebGL.
import { useEffect, useRef, useState } from "react";

import {
  createClient,
  FIRMS_POINTS_QUERY,
  THERMAL_CLUSTERS_QUERY,
  type FirmsPoint,
  type ThermalCluster,
} from "@/lib/gqlClient";

const api = createClient(process.env.NEXT_PUBLIC_API_URL ?? "");

// NASA GIBS near-real-time imagery lags a couple of days behind "today" -
// pin to 2 days back rather than "default", which 404s for this layer.
function gibsDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 2);
  return d.toISOString().slice(0, 10);
}

const CLASSES = ["industrial_flare", "thermal_power", "mining", "forest", "agriculture", "unknown"] as const;

const CLASS_LABEL: Record<string, string> = {
  industrial_flare: "industrial flare",
  thermal_power: "thermal power",
  mining: "mining",
  forest: "forest",
  agriculture: "agriculture",
  unknown: "unknown",
};

const CLASS_COLOR: Record<string, string> = {
  industrial_flare: "#ef4444",
  thermal_power: "#f97316",
  mining: "#a855f7",
  forest: "#22c55e",
  agriculture: "#eab308",
  unknown: "#6b7280",
};

const CLASS_PAINT = [
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
  "#6b7280",
] as never;

// FIRMS red for "same dots as firms" mode
const FIRMS_RED = "#ff2d2d";

function toGeoJSON(points: FirmsPoint[]) {
  return {
    type: "FeatureCollection" as const,
    features: points.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.longitude, p.latitude] },
      properties: {
        frp: p.frp,
        class: p.predictedClass,
        acqDate: p.acqDate,
        confidence: p.confidence,
        satellite: p.satellite,
        industrialProb: p.industrialProb,
        persistence: p.persistenceScore,
        clusterId: p.clusterId ?? "",
      },
    })),
  };
}

function clustersToGeoJSON(clusters: ThermalCluster[]) {
  return {
    type: "FeatureCollection" as const,
    features: clusters.map((c) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [c.centroidLon, c.centroidLat] },
      properties: { count: c.count, class: c.predictedClass, firstSeen: c.firstSeen, lastSeen: c.lastSeen },
    })),
  };
}

export function ThermalMap() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const allRef = useRef<FirmsPoint[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CLASSES.map((c) => [c, true])),
  );
  const [firmsMode, setFirmsMode] = useState(false);
  const [basemap, setBasemap] = useState<"dark" | "satellite">("dark");
  const [showClusters, setShowClusters] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const filtersRef = useRef({ enabled, dateFrom, dateTo });
  filtersRef.current = { enabled, dateFrom, dateTo };

  // Apply client-side class filter to the cached fetch
  const applyFilters = () => {
    const map = mapRef.current;
    if (!map) return;
    const { enabled: en } = filtersRef.current;
    const pts = allRef.current.filter((p) => en[p.predictedClass] ?? true);
    const source = map.getSource("firms") as import("maplibre-gl").GeoJSONSource | undefined;
    source?.setData(toGeoJSON(pts) as never);
    setCount(pts.length);
    setTotal(allRef.current.length);
  };

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
          style: {
            version: 8,
            sources: {
              dark: {
                type: "raster",
                tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
                tileSize: 256,
                attribution: "© OpenStreetMap contributors © CARTO",
              },
              sat: {
                type: "raster",
                tiles: [
                  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${gibsDate()}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
                ],
                tileSize: 256,
                attribution: "Imagery © NASA EOSDIS GIBS",
              },
            },
            layers: [
              { id: "dark-bg", type: "raster", source: "dark" },
              { id: "sat-bg", type: "raster", source: "sat", layout: { visibility: "none" } },
            ],
          },
          center: [20, 20],
          zoom: 2,
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
        const { dateFrom: df, dateTo: dt } = filtersRef.current;
        try {
          const vars: Record<string, unknown> = {
            bbox: { minLat: b.getSouth(), minLon: b.getWest(), maxLat: b.getNorth(), maxLon: b.getEast() },
            limit: 2000,
          };
          if (df) vars.dateFrom = df;
          if (dt) vars.dateTo = dt;
          const d = await api.graphql<{ firmsPoints: FirmsPoint[] }>(FIRMS_POINTS_QUERY, vars);
          allRef.current = d.firmsPoints;
          if (!cancelled) {
            setStatus("ready");
            applyFilters();
          }
        } catch {
          if (!cancelled) setStatus("error");
        }
      };

      const fetchClusters = async () => {
        const b = map.getBounds();
        try {
          const d = await api.graphql<{ thermalClusters: ThermalCluster[] }>(THERMAL_CLUSTERS_QUERY, {
            bbox: { minLat: b.getSouth(), minLon: b.getWest(), maxLat: b.getNorth(), maxLon: b.getEast() },
          });
          const source = map.getSource("clusters") as import("maplibre-gl").GeoJSONSource | undefined;
          source?.setData(clustersToGeoJSON(d.thermalClusters) as never);
        } catch {
          /* clusters are an overlay - points stay usable without them */
        }
      };
      (map as unknown as { __fetchClusters: () => void }).__fetchClusters = fetchClusters;

      map.on("load", () => {
        map.addSource("firms", { type: "geojson", data: toGeoJSON([]) as never });
        map.addLayer({
          id: "firms-points",
          type: "circle",
          source: "firms",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["get", "frp"], 0, 4, 50, 14],
            "circle-color": CLASS_PAINT,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
            "circle-opacity": 0.85,
          },
        });
        map.addSource("clusters", { type: "geojson", data: clustersToGeoJSON([]) as never });
        map.addLayer({
          id: "cluster-rings",
          type: "circle",
          source: "clusters",
          layout: { visibility: "none" },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["get", "count"], 1, 6, 50, 22],
            "circle-color": "#38bdf8",
            "circle-opacity": 0.25,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#38bdf8",
          },
        });
        map.on("click", "firms-points", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as Record<string, unknown>;
          const [[lon, lat]] = [(f.geometry as { coordinates: [number, number] }).coordinates];
          new maplibre.Popup({ closeButton: true })
            .setLngLat([lon, lat])
            .setHTML(
              `<div style="font-size:12px;line-height:1.5;min-width:180px">` +
                `<b>${CLASS_LABEL[String(p.class)] ?? p.class}</b><br/>` +
                `date: ${p.acqDate} · FRP: ${Number(p.frp).toFixed(1)} MW<br/>` +
                `sat: ${p.satellite} · conf: ${p.confidence}<br/>` +
                `industrial prob: ${Number(p.industrialProb).toFixed(2)} · persistence: ${Number(p.persistence).toFixed(2)}` +
                (p.clusterId ? `<br/>cluster: ${String(p.clusterId).slice(0, 8)}…` : "") +
                `</div>`,
            )
            .addTo(map);
        });
        fetchForCurrentView();
      });

      map.on("moveend", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          fetchForCurrentView();
          const m = mapRef.current as unknown as { __fetchClusters?: () => void } | null;
          if (m?.__fetchClusters && (map.getLayoutProperty("cluster-rings", "visibility") === "visible")) {
            m.__fetchClusters();
          }
        }, 400);
      });

      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Basemap / dot-style / cluster visibility follow state
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.setLayoutProperty("dark-bg", "visibility", basemap === "dark" ? "visible" : "none");
      map.setLayoutProperty("sat-bg", "visibility", basemap === "satellite" ? "visible" : "none");
    } catch {
      /* style not loaded yet */
    }
  }, [basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (firmsMode) {
        map.setPaintProperty("firms-points", "circle-color", FIRMS_RED);
        map.setPaintProperty("firms-points", "circle-stroke-color", "#991b1b");
      } else {
        map.setPaintProperty("firms-points", "circle-color", CLASS_PAINT);
        map.setPaintProperty("firms-points", "circle-stroke-color", "#fff");
      }
    } catch {
      /* layer not added yet */
    }
  }, [firmsMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.setLayoutProperty("cluster-rings", "visibility", showClusters ? "visible" : "none");
    } catch {
      /* layer not added yet */
    }
    if (showClusters) {
      (map as unknown as { __fetchClusters?: () => void }).__fetchClusters?.();
    }
  }, [showClusters]);

  const refetch = () => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;
    setStatus("loading");
    const b = map.getBounds();
    const vars: Record<string, unknown> = {
      bbox: { minLat: b.getSouth(), minLon: b.getWest(), maxLat: b.getNorth(), maxLon: b.getEast() },
      limit: 2000,
    };
    if (dateFrom) vars.dateFrom = dateFrom;
    if (dateTo) vars.dateTo = dateTo;
    api
      .graphql<{ firmsPoints: FirmsPoint[] }>(FIRMS_POINTS_QUERY, vars)
      .then((d) => {
        allRef.current = d.firmsPoints;
        setStatus("ready");
        applyFilters();
      })
      .catch(() => setStatus("error"));
  };

  return (
    <div className="relative h-[calc(100dvh-8rem)] w-full overflow-hidden rounded-xl border bg-card">
      <div ref={ref} className="h-full w-full bg-muted" />
      <div className="absolute left-2 top-2 flex max-w-[240px] flex-col gap-2 rounded bg-black/70 p-2 text-xs text-white">
        <div>
          {status === "loading" && "loading map…"}
          {status === "ready" && `${count} of ${total} detections in view`}
          {status === "error" && "map failed to load (see console)"}
        </div>
        <div className="flex gap-1">
          <button
            className={`rounded px-1.5 py-0.5 ${basemap === "dark" ? "bg-white text-black" : "bg-white/20"}`}
            onClick={() => setBasemap("dark")}
          >
            FIRMS dark
          </button>
          <button
            className={`rounded px-1.5 py-0.5 ${basemap === "satellite" ? "bg-white text-black" : "bg-white/20"}`}
            onClick={() => setBasemap("satellite")}
          >
            satellite
          </button>
          <button
            className={`rounded px-1.5 py-0.5 ${firmsMode ? "bg-red-500 text-white" : "bg-white/20"}`}
            onClick={() => setFirmsMode((v) => !v)}
            title="All dots FIRMS red vs class colors"
          >
            FIRMS dots
          </button>
        </div>
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded bg-white/20 px-1 py-0.5 text-[11px]"
            aria-label="From date"
          />
          <span>→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded bg-white/20 px-1 py-0.5 text-[11px]"
            aria-label="To date"
          />
          <button className="rounded bg-white px-1.5 py-0.5 text-black" onClick={refetch}>
            go
          </button>
        </div>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showClusters} onChange={(e) => setShowClusters(e.target.checked)} />
          persistent clusters
        </label>
      </div>
      <div className="absolute bottom-2 right-2 flex flex-wrap justify-end gap-1.5 text-[10px]">
        {CLASSES.map((c) => (
          <button
            key={c}
            onClick={() => {
              const next = { ...enabled, [c]: !enabled[c] };
              setEnabled(next);
              filtersRef.current.enabled = next;
              applyFilters();
            }}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-white ${
              enabled[c] ? "bg-black/70" : "bg-black/30 line-through opacity-60"
            }`}
            title={`toggle ${CLASS_LABEL[c]}`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: CLASS_COLOR[c] }} />
            {CLASS_LABEL[c]}
          </button>
        ))}
      </div>
    </div>
  );
}
