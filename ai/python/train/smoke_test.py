"""Pipeline smoke test - NOT real training. Generates synthetic samples
through the exact same schema/Dataset/model code as real training, runs a
few epochs, exports ONNX, reloads via onnxruntime, and runs one inference.

This exists because there isn't enough real labeled data yet to actually
train a meaningful model (see build_dataset.py's docstring - clustering
isn't wired into ingestion, so real firms_points aren't cluster_id-tagged
yet). This script proves the mechanical pipeline (feature schema -> model
-> ONNX export -> onnxruntime inference) works correctly, so that once
real data exists, train_transformer.py is known-good rather than untested.

Writes nothing outside ai/python/train/scratch/ (gitignored). Never writes
to ai/python/models/ - that path is reserved for a real trained checkpoint.
"""

import os
import random
import sys

import onnxruntime as ort

sys.path.insert(0, os.path.dirname(__file__))
from schema import LABELS, MAX_SEQ_LEN, STATIC_FEATURE_DIM
from train_transformer import export_onnx, train


def synthetic_samples(n: int = 200, seed: int = 0) -> list[dict]:
    rng = random.Random(seed)
    samples = []
    for _ in range(n):
        label = rng.choice(LABELS)
        # give industrial classes a high-FRP, low-distance signature and
        # natural classes a low-FRP, far-distance signature, so the smoke
        # test can sanity-check that the model actually learns SOMETHING
        # rather than just checking that the code runs without crashing.
        industrial = label in ("industrial_flare", "thermal_power")
        frp_base = rng.uniform(0.5, 0.9) if industrial else rng.uniform(0.05, 0.3)
        dist_base = rng.uniform(0.0, 0.2) if industrial else rng.uniform(0.5, 1.0)
        seq_len = rng.randint(3, MAX_SEQ_LEN)
        seq = [[
            max(0.0, min(1.0, frp_base + rng.uniform(-0.1, 0.1))),
            max(0.0, min(1.0, frp_base + rng.uniform(-0.1, 0.1))),
            max(0.0, min(1.0, frp_base + rng.uniform(-0.1, 0.1))),
            max(0.0, min(1.0, dist_base + rng.uniform(-0.05, 0.05))),
            i / MAX_SEQ_LEN,
        ] for i in range(seq_len)]
        seq_mask = [False] * seq_len + [True] * (MAX_SEQ_LEN - seq_len)
        seq += [[0.0] * 5] * (MAX_SEQ_LEN - seq_len)
        static = [rng.uniform(0, 1) for _ in range(STATIC_FEATURE_DIM)]
        static[1] = frp_base
        static[5] = dist_base
        samples.append({"seq": seq, "seq_mask": seq_mask, "static": static, "label": label, "weight": 1.0})
    return samples


def main():
    print("=== SMOKE TEST: synthetic data, NOT a real trained model ===")
    samples = synthetic_samples(200)
    train_set, test_set = samples[:160], samples[160:]

    model = train(train_set, epochs=15)

    scratch_dir = os.path.join(os.path.dirname(__file__), "scratch")
    os.makedirs(scratch_dir, exist_ok=True)
    onnx_path = os.path.join(scratch_dir, "smoke_test_model.onnx")
    export_onnx(model, onnx_path)
    print(f"exported smoke-test ONNX to {onnx_path} (scratch/, not committed)")

    INDUSTRIAL = {"industrial_flare", "thermal_power"}

    sess = ort.InferenceSession(onnx_path)
    exact_correct, group_correct = 0, 0
    for s in test_set:
        out = sess.run(["logits"], {
            "seq": [s["seq"]], "seq_mask": [s["seq_mask"]], "static": [s["static"]],
        })
        pred = LABELS[out[0][0].argmax()]
        if pred == s["label"]:
            exact_correct += 1
        if (pred in INDUSTRIAL) == (s["label"] in INDUSTRIAL):
            group_correct += 1
    exact_acc = exact_correct / len(test_set)
    group_acc = group_correct / len(test_set)
    print(f"onnxruntime inference on {len(test_set)} held-out synthetic samples: "
          f"{exact_acc:.0%} exact-label accuracy, {group_acc:.0%} industrial-vs-natural accuracy")
    print("(this only proves the pipeline is mechanically correct - it says nothing about "
          "real-world performance, which needs real labeled data)")

    # exact_acc has a real ceiling well below 100% here: the synthetic
    # generator only encodes an industrial-vs-natural signal, not a
    # distinguishing signal between the 3 sub-labels within each family
    # (e.g. industrial_flare vs thermal_power look identical to the model
    # in this synthetic data), so group_acc is the metric that actually
    # reflects whether the pipeline learned anything real.
    if group_acc < 0.75:
        print("FAIL: industrial-vs-natural accuracy is barely above chance (50%) on an "
              "easy synthetic task with a real feature-space signal built in - something "
              "in the pipeline is broken, not just under-trained", file=sys.stderr)
        sys.exit(1)
    print("PASS: pipeline is mechanically sound")


if __name__ == "__main__":
    main()
