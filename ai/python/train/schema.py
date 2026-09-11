"""Shared feature schema for the FIRMS classifier - used by build_dataset.py
(real Postgres data), train_transformer.py (training), smoke_test.py
(synthetic pipeline verification), and eventually the ONNX inference loader
in app.py. Keeping this in one place means all four stay in sync.
"""

MAX_SEQ_LEN = 16  # per-cluster point history, padded/truncated to this length
SEQ_FEATURE_DIM = 5  # [frp, bright_ti4, bright_ti5, dist_industrial_m, days_since_first_seen] (normalized)
STATIC_FEATURE_DIM = 9  # count, avg_frp, max_frp, persistence, duration_days, mean_dist_industrial_m, frac_inside_industrial, month_sin, month_cos

# No per-location ID embedding anywhere in these features - the model must
# generalize to locations it has never seen, using only content features.

LABELS = ["industrial_flare", "thermal_power", "mining", "forest", "agriculture", "unknown"]
LABEL_TO_IDX = {l: i for i, l in enumerate(LABELS)}

# Independently-sourced labels (gdelt) are weighted higher than
# model-generated ones (ai_worker, added in Phase 3) to avoid an
# echo-chamber feedback loop where the model just re-confirms itself.
# Expert hand labels (human) outrank all: direct annotation, high confidence.
SOURCE_WEIGHT = {"gdelt": 1.0, "ai_worker": 0.3, "human": 1.5}


def normalize_frp(v: float) -> float:
    return min(1.0, (v or 0.0) / 200.0)  # FRP rarely exceeds ~200 MW in this dataset's range


def normalize_temp(v: float) -> float:
    return min(1.0, max(0.0, ((v or 0.0) - 270.0) / 130.0))  # ~270-400K observed VIIRS range


def normalize_dist(v: float) -> float:
    if v is None:
        return 1.0  # unknown distance treated as "far"
    return min(1.0, v / 20000.0)  # cap at 20km
