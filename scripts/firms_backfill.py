#!/usr/bin/env python3
"""World FIRMS backfill driver (issue #20).

Loops sensors x world tiles x 10-day windows (FIRMS NRT day_range cap) and
calls the GraphQL ingestFirms mutation, which runs the full
enrich -> classify -> persist -> cluster pipeline per window.

Idempotent: firmsPointID(satellite|date|time|lat|lon) upserts, so re-running
a window after a failure or with a narrowed --from is safe.

Usage:
    python3 scripts/firms_backfill.py --from 2025-09-10 --to 2026-09-10
    python3 scripts/firms_backfill.py --from 2026-09-01 --to 2026-09-10 \\
        --sensors VIIRS_SNPP_NRT --dry-run
    python3 scripts/firms_backfill.py --api https://api.16.112.107.217.sslip.io \\
        --email you@example.com --from 2026-08-01 --to 2026-09-10

Auth: uses the dev-login REST endpoint to grab a session cookie, then posts
GraphQL with it. Against production use an operator email you recognize.
"""

import argparse
import datetime as dt
import json
import sys
import time
import urllib.request

SENSORS = ("VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT")

# World minus poles (FIRMS has no fire detections over ice sheets worth storing)
WORLD_TILES = [
    {"minLat": -60.0, "minLon": -180.0, "maxLat": 75.0, "maxLon": -90.0},
    {"minLat": -60.0, "minLon": -90.0, "maxLat": 75.0, "maxLon": 0.0},
    {"minLat": -60.0, "minLon": 0.0, "maxLat": 75.0, "maxLon": 90.0},
    {"minLat": -60.0, "minLon": 90.0, "maxLat": 75.0, "maxLon": 180.0},
]

# Pilot default: Gujarat industrial belt (matches osmsync/gdeltsync defaults).
# World backfill is an explicit opt-in (--tiles world) because a full world
# pull is 200k+ points/day and must only run with RDS + retention in place.
PILOT_BBOX = {"minLat": 22.0, "minLon": 69.5, "maxLat": 23.0, "maxLon": 70.5}

WINDOW_DAYS = 5  # must stay <= FIRMS_MAX_DAY_RANGE in ai/python/app.py (API rejects [6..])

MUTATION = """
mutation Ingest($bbox: BoundingBox!, $from: String!, $to: String!, $source: String) {
  ingestFirms(bbox: $bbox, dateFrom: $from, dateTo: $to, source: $source)
}
"""


def login(api: str, email: str) -> str:
    """Dev-login, returns the raw Cookie header value for subsequent calls."""
    req = urllib.request.Request(
        f"{api}/api/auth/dev-login",
        data=json.dumps({"email": email}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        cookie = resp.headers.get("Set-Cookie", "").split(";")[0]
        if not cookie:
            raise RuntimeError("dev-login returned no Set-Cookie")
        return cookie


def ingest(api: str, cookie: str, bbox: dict, date_from: str, date_to: str, source: str) -> int:
    body = json.dumps(
        {
            "query": MUTATION,
            "variables": {
                "bbox": bbox,
                "from": date_from,
                "to": date_to,
                "source": source,
            },
        }
    ).encode()
    req = urllib.request.Request(
        f"{api}/api/graphql",
        data=body,
        headers={"Content-Type": "application/json", "Cookie": cookie},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=600) as resp:
        payload = json.load(resp)
    if payload.get("errors"):
        raise RuntimeError(f"graphql errors: {payload['errors']}")
    return int(payload["data"]["ingestFirms"])


def windows(date_from: dt.date, date_to: dt.date):
    cur = date_from
    while cur <= date_to:
        end = min(cur + dt.timedelta(days=WINDOW_DAYS - 1), date_to)
        yield cur.isoformat(), end.isoformat()
        cur = end + dt.timedelta(days=1)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("--email", default="backfill@operator.local")
    ap.add_argument("--from", dest="date_from", required=True)
    ap.add_argument("--to", dest="date_to", required=True)
    ap.add_argument("--sensors", default="VIIRS_SNPP_NRT")
    ap.add_argument("--tiles", default="pilot", choices=("pilot", "world"),
                    help="pilot=Gujarat bbox (safe default), world=4 tiles (needs RDS+retention)")
    ap.add_argument("--bbox", default="",
                    help="override bbox as minLat,minLon,maxLat,maxLon (single tile)")
    ap.add_argument("--sleep", type=float, default=5.0, help="seconds between calls (FIRMS quota)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    date_from = dt.date.fromisoformat(args.date_from)
    date_to = dt.date.fromisoformat(args.date_to)
    sensors = [s.strip() for s in args.sensors.split(",") if s.strip()]
    bad = [s for s in sensors if s not in SENSORS]
    if bad:
        print(f"unknown sensors: {bad} (want {SENSORS})", file=sys.stderr)
        return 1
    if args.bbox:
        try:
            a, o, b, c = (float(x) for x in args.bbox.split(","))
            tiles = [{"minLat": a, "minLon": o, "maxLat": b, "maxLon": c}]
        except ValueError:
            print("--bbox must be minLat,minLon,maxLat,maxLon", file=sys.stderr)
            return 1
    elif args.tiles == "world":
        tiles = WORLD_TILES
    else:
        tiles = [PILOT_BBOX]

    plan = [(s, b, w0, w1) for s in sensors for b in tiles for (w0, w1) in windows(date_from, date_to)]
    print(f"{len(plan)} calls: {len(sensors)} sensors x {len(tiles)} tiles x {len(list(windows(date_from, date_to)))} windows")
    if args.dry_run:
        for s, b, w0, w1 in plan[:5]:
            print(f"  DRY {s} {w0}..{w1} bbox={b}")
        if len(plan) > 5:
            print(f"  ... and {len(plan) - 5} more")
        return 0

    cookie = login(args.api.rstrip("/"), args.email)
    total, failed = 0, 0
    for i, (sensor, bbox, w0, w1) in enumerate(plan, 1):
        try:
            n = ingest(args.api.rstrip("/"), cookie, bbox, w0, w1, sensor)
            total += n
            print(f"[{i}/{len(plan)}] {sensor} {w0}..{w1} tile {bbox['minLon']}..{bbox['maxLon']}: {n} pts (total {total})")
        except Exception as e:  # noqa: BLE001 - keep going, resume by narrowing --from
            failed += 1
            print(f"[{i}/{len(plan)}] {sensor} {w0}..{w1} FAILED: {e}", file=sys.stderr)
        time.sleep(args.sleep)
    print(f"done: {total} points ingested, {failed} failed windows (re-run with narrowed --from to resume)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
