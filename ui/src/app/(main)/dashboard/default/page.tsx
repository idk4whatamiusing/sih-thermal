import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { ThermalMap } from "../_components/thermal-map";

export default function Page() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Thermal Intelligence — PS162</h1>
          <p className="text-sm text-muted-foreground">
            Industrial fires vs. forest/agriculture via NASA FIRMS + OSM industrial sites + landcover + a trained classifier
          </p>
        </div>
        <div className="hidden text-xs text-muted-foreground md:block">NTRO • SIH26162 • FIRMS VIIRS 375m • OSM</div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>FIRMS VIIRS NRT — Thermal Overlay</CardTitle>
          <CardDescription>Live detections for the current map view, classified and colored by predicted class. Pan/zoom to refetch.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ThermalMap />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Incidents</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Persistent thermal clusters (DBSCAN over recurring detections) with their heuristic + AI-arbitrated classification.
            </p>
            <Link href="/dashboard/incidents" className="mt-2 inline-block text-sm text-primary underline underline-offset-4">
              View incidents →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">AI Predict</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Classify a point manually - runs the same heuristic + PostGIS/landcover enrichment + RAG similar-case lookup the ingestion pipeline uses.
            </p>
            <Link href="/dashboard/predict" className="mt-2 inline-block text-sm text-primary underline underline-offset-4">
              Try it →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
