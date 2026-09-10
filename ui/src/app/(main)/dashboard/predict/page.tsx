"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CLASSIFY_FIRMS_POINT, createClient, type FirmsClassification } from "@/lib/gqlClient";

const api = createClient(process.env.NEXT_PUBLIC_API_URL ?? "");

const FIELDS = [
  { key: "lat", label: "Latitude", placeholder: "22.47" },
  { key: "lon", label: "Longitude", placeholder: "70.05" },
  { key: "frp", label: "FRP (MW)", placeholder: "45.2" },
  { key: "brightTi4", label: "Brightness TI4 (K, optional)", placeholder: "370" },
] as const;

export default function PredictPage() {
  const [values, setValues] = useState<Record<string, string>>({ lat: "", lon: "", frp: "", brightTi4: "" });
  const [result, setResult] = useState<FirmsClassification | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  const classify = async () => {
    setStatus("loading");
    setError("");
    try {
      const input: Record<string, number> = { lat: Number(values.lat), lon: Number(values.lon) };
      if (values.frp) input.frp = Number(values.frp);
      if (values.brightTi4) input.brightTi4 = Number(values.brightTi4);
      const d = await api.graphql<{ classifyFirmsPoint: FirmsClassification }>(CLASSIFY_FIRMS_POINT, { input });
      setResult(d.classifyFirmsPoint);
      setStatus("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "classification failed");
      setStatus("error");
    }
  };

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Predict</h1>
        <p className="text-sm text-muted-foreground">
          Runs a point through the real pipeline: PostGIS distance-to-industrial-site + ESA WorldCover landcover
          auto-enrichment, the heuristic classifier, and a similar-case lookup from the RAG store.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Point</CardTitle>
          <CardDescription>Only latitude and longitude are required - everything else is optional.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FIELDS.map((f) => (
              <div key={f.key} className="grid gap-1.5">
                <Label htmlFor={f.key}>{f.label}</Label>
                <Input
                  id={f.key}
                  placeholder={f.placeholder}
                  value={values[f.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  inputMode="decimal"
                />
              </div>
            ))}
          </div>
          <Button className="mt-4" onClick={classify} disabled={status === "loading" || !values.lat || !values.lon}>
            {status === "loading" ? "Classifying…" : "Classify"}
          </Button>
          {status === "error" && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              Result <Badge variant="outline">{result.predictedClass}</Badge>
            </CardTitle>
            <CardDescription>
              industrial_prob={result.industrialProb.toFixed(2)} · persistence={result.persistence.toFixed(2)}
              {result.landcover != null && <> · landcover class {result.landcover}</>}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Reasons</h3>
              <ul className="list-inside list-disc text-sm">
                {result.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
            {result.similarCases.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Similar past cases (RAG store)
                </h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {result.similarCases.map((s) => (
                    <li key={s.id}>
                      <span className="font-mono text-xs">{s.score.toFixed(2)}</span> — {s.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
