import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThermalMap } from "../_components/thermal-map";
import { createClient } from "@/lib/gqlClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

export default function Page() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Thermal Intelligence — PS162</h1>
          <p className="text-sm text-muted-foreground">Industrial fires vs forest/agri via FIRMS + OSM + persistence scoring</p>
        </div>
        <div className="hidden text-xs text-muted-foreground md:block">NTRO • SIH26162 • FIRMS VIIRS 375m • OSM</div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>FIRMS VIIRS NRT — Thermal Overlay</CardTitle>
          <CardDescription>Demo points: Jamnagar flare (industrial 0.92) vs forest (0.08) — MapLibre GL + persistence</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ThermalMap />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Filters (next)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Date range • bbox draw • class • persistence threshold — GraphQL firmsPoints query wired after AI predict lands.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Demo — Jamnagar persistence 0.92 vs forest 0.08 (DBSCAN 30d window).</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">AI Predict</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">POST /firms/predict (Python) → XGBoost industrial_prob + OSM join — coming iteration 2.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Live thermal alerts (realtime Gleam SSE)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">waiting for broadcasts… (api: broadcast → hub → realtime)</p>
        </CardContent>
      </Card>
    </div>
  );
}
