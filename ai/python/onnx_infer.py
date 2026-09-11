"""ONNX serving loader for the FIRMS classifier (issue #21).

Loads ai/models/firms_classifier.onnx (exported by train/train_transformer.py
from REAL labeled data) via onnxruntime CPU. The model file is deliberately
absent until the world backfill (#20) produces >=50 labeled clusters - until
then load() returns None and callers fall back to the heuristic in app.py.

Single-point limitation: the model is trained on per-CLUSTER sequences
(MAX_SEQ_LEN x 5 + 9 static, see train/schema.py) but /firms/predict classifies
one POINT at a time (no cluster context yet). Serving therefore builds a
degenerate length-1 sequence from the point's own features. This is
mechanically valid but weaker than full-sequence inference; the follow-up once
backfill lands is a cluster-level reclassification pass using real sequences
from build_dataset.build_sample. Do NOT tune blends around this - replace it.
"""

import json
import os

MODEL_REL = os.path.join("models", "firms_classifier.onnx")
LABELS_REL = os.path.join("models", "firms_classifier_labels.json")

MAX_SEQ_LEN = 16
SEQ_DIM = 5
STATIC_DIM = 9

INDUSTRIAL = ("industrial_flare", "thermal_power")


def _model_path() -> str:
    override = os.getenv("FIRMS_ONNX_PATH", "").strip()
    if override:
        return override
    here = os.path.dirname(os.path.abspath(__file__))
    # ai/python/onnx_infer.py -> ai/models/firms_classifier.onnx
    return os.path.join(os.path.dirname(here), MODEL_REL)


def _norm_frp(v) -> float:
    return min(1.0, (v or 0.0) / 200.0)  # canonical: train/schema.py


def _norm_temp(v) -> float:
    return min(1.0, max(0.0, ((v or 0.0) - 270.0) / 130.0))  # canonical: train/schema.py


def _norm_dist(v) -> float:
    if v is None:
        return 1.0
    return min(1.0, v / 20000.0)  # canonical: train/schema.py


class OnnxClassifier:
    """Lazily-loaded singleton. None-able: missing file or broken runtime
    must NEVER take down /firms/predict - the heuristic is the fallback."""

    _instance = None

    def __init__(self, path: str):
        import onnxruntime as ort  # deferred: sidecar must boot without it

        self.session = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        labels_path = path.replace(".onnx", "_labels.json")
        if os.path.exists(labels_path):
            with open(labels_path) as f:
                self.labels = json.load(f)
        else:
            self.labels = ["industrial_flare", "thermal_power", "mining", "forest", "agriculture", "unknown"]

    @classmethod
    def get(cls):
        if cls._instance is None:
            path = _model_path()
            if not os.path.exists(path):
                return None
            try:
                cls._instance = cls(path)
            except Exception:
                return None
        return cls._instance

    def predict_sequence(self, seq, seq_mask, static):
        """Full-sequence inference (cluster reclassification path). Inputs are
        plain nested lists in build_dataset.build_sample shape; validated here
        so malformed callers get an exception, never a silent mis-score."""
        import numpy as np

        seq_a = np.asarray(seq, dtype=np.float32)
        mask_a = np.asarray(seq_mask, dtype=bool)
        static_a = np.asarray(static, dtype=np.float32)
        if seq_a.shape != (MAX_SEQ_LEN, SEQ_DIM):
            raise ValueError(f"seq must be {MAX_SEQ_LEN}x{SEQ_DIM}, got {seq_a.shape}")
        if mask_a.shape != (MAX_SEQ_LEN,):
            raise ValueError(f"seq_mask must be ({MAX_SEQ_LEN},), got {mask_a.shape}")
        if static_a.shape != (STATIC_DIM,):
            raise ValueError(f"static must be ({STATIC_DIM},), got {static_a.shape}")

        (logits,) = self.session.run(
            ["logits"],
            {"seq": seq_a.reshape(1, MAX_SEQ_LEN, SEQ_DIM),
             "seq_mask": mask_a.reshape(1, MAX_SEQ_LEN),
             "static": static_a.reshape(1, STATIC_DIM)},
        )
        exps = np.exp(logits[0] - logits[0].max())
        probs = exps / exps.sum()
        best = int(probs.argmax())
        industrial_prob = float(sum(probs[self.labels.index(c)] for c in INDUSTRIAL if c in self.labels))
        return self.labels[best], round(industrial_prob, 3)

    def predict_point(self, frp=None, bright_ti4=None, bright_ti5=None,
                      dist_industrial_m=None, inside_industrial=False,
                      persistence: float = 0.0):
        """Degenerate single-point inference (see module docstring). Returns
        (predicted_class, industrial_prob) or raises on inference failure."""
        import numpy as np

        seq = np.zeros((MAX_SEQ_LEN, SEQ_DIM), dtype=np.float32)
        seq[0] = [_norm_frp(frp), _norm_temp(bright_ti4), _norm_temp(bright_ti5),
                  _norm_dist(dist_industrial_m), 0.0]
        mask = np.ones((MAX_SEQ_LEN,), dtype=bool)
        mask[0] = False  # False = real step, True = padding (train/schema convention)
        static = np.zeros((STATIC_DIM,), dtype=np.float32)
        static[0] = min(1.0, 1.0 / 50.0)  # count = 1 point
        static[1] = _norm_frp(frp)  # avg_frp
        static[2] = _norm_frp(frp)  # max_frp
        static[3] = persistence or 0.0
        static[5] = _norm_dist(dist_industrial_m)  # mean dist
        static[6] = 1.0 if inside_industrial else 0.0  # frac inside
        return self.predict_sequence(seq.tolist(), mask.tolist(), static.tolist())


def use_onnx() -> bool:
    return os.getenv("USE_ONNX", "0").strip() == "1"
