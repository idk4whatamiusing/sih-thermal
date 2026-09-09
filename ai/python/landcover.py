"""ESA WorldCover 10m landcover lookup via remote partial (COG) reads.

No local tile download: rasterio's /vsicurl/ driver range-reads only the
pixels needed for a point sample, straight from the public ESA S3 bucket.
Datasets are cached per-tile-per-process since opening incurs a header read.

Class codes (ESA WorldCover v200): 10 tree cover, 20 shrubland, 30 grassland,
40 cropland, 50 built-up, 60 bare/sparse vegetation, 70 snow/ice, 80 water,
90 herbaceous wetland, 95 mangroves, 100 moss/lichen.
"""

import logging
import threading

import rasterio

logger = logging.getLogger("landcover")

_BASE_URL = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map"
_lock = threading.Lock()
_datasets: dict[str, rasterio.DatasetReader | None] = {}


def _tile_name(lat: float, lon: float) -> str:
    tile_lat = int(lat // 3) * 3
    tile_lon = int(lon // 3) * 3
    ns = f"N{tile_lat:02d}" if tile_lat >= 0 else f"S{-tile_lat:02d}"
    ew = f"E{tile_lon:03d}" if tile_lon >= 0 else f"W{-tile_lon:03d}"
    return f"{ns}{ew}"


def _dataset_for(tile: str) -> rasterio.DatasetReader | None:
    with _lock:
        if tile in _datasets:
            return _datasets[tile]
        url = f"/vsicurl/{_BASE_URL}/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif"
        try:
            ds = rasterio.open(url)
        except Exception as e:  # tile doesn't exist (e.g. over open ocean) or network error
            logger.warning("landcover tile %s unavailable: %s", tile, e)
            ds = None
        _datasets[tile] = ds
        return ds


def sample_landcover(lat: float, lon: float) -> int | None:
    """Returns the ESA WorldCover class code at (lat, lon), or None if unavailable."""
    tile = _tile_name(lat, lon)
    ds = _dataset_for(tile)
    if ds is None:
        return None
    try:
        val = next(ds.sample([(lon, lat)]))[0]
        return int(val) if val else None
    except Exception as e:
        logger.warning("landcover sample failed at (%s,%s): %s", lat, lon, e)
        return None
