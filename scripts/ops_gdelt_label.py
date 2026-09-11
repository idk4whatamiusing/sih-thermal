#!/usr/bin/env python3
"""GDELT weak-labeling for thermal_clusters via direct SQL (ops, issue #21).

Same sanctioned offline exception as train/build_dataset.py: this is a batch
job, not the live path (which keeps the "only Go talks to the DB" rule).
Mirrors ai/cmd/gdeltsync/main.go exactly (bbox list -> skip already-labeled
-> sidecar-equivalent gdelt lookup -> insert), but runs anywhere the ai image's
Python (httpx+asyncpg) is available without a Go toolchain:

    docker compose -f compose.prod.yaml run --rm \
      -v ~/sih-thermal/ai/python:/mnt/py -v ~/sih-thermal/scripts:/mnt/ops \
      -e DATABASE_URL=postgres://app:PASSWORD@postgres:5432/app \
      ai python /mnt/ops/ops_gdelt_label.py --min-lat 22 --min-lon 69.5 --max-lat 23 --max-lon 70.5

Idempotent: clusters that already have a gdelt label_events row are skipped.
"""

import argparse
import asyncio
import os
import sys
import time
import uuid
from datetime import date, timedelta

# Locate ai/python (gdelt.py): repo layout first, then container mount points.
_HERE = os.path.dirname(os.path.abspath(__file__))
for _cand in (os.path.join(_HERE, "..", "ai", "python"), "/mnt/py", "/app/python"):
    if os.path.exists(os.path.join(_cand, "gdelt.py")):
        sys.path.insert(0, _cand)
        break


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    ap.add_argument("--min-lat", type=float, default=22.0)
    ap.add_argument("--min-lon", type=float, default=69.5)
    ap.add_argument("--max-lat", type=float, default=23.0)
    ap.add_argument("--max-lon", type=float, default=70.5)
    ap.add_argument("--pad-days", type=int, default=3)
    ap.add_argument("--limit", type=int, default=500)
    args = ap.parse_args()
    if not args.database_url:
        print("DATABASE_URL not set", file=sys.stderr)
        return 1

    # Lazy: only the execution environment (ai image) needs these, so
    # --help works anywhere.
    import asyncpg
    import gdelt

    conn = await asyncpg.connect(args.database_url)

    async def ensure_conn():
        """CD restarts (postgres recreate) drop long-lived connections; the
        run is idempotent (labeled clusters are skipped) so reconnecting and
        continuing is always safe."""
        nonlocal conn
        try:
            await conn.fetchval("SELECT 1")
        except Exception:  # noqa: BLE001 - any transport failure -> fresh connection
            try:
                await conn.close()
            except Exception:  # noqa: BLE001
                pass
            conn = await asyncpg.connect(args.database_url)

    try:
        clusters = await conn.fetch(
            """
            SELECT id, ST_Y(centroid) AS lat, ST_X(centroid) AS lon,
                   first_seen, last_seen
            FROM thermal_clusters
            WHERE ST_Y(centroid) BETWEEN $1 AND $2
              AND ST_X(centroid) BETWEEN $3 AND $4
            ORDER BY last_seen DESC NULLS LAST
            LIMIT $5
            """,
            args.min_lat, args.max_lat, args.min_lon, args.max_lon, args.limit,
        )
        print(f"found {len(clusters)} thermal clusters in bbox")
        labeled, skipped, no_match = 0, 0, 0
        fallback = 0
        for c in clusters:
            await ensure_conn()
            n = await conn.fetchval(
                "SELECT count(*) FROM label_events WHERE cluster_id = $1 AND source = 'gdelt'",
                c["id"],
            )
            if n:
                skipped += 1
                continue
            last_seen: date | None = c["last_seen"]
            if not last_seen:
                no_match += 1
                continue
            df = (last_seen - timedelta(days=args.pad_days)).isoformat()
            dt_ = (last_seen + timedelta(days=args.pad_days)).isoformat()
            res = await asyncio.to_thread(gdelt.label_from_gdelt, c["lat"], c["lon"], df, dt_)
            time.sleep(2)  # GDELT DOC burst quota: space clusters out (429s otherwise)
            if res is None:
                no_match += 1
                continue
            if str(res.get("rationale", "")).startswith("keyword-fallback"):
                fallback += 1
            await conn.execute(
                """
                INSERT INTO label_events
                  (id, cluster_id, source, label, confidence,
                   matched_article_url, matched_article_title)
                VALUES ($1, $2, 'gdelt', $3, $4, $5, $6)
                """,
                uuid.uuid4(), c["id"], res["label"], res["confidence"],
                res["matched_article_url"], res["matched_article_title"],
            )
            labeled += 1
        print(f"done: {labeled} labeled ({fallback} keyword-fallback), {skipped} already had gdelt label, {no_match} no match")
        return 0
    finally:
        await conn.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
