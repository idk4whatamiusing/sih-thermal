"""Trains FirmsClassifier on a dataset produced by build_dataset.py, then
exports to ONNX for CPU inference in the serving sidecar (onnxruntime -
no torch dependency needed at serving time, important for the
memory-constrained t3.micro).

Usage:
    python train_transformer.py --data data/dataset.jsonl --out ../models/firms_classifier.onnx
"""

import argparse
import json
import os
import sys

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset

sys.path.insert(0, os.path.dirname(__file__))
from model import FirmsClassifier
from schema import LABEL_TO_IDX, LABELS, MAX_SEQ_LEN, SEQ_FEATURE_DIM, STATIC_FEATURE_DIM


class FirmsDataset(Dataset):
    def __init__(self, samples: list[dict]):
        self.samples = samples

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, i):
        s = self.samples[i]
        return (
            torch.tensor(s["seq"], dtype=torch.float32),
            torch.tensor(s["seq_mask"], dtype=torch.bool),
            torch.tensor(s["static"], dtype=torch.float32),
            torch.tensor(LABEL_TO_IDX.get(s["label"], LABEL_TO_IDX["unknown"]), dtype=torch.long),
            torch.tensor(s["weight"], dtype=torch.float32),
        )


def load_samples(path: str) -> list[dict]:
    samples = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                samples.append(json.loads(line))
    return samples


def train(samples: list[dict], epochs: int = 20, lr: float = 1e-3, seed: int = 0) -> FirmsClassifier:
    """Trains and returns a FirmsClassifier. Pulled out of main() so
    smoke_test.py can exercise the identical training path on synthetic data."""
    torch.manual_seed(seed)
    model = FirmsClassifier()
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.CrossEntropyLoss(reduction="none")
    loader = DataLoader(FirmsDataset(samples), batch_size=min(16, len(samples)), shuffle=True)

    model.train()
    for epoch in range(epochs):
        total_loss = 0.0
        for seq, seq_mask, static, label, weight in loader:
            opt.zero_grad()
            logits = model(seq, seq_mask, static)
            per_sample = loss_fn(logits, label)
            loss = (per_sample * weight).mean()
            loss.backward()
            opt.step()
            total_loss += loss.item()
        if epoch % 5 == 0 or epoch == epochs - 1:
            print(f"epoch {epoch}: loss={total_loss / len(loader):.4f}")
    return model


def export_onnx(model: FirmsClassifier, out_path: str):
    model.eval()
    dummy_seq = torch.zeros(1, MAX_SEQ_LEN, SEQ_FEATURE_DIM)
    dummy_mask = torch.zeros(1, MAX_SEQ_LEN, dtype=torch.bool)
    dummy_static = torch.zeros(1, STATIC_FEATURE_DIM)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    torch.onnx.export(
        model, (dummy_seq, dummy_mask, dummy_static), out_path,
        input_names=["seq", "seq_mask", "static"], output_names=["logits"],
        dynamic_axes={"seq": {0: "batch"}, "seq_mask": {0: "batch"}, "static": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=18,
    )
    with open(out_path.replace(".onnx", "_labels.json"), "w") as f:
        json.dump(LABELS, f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(os.path.dirname(__file__), "data", "dataset.jsonl"))
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "models", "firms_classifier.onnx"))
    ap.add_argument("--epochs", type=int, default=20)
    ap.add_argument("--min-samples", type=int, default=50,
                     help="refuse to train below this many samples - too few to be meaningful")
    args = ap.parse_args()

    if not os.path.exists(args.data):
        print(f"{args.data} does not exist - run build_dataset.py first", file=sys.stderr)
        sys.exit(1)
    samples = load_samples(args.data)
    if len(samples) < args.min_samples:
        print(f"only {len(samples)} samples (need >= {args.min_samples}). Refusing to train a model "
              f"on this little data and calling it done - that would just memorize noise. "
              f"Run more ingestion/labeling first, or pass --min-samples to override for a smoke test.",
              file=sys.stderr)
        sys.exit(1)

    model = train(samples, epochs=args.epochs)
    export_onnx(model, args.out)
    print(f"exported {args.out}")


if __name__ == "__main__":
    main()
