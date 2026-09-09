"""PS162 Python sidecar — FIRMS thermal classifier + legacy RAG stubs.

Replaces RAG with:
  POST /firms/predict  {lat, lon, frp, bright_ti4, ...} -> {predicted_class, industrial_prob, persistence}
  POST /firms/ingest   {bbox, date_from, date_to} -> ingests FIRMS CSV (requires FIRMS_MAP_KEY)
  POST /firms/cluster  {points: [...]}  -> DBSCAN persistence scoring
  GET  /health

Legacy stubs kept so Go Rag client + existing resolvers don't 404 during cutover:
  /retrieve, /ingest, /cache_lookup, /cache_store -> no-op
"""

import csv
import hashlib
import io
import json
import math
import os
import time
from datetime import date
from typing import Optional

import httpx
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel

import landcover

app = FastAPI(title="ai-rag-ps162", version="0.3.0")

# --- keep legacy RAG models for stub compat ---
class Retrieve(BaseModel):
    query: str
    user_id: str = ""
    collection: str = "support"
    k: int = 5

class Ingest(BaseModel):
    documents: list[str]
    collection: str = "support"

class CacheLookup(BaseModel):
    kind: str
    user_id: str
    text: str
    threshold: float = 0.92

class CacheStore(BaseModel):
    kind: str
    user_id: str
    text: str
    answer: str
    sources_hash: str = ""

# --- PS162 models ---
class FirmsPredictRequest(BaseModel):
    lat: float
    lon: float
    frp: Optional[float] = None
    bright_ti4: Optional[float] = None
    bright_ti5: Optional[float] = None
    confidence: Optional[str] = None
    satellite: Optional[str] = None
    # enrichment hints (optional, from PostGIS join)
    dist_industrial_m: Optional[float] = None
    inside_industrial: Optional[bool] = None
    persistence: Optional[float] = None  # 0..1
    landcover: Optional[int] = None

class FirmsPredictReply(BaseModel):
    predicted_class: str
    industrial_prob: float
    persistence: float
    reasons: list[str]
    landcover: Optional[int] = None  # the value actually used (supplied or auto-sampled)

class FirmsClusterPoint(BaseModel):
    lat: float
    lon: float
    frp: Optional[float] = None

class FirmsClusterRequest(BaseModel):
    points: list[FirmsClusterPoint]
    eps_m: float = 1000  # DBSCAN eps in meters approx
    min_samples: int = 3
    window_days: int = 30

class IngestFirmsRequest(BaseModel):
    min_lat: float
    min_lon: float
    max_lat: float
    max_lon: float
    date_from: str = ""  # YYYY-MM-DD, "" = today
    date_to: str = ""    # YYYY-MM-DD, "" = today

class FirmsRawPoint(BaseModel):
    lat: float
    lon: float
    acq_date: str
    acq_time: str = ""
    bright_ti4: Optional[float] = None
    bright_ti5: Optional[float] = None
    frp: Optional[float] = None
    confidence: Optional[str] = None
    satellite: Optional[str] = None
    scan: Optional[float] = None
    track: Optional[float] = None

class IngestFirmsReply(BaseModel):
    ok: bool
    error: str = ""
    points: list[FirmsRawPoint] = []

# --- helpers ---
def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return 2*R*math.asin(math.sqrt(a))

@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-rag-ps162"}

# --- PS162: heuristic classifier (XGBoost placeholder) ---
@app.post("/firms/predict")
async def firms_predict(req: FirmsPredictRequest):
    reasons = []
    score = 0.0  # industrial_prob 0..1

    # landcover enrichment: if the caller didn't supply it, sample it
    # ourselves from ESA WorldCover (remote COG partial read, no full
    # tile download). Best-effort - leave it unset on any failure.
    if req.landcover is None:
        try:
            req.landcover = landcover.sample_landcover(req.lat, req.lon)
        except Exception:
            pass

    # persistence is strongest signal
    pers = req.persistence if req.persistence is not None else 0.0
    if pers > 0.3:
        score += 0.4
        reasons.append(f"persistence={pers:.2f}>0.3")
    if req.inside_industrial:
        score += 0.35
        reasons.append("inside OSM industrial polygon")
    elif req.dist_industrial_m is not None:
        if req.dist_industrial_m < 500:
            score += 0.3
            reasons.append(f"dist_industrial={req.dist_industrial_m:.0f}m<500")
        elif req.dist_industrial_m < 2000:
            score += 0.15
            reasons.append(f"dist_industrial={req.dist_industrial_m:.0f}m<2000")
        else:
            reasons.append(f"dist_industrial={req.dist_industrial_m:.0f}m far")
    # FRP magnitude — industrial flares moderate-high
    if req.frp is not None:
        if 10 <= req.frp <= 80:
            score += 0.1
            reasons.append(f"frp={req.frp:.1f} in industrial band")
        elif req.frp and req.frp > 80:
            score += 0.05
            reasons.append(f"frp={req.frp:.1f} high")
    # landcover — forest vs industrial
    if req.landcover is not None:
        # ESA WorldCover: 10=Tree cover, 40=Cropland; industrial is 50=Built-up
        if req.landcover == 50:
            score += 0.1
            reasons.append("landcover=built-up")
        elif req.landcover == 10:
            score -= 0.2
            reasons.append("landcover=forest")
    # clamp
    score = max(0.0, min(1.0, score))
    # threshold 0.45 -> industrial (tuned to keep precision high)
    if score >= 0.45:
        # split industrial subtypes: flare if high temp
        if req.bright_ti4 and req.bright_ti4 > 360:
            clazz = "industrial_flare"
        else:
            clazz = "thermal_power"
    elif score >= 0.25:
        clazz = "unknown"
    else:
        # fallback to natural — simple landcover rule
        if req.landcover == 10:
            clazz = "forest"
        elif req.landcover == 40:
            clazz = "agriculture"
        else:
            clazz = "forest" if (pers < 0.1) else "mining"
    return FirmsPredictReply(predicted_class=clazz, industrial_prob=round(score, 3), persistence=pers, reasons=reasons, landcover=req.landcover)

@app.post("/firms/cluster")
async def firms_cluster(req: FirmsClusterRequest):
    # naive DBSCAN-ish grouping by eps_m (no sklearn to keep image small)
    pts = req.points
    n = len(pts)
    visited = [False]*n
    clusters = []
    cluster_id = 0
    for i in range(n):
        if visited[i]:
            continue
        visited[i] = True
        neigh = [j for j in range(n) if haversine_m(pts[i].lat, pts[i].lon, pts[j].lat, pts[j].lon) <= req.eps_m]
        if len(neigh) < req.min_samples:
            clusters.append({"point_idx": i, "cluster": -1, "persistence": 0.0})
        else:
            cid = cluster_id; cluster_id += 1
            # expand
            stack = neigh
            members = {i}
            while stack:
                cur = stack.pop()
                if visited[cur]:
                    continue
                visited[cur] = True
                nbrs = [j for j in range(n) if haversine_m(pts[cur].lat, pts[cur].lon, pts[j].lat, pts[j].lon) <= req.eps_m]
                if len(nbrs) >= req.min_samples:
                    for nb in nbrs:
                        if not visited[nb]:
                            stack.append(nb)
                members.add(cur)
            persistence = min(1.0, len(members)/req.window_days*7)  # demo scaling
            for m in members:
                clusters.append({"point_idx": m, "cluster": cid, "persistence": round(persistence, 3)})
            # dedupe singletons already handled
    # map back
    out = [{"lat": pts[c["point_idx"]].lat, "lon": pts[c["point_idx"]].lon, "cluster": c["cluster"], "persistence": c["persistence"]} for c in clusters]
    return {"clusters": out, "n_clusters": cluster_id}

def _f(v: str | None) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None

# NASA FIRMS area API only serves NRT data going back a limited window and
# caps day_range at 10 for the NRT products (see firms.modaps.eosdis.nasa.gov/api).
FIRMS_MAX_DAY_RANGE = 10

@app.post("/firms/ingest")
async def firms_ingest(req: IngestFirmsRequest):
    key = os.getenv("FIRMS_MAP_KEY")
    if not key:
        return IngestFirmsReply(ok=False, error="FIRMS_MAP_KEY not set in .env")

    today = date.today()
    end = date.fromisoformat(req.date_to) if req.date_to else today
    start = date.fromisoformat(req.date_from) if req.date_from else end
    day_range = max(1, min(FIRMS_MAX_DAY_RANGE, (end - start).days + 1))

    bbox = f"{req.min_lon},{req.min_lat},{req.max_lon},{req.max_lat}"
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/VIIRS_SNPP_NRT/{bbox}/{day_range}/{end.isoformat()}"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)
    except Exception as e:
        return IngestFirmsReply(ok=False, error=f"FIRMS request failed: {e}")
    if resp.status_code != 200:
        return IngestFirmsReply(ok=False, error=f"FIRMS API HTTP {resp.status_code}: {resp.text[:200]}")

    text = resp.text.strip()
    # FIRMS returns 200 with a plain-text error body for bad key/params/quota
    if not text or not text[0].isalpha() or "," not in text.splitlines()[0]:
        return IngestFirmsReply(ok=False, error=f"FIRMS API error: {text[:200]}")

    points: list[FirmsRawPoint] = []
    for row in csv.DictReader(io.StringIO(text)):
        try:
            points.append(FirmsRawPoint(
                lat=float(row["latitude"]), lon=float(row["longitude"]),
                acq_date=row.get("acq_date", ""), acq_time=row.get("acq_time", ""),
                bright_ti4=_f(row.get("bright_ti4")), bright_ti5=_f(row.get("bright_ti5")),
                frp=_f(row.get("frp")), confidence=row.get("confidence"),
                satellite=row.get("satellite"), scan=_f(row.get("scan")), track=_f(row.get("track")),
            ))
        except (KeyError, ValueError):
            continue
    return IngestFirmsReply(ok=True, points=points)

# --- legacy stubs (keep 200 so Go rag client doesn't error during removal) ---
@app.post("/retrieve")
async def retrieve(body: Retrieve):
    return {"sources": []}

@app.post("/ingest")
async def ingest_legacy(body: Ingest):
    return {"chunks": 0}

@app.post("/cache_lookup")
async def cache_lookup(body: CacheLookup):
    return {"hit": False}

@app.post("/cache_store")
async def cache_store(body: CacheStore):
    return {"ok": True}
