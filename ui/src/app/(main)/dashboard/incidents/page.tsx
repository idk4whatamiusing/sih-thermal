"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient, THERMAL_CLUSTERS_QUERY, type ThermalCluster } from "@/lib/gqlClient";

const api = createClient(process.env.NEXT_PUBLIC_API_URL ?? "");

const CLASS_VARIANT: Record<string, "destructive" | "secondary" | "outline"> = {
  industrial_flare: "destructive",
  thermal_power: "destructive",
  mining: "secondary",
  forest: "outline",
  agriculture: "outline",
  unknown: "secondary",
};

export default function IncidentsPage() {
  const [bbox, setBbox] = useState({ minLat: "-15", minLon: "10", maxLat: "5", maxLon: "35" });
  const [clusters, setClusters] = useState<ThermalCluster[] | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  const search = async () => {
    setStatus("loading");
    try {
      const d = await api.graphql<{ thermalClusters: ThermalCluster[] }>(THERMAL_CLUSTERS_QUERY, {
        bbox: {
          minLat: Number(bbox.minLat),
          minLon: Number(bbox.minLon),
          maxLat: Number(bbox.maxLat),
          maxLon: Number(bbox.maxLon),
        },
      });
      setClusters(d.thermalClusters.sort((a, b) => b.persistence - a.persistence));
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Incidents</h1>
        <p className="text-sm text-muted-foreground">
          Persistent thermal clusters (grouped by the ingestion pipeline&apos;s DBSCAN-ish clustering), ranked by persistence.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Search bbox</CardTitle>
          <CardDescription>Min/max latitude and longitude to search for thermal clusters.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["minLat", "minLon", "maxLat", "maxLon"] as const).map((k) => (
              <div key={k} className="grid gap-1.5">
                <Label htmlFor={k}>{k}</Label>
                <Input
                  id={k}
                  value={bbox[k]}
                  onChange={(e) => setBbox((b) => ({ ...b, [k]: e.target.value }))}
                  inputMode="decimal"
                />
              </div>
            ))}
          </div>
          <Button className="mt-4" onClick={search} disabled={status === "loading"}>
            {status === "loading" ? "Searching…" : "Search"}
          </Button>
          {status === "error" && <p className="mt-2 text-sm text-destructive">Could not load incidents.</p>}
        </CardContent>
      </Card>

      {clusters && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{clusters.length} cluster{clusters.length === 1 ? "" : "s"}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Count</TableHead>
                  <TableHead>Avg FRP</TableHead>
                  <TableHead>Max FRP</TableHead>
                  <TableHead>Persistence</TableHead>
                  <TableHead>First seen</TableHead>
                  <TableHead>Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clusters.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Badge variant={CLASS_VARIANT[c.predictedClass] ?? "outline"}>{c.predictedClass}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {c.centroidLat.toFixed(4)}, {c.centroidLon.toFixed(4)}
                    </TableCell>
                    <TableCell>{c.count}</TableCell>
                    <TableCell>{c.avgFrp.toFixed(1)}</TableCell>
                    <TableCell>{c.maxFrp.toFixed(1)}</TableCell>
                    <TableCell>{c.persistence.toFixed(2)}</TableCell>
                    <TableCell>{c.firstSeen}</TableCell>
                    <TableCell>{c.lastSeen}</TableCell>
                  </TableRow>
                ))}
                {clusters.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No clusters found in this bbox.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
