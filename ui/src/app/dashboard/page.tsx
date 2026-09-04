"use client";

// PS162 Dashboard: FIRMS thermal map + auth + live events
// Stripped chat/RAG per team decision — GIS overlay is primary
import { useEffect, useRef, useState } from "react";
import { createClient, ME, type User } from "../../../lib/gqlClient";

const api = createClient(process.env.NEXT_PUBLIC_API_URL ?? "");

// Map placeholder — MapLibre loads browser-only
function ThermalMap() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // dynamic import avoids SSR
      const maplibre = await import("maplibre-gl");
      // css loaded via globals.css import maplibre style if needed
      if (cancelled || !ref.current) return;
      const map = new maplibre.Map({
        container: ref.current,
        style: "https://demotiles.maplibre.org/style.json",
        center: [78.96, 20.59] as any,
        zoom: 4,
      });
      map.addControl(new maplibre.NavigationControl(), "top-right");
      // demo: Jamnagar refinery persistent source
      map.on("load", () => {
        map.addSource("firms-demo", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: { type: "Point", coordinates: [70.06, 22.47] },
                properties: { frp: 45.2, class: "industrial_flare", persistence: 0.92 },
              },
              {
                type: "Feature",
                geometry: { type: "Point", coordinates: [82.68, 22.35] },
                properties: { frp: 12.1, class: "forest", persistence: 0.08 },
              },
            ],
          },
        });
        map.addLayer({
          id: "firms-points",
          type: "circle",
          source: "firms-demo",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["get", "frp"], 0, 4, 50, 14],
            "circle-color": [
              "match",
              ["get", "class"],
              "industrial_flare",
              "#ef4444",
              "thermal_power",
              "#f97316",
              "forest",
              "#22c55e",
              "agriculture",
              "#eab308",
              "#6b7280",
            ],
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
            "circle-opacity": 0.85,
          },
        });
        setLoaded(true);
      });
      (mapRef as any).current = map;
    })();
    return () => {
      cancelled = true;
      (mapRef as any).current?.remove?.();
    };
  }, []);

  return (
    <div className="relative h-[480px] w-full overflow-hidden rounded-xl border border-zinc-800">
      <div ref={ref} className="h-full w-full bg-zinc-900" />
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-zinc-200">
        {loaded ? "FIRMS VIIRS NRT — demo points (Jamnagar flare vs forest)" : "loading map…"}
      </div>
      <div className="absolute bottom-2 right-2 flex gap-1.5 text-[10px]">
        <span className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-white">
          <span className="h-2 w-2 rounded-full bg-red-500" /> industrial
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

export default function Dashboard() {
  const [me, setMe] = useState<User | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [email, setEmail] = useState("");

  useEffect(() => {
    api
      .graphql<{ me: User | null }>(ME)
      .then((d) => setMe(d.me))
      .catch(() => setMe(null));
    return api.subscribe<{ events: string }>(
      "subscription { events }",
      undefined,
      (d) => setEvents((prev) => [d.events, ...prev].slice(0, 50)),
    );
  }, []);

  const login = async () => {
    await api.graphql(`mutation ($email: String!) { login(email: $email) { id email } }`, {
      email: email || "dev@example.com",
    });
    location.reload();
  };
  const logout = async () => {
    await api.graphql("mutation { logout }");
    location.reload();
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Thermal Intelligence — PS162</h1>
          <p className="text-sm text-zinc-400">Industrial fires vs forest/agri via FIRMS + OSM + persistence scoring</p>
        </div>
        <div className="text-xs text-zinc-500">NTRO • SIH26162 • FIRMS VIIRS 375m • OSM</div>
      </div>

      <section className="rounded-xl border border-zinc-800 p-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-400">Auth (Worker Google OAuth)</h2>
        {me ? (
          <div className="flex items-center justify-between">
            <p>
              logged in as <span className="font-medium">{me.email}</span>
            </p>
            <button onClick={logout} className="rounded-lg border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-900">
              logout
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dev@example.com"
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1 text-sm outline-none focus:border-emerald-500"
            />
            <button onClick={login} className="rounded-lg bg-emerald-600 px-3 py-1 text-sm hover:bg-emerald-500">
              dev login
            </button>
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/auth/google`}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1 text-center text-sm hover:bg-zinc-800"
            >
              Google login
            </a>
          </div>
        )}
      </section>

      <ThermalMap />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">Filters (next)</h3>
          <p className="mt-2 text-sm text-zinc-600">Date range • bbox draw • class • persistence threshold — GraphQL firmsPoints query wired after AI predict lands.</p>
        </div>
        <div className="rounded-xl border border-zinc-800 p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">Stats</h3>
          <p className="mt-2 text-sm text-zinc-600">Demo — Jamnagar persistence 0.92 vs forest 0.08 (DBSCAN 30d window).</p>
        </div>
        <div className="rounded-xl border border-zinc-800 p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">AI Predict</h3>
          <p className="mt-2 text-sm text-zinc-600">POST /firms/predict (Python) → XGBoost industrial_prob + OSM join — coming iteration 2.</p>
        </div>
      </div>

      <section className="rounded-xl border border-zinc-800 p-4">
        <h2 className="mb-2 text-sm font-medium text-zinc-400">Live thermal alerts (realtime Gleam SSE)</h2>
        {events.length === 0 ? (
          <p className="text-xs text-zinc-600">waiting for broadcasts… (api: broadcast → hub → realtime)</p>
        ) : (
          <ul className="space-y-1 font-mono text-xs">
            {events.map((e, i) => (
              <li key={i} className="text-emerald-400">
                {e}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
