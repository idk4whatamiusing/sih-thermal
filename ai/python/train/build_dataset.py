"""Builds a training dataset from real Postgres data: joins thermal_clusters
with label_events (Phase 2b) for labels, and firms_points (Phase 2a) for
each cluster's per-point time-series history.

This connects to Postgres directly via asyncpg rather than going through
the db gRPC service. That is a deliberate, narrow exception to "only Go
talks to the DB": this is an offline batch/training job, not part of the
live request path, and Python already carries asyncpg as a dependency for
exactly this kind of use. The live serving path (ai/cmd/ai, the sidecar's
/firms/* endpoints) is unaffected and still has zero direct Postgres access.

Known real gap (not fixed here - out of this script's scope): nothing in
the ingestion pipeline (Phase 2a) currently assigns firms_points.cluster_id
- ClusterFirmsPoints exists but isn't invoked automatically during ingest.
Until that's wired up, real ingested points won't be attached to clusters,
so this script will find few or zero real samples even with real labeled
clusters. It still runs correctly against whatever data exists; it does
not fabricate anything to compensate.

Usage:
    python build_dataset.py --out data/dataset.jsonl
"""

import argparse
import asyncio
import json
import math
import os
import sys
from datetime import date

import asyncpg

sys.path.insert(0, os.path.dirname(__file__))
from schema import MAX_SEQ_LEN, SOURCE_WEIGHT, normalize_dist, normalize_frp, normalize_temp


async def fetch_labeled_clusters(conn: asyncpg.Connection) -> list[dict]:
    rows = await conn.fetch(
        """
        SELECT DISTINCT ON (tc.id)
            tc.id, tc.count, tc.avg_frp, tc.max_frp, tc.persistence,
            tc.first_seen, tc.last_seen,
            le.label, le.source, le.confidence
        FROM thermal_clusters tc
        JOIN label_events le ON le.cluster_id = tc.id
        ORDER BY tc.id,
            CASE le.source WHEN 'gdelt' THEN 0 ELSE 1 END,  -- prefer independent labels
            le.confidence DESC
        """
    )
    return [dict(r) for r in rows]


async def fetch_cluster_points(conn: asyncpg.Connection, cluster_id) -> list[dict]:
    rows = await conn.fetch(
        """
        SELECT frp, bright_ti4, bright_ti5, dist_industrial_m, inside_industrial, acq_date
        FROM firms_points WHERE cluster_id = $1 ORDER BY acq_date, acq_time
        """,
        cluster_id,
    )
    return [dict(r) for r in rows]


def build_sample(cluster: dict, points: list[dict]) -> dict | None:
    if not points:
        return None  # no point history - can't build a sequence, skip

    first_seen: date = cluster["first_seen"]
    seq = []
    for p in points[:MAX_SEQ_LEN]:
        days_since = (p["acq_date"] - first_seen).days if first_seen else 0
        seq.append([
            normalize_frp(p["frp"]),
            normalize_temp(p["bright_ti4"]),
            normalize_temp(p["bright_ti5"]),
            normalize_dist(p["dist_industrial_m"]),
            min(1.0, days_since / 30.0),
        ])
    seq_mask = [False] * len(seq) + [True] * (MAX_SEQ_LEN - len(seq))
    seq += [[0.0] * 5] * (MAX_SEQ_LEN - len(seq))

    dists = [p["dist_industrial_m"] for p in points if p["dist_industrial_m"] is not None]
    insides = [1.0 if p["inside_industrial"] else 0.0 for p in points]
    duration_days = (cluster["last_seen"] - cluster["first_seen"]).days if cluster["first_seen"] and cluster["last_seen"] else 0
    month = first_seen.month if first_seen else 1

    static = [
        min(1.0, cluster["count"] / 50.0),
        normalize_frp(cluster["avg_frp"]),
        normalize_frp(cluster["max_frp"]),
        cluster["persistence"] or 0.0,
        min(1.0, duration_days / 90.0),
        normalize_dist(sum(dists) / len(dists)) if dists else 1.0,
        sum(insides) / len(insides) if insides else 0.0,
        math.sin(2 * math.pi * month / 12),
        math.cos(2 * math.pi * month / 12),
    ]

    weight = (cluster["confidence"] or 0.5) * SOURCE_WEIGHT.get(cluster["source"], 0.1)
    return {
        "cluster_id": str(cluster["id"]), "seq": seq, "seq_mask": seq_mask, "static": static,
        "label": cluster["label"], "weight": round(weight, 4), "source": cluster["source"],
    }


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "data", "dataset.jsonl"))
    ap.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    args = ap.parse_args()

    if not args.database_url:
        print("DATABASE_URL not set (env or --database-url)", file=sys.stderr)
        sys.exit(1)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    conn = await asyncpg.connect(args.database_url)
    try:
        clusters = await fetch_labeled_clusters(conn)
        print(f"found {len(clusters)} labeled clusters")
        written = 0
        with open(args.out, "w") as f:
            for c in clusters:
                points = await fetch_cluster_points(conn, c["id"])
                sample = build_sample(c, points)
                if sample is None:
                    continue
                f.write(json.dumps(sample) + "\n")
                written += 1
        print(f"wrote {written} samples to {args.out}")
        if written == 0:
            print("0 samples: either no labeled clusters exist yet, or their firms_points "
                  "have no cluster_id set (clustering isn't wired into ingestion yet). "
                  "This is a real data gap, not a bug in this script.", file=sys.stderr)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
