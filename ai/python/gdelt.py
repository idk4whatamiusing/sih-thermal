"""GDELT 2.0 DOC API weak-labeling for thermal_clusters.

This is an INDEPENDENT signal, deliberately not derived from the FIRMS
heuristic - the whole point is to avoid training on labels the model itself
(or its heuristic ancestor) produced, which would just teach it to agree
with itself.

Honest limitation, confirmed empirically during development (not just a
theoretical concern): the public GDELT DOC 2.0 API has no raw lat/lon bbox
filter, and its `sourcecountry:<FIPS>` operator filters on the PUBLISHER's
country, not the story's subject location. Querying sourcecountry:IN for a
cluster in Gujarat returned an Indian outlet's story about a wildfire in
Greece - a real example hit during testing, not a hypothetical. So this is
a much weaker proxy than "articles about fires near this cluster": it is
closer to "did a locally-based publication mention fire/industrial keywords
in this time window", which can and does surface geographically unrelated
matches. Confidence is capped low (<=0.7) specifically because of this, and
these labels are meant to be one weak, independently-sourced signal among
several during training - never treated as ground truth. A more precise
follow-up would use the GKG API's V2Locations field (has real coordinates)
instead of DOC's sourcecountry, but that's a larger separate change.
"""

import logging
import time
from datetime import datetime
from typing import Optional

import httpx

logger = logging.getLogger("gdelt")

_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc"
_NOMINATIM = "https://nominatim.openstreetmap.org/reverse"

# ISO 3166-1 alpha-2 -> FIPS 10-4 (GDELT's sourcecountry vocabulary).
# Deliberately small - covers the pilot regions this project targets plus
# other major economies. Countries not listed fall back to an unfiltered
# (country-agnostic) query rather than guessing.
_ISO_TO_FIPS = {
    "in": "IN", "us": "US", "cn": "CH", "id": "ID", "br": "BR", "ru": "RS",
    "au": "AS", "ca": "CA", "za": "SF", "cd": "CG", "ng": "NI", "sa": "SA",
    "de": "GM", "gb": "UK", "fr": "FR", "mx": "MX", "ar": "AR", "vn": "VM",
    "th": "TH", "mm": "BM", "kz": "KZ", "ir": "IR", "iq": "IZ", "eg": "EG",
    "cl": "CI", "co": "CO", "pe": "PE", "ve": "VE", "ph": "RP", "my": "MY",
}

INDUSTRIAL_KEYWORDS = ["refinery", "factory", "plant", "industrial", "warehouse",
                        "chemical", "explosion", "gas leak", "flare", "smelter", "mill"]
NATURAL_KEYWORDS = ["wildfire", "forest fire", "bushfire", "grassland fire",
                     "brush fire", "wild fire"]


def _fips_country(lat: float, lon: float) -> Optional[str]:
    time.sleep(1.1)  # Nominatim usage policy: max 1 req/s
    try:
        resp = httpx.get(_NOMINATIM, params={"format": "json", "lat": lat, "lon": lon, "zoom": 3},
                          headers={"User-Agent": "orbis-gdeltsync/0.1 (PS162 SIH2026)"}, timeout=10)
        resp.raise_for_status()
        iso2 = resp.json().get("address", {}).get("country_code", "")
        return _ISO_TO_FIPS.get(iso2.lower())
    except Exception as e:
        logger.warning("reverse geocode failed for (%s,%s): %s", lat, lon, e)
        return None


def _classify_title(title: str) -> Optional[str]:
    t = title.lower()
    if any(k in t for k in INDUSTRIAL_KEYWORDS):
        return "industrial_flare"
    if any(k in t for k in NATURAL_KEYWORDS):
        return "forest"
    return None


class GdeltLabel(dict):
    """label, confidence, matched_article_url, matched_article_title"""


def label_from_gdelt(lat: float, lon: float, date_from: str, date_to: str) -> Optional[GdeltLabel]:
    fips = _fips_country(lat, lon)
    query = "(fire OR wildfire OR explosion OR blaze)"
    if fips:
        query += f" sourcecountry:{fips}"

    def _dt(d: str, end: bool) -> str:
        dt = datetime.strptime(d, "%Y-%m-%d")
        return dt.strftime("%Y%m%d") + ("235959" if end else "000000")

    params = {
        "query": query, "mode": "ArtList", "format": "json", "maxrecords": 10,
        "startdatetime": _dt(date_from, False), "enddatetime": _dt(date_to, True),
    }
    try:
        resp = httpx.get(_DOC_API, params=params, timeout=15)
        if resp.status_code == 429:  # burst quota: back off once, then give up gracefully
            time.sleep(15)
            resp = httpx.get(_DOC_API, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.warning("gdelt query failed: %s", e)
        return None

    articles = data.get("articles", []) if isinstance(data, dict) else []
    matches = 0
    best = None
    for art in articles:
        label = _classify_title(art.get("title", ""))
        if label is None:
            continue
        matches += 1
        if best is None:
            best = (label, art.get("url", ""), art.get("title", ""))
    if best is None:
        return None
    confidence = min(0.7, 0.4 + 0.1 * min(matches, 3))  # capped - this is a WEAK label, never high-confidence
    return GdeltLabel(label=best[0], confidence=round(confidence, 2),
                       matched_article_url=best[1], matched_article_title=best[2])
