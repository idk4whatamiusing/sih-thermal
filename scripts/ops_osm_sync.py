#!/usr/bin/env python3
"""OSM industrial-site sync via direct SQL (ops, training-data track).

Mirrors ai/cmd/osmsync/main.go exactly (same Overpass QL, same tag->type
mapping, same upsert semantics) but needs no Go toolchain: runs in the ai
image's Python (asyncpg) via compose run with repo mounts:

    docker compose -f compose.prod.yaml run --rm \
      -v ~/sih-thermal/scripts:/mnt/ops \
      -e DATABASE_URL=postgres://app:PASSWORD@postgres:5432/app \
      ai python /mnt/ops/ops_osm_sync.py --belts all

Same sanctioned offline exception as build_dataset.py. geom stays NULL like
the Go path (centroid-only "out center"); the polygon upgrade is a separate
tracked item. Idempotent: ON CONFLICT (osm_id) DO UPDATE.
"""

import argparse
import asyncio
import json
import os
import sys
import time
import urllib.parse
import urllib.request

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
UA = {"User-Agent": "orbis-osmsync/0.1 (PS162 SIH2026; contact via repo issues)"}

# Small bboxes: Overpass times out on country-scale industrial queries.
# Covers the refinery / power / steel / mining belts that matter for labels.
BELTS = {
    "jamnagar": (22.0, 69.0, 23.0, 70.8),
    "mumbai-pune": (18.4, 72.6, 19.3, 74.0),
    "korba": (22.2, 82.5, 22.6, 83.0),
    "talcher-angul": (20.8, 84.9, 21.2, 85.4),
    "jharia": (23.6, 86.2, 23.9, 86.6),
    "singrauli": (23.9, 82.5, 24.3, 83.0),
    "chennai": (12.8, 79.9, 13.3, 80.3),
    "vizag": (17.5, 82.9, 17.9, 83.4),
}


def industrial_type(tags: dict) -> str:
    if tags.get("power") == "plant":
        return "power_plant"
    if "works" in (tags.get("man_made") or "").lower() and "steel" in (tags.get("product") or "").lower():
        return "steel"
    if tags.get("man_made") == "works":
        return "refinery"
    return "other"


def fetch_belt(min_lat: float, min_lon: float, max_lat: float, max_lon: float) -> list:
    bbox = f"{min_lat},{min_lon},{max_lat},{max_lon}"
    q = (
        "[out:json][timeout:60];("
        f'nwr["landuse"="industrial"]({bbox});'
        f'nwr["man_made"="works"]({bbox});'
        f'nwr["power"="plant"]({bbox});'
        ");out center tags;"
    )
    req = urllib.request.Request(
        OVERPASS_URL,
        data=urllib.parse.urlencode({"data": q}).encode(),
        headers={**UA, "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp).get("elements", [])


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    ap.add_argument("--belts", default="all", help="all | comma list of belt names | bbox:minLat,minLon,maxLat,maxLon")
    args = ap.parse_args()
    if not args.database_url:
        print("DATABASE_URL not set", file=sys.stderr)
        return 1

    import asyncpg  # lazy: --help works anywhere; execution needs the ai image

    if args.belts == "all":
        jobs = list(BELTS.items())
    elif args.belts.startswith("bbox:"):
        a, o, b, c = (float(x) for x in args.belts[5:].split(","))
        jobs = [("custom", (a, o, b, c))]
    else:
        jobs = [(n, BELTS[n]) for n in args.belts.split(",") if n in BELTS]
        unknown = [n for n in args.belts.split(",") if n not in BELTS]
        if unknown:
            print(f"unknown belts: {unknown} (want {sorted(BELTS)})", file=sys.stderr)
            return 1

    conn = await asyncpg.connect(args.database_url)
    try:
        total = 0
        for name, (a, o, b, c) in jobs:
            try:
                els = await asyncio.to_thread(fetch_belt, a, o, b, c)
            except Exception as e:  # noqa: BLE001 - one belt failing must not kill the rest
                print(f"{name}: overpass failed: {str(e)[:150]}", flush=True)
                continue
            n = 0
            for el in els:
                lat, lon = el.get("lat", 0), el.get("lon", 0)
                center = el.get("center") or {}
                lat, lon = center.get("lat", lat), center.get("lon", lon)
                if not lat and not lon:
                    continue
                tags = el.get("tags") or {}
                await conn.execute(
                    """
                    INSERT INTO industrial_sites (osm_id, centroid, tags, industrial_type, name)
                    VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4::jsonb, $5, $6)
                    ON CONFLICT (osm_id) DO UPDATE SET
                      centroid = EXCLUDED.centroid, tags = EXCLUDED.tags,
                      industrial_type = EXCLUDED.industrial_type, name = EXCLUDED.name
                    """,
                    el["id"], lon, lat, json.dumps(tags), industrial_type(tags), tags.get("name"),
                )
                n += 1
            total += n
            print(f"{name}: {n}/{len(els)} sites written", flush=True)
            time.sleep(5)  # Overpass fair use between belts
        print(f"done: {total} industrial sites")
        return 0
    finally:
        await conn.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
