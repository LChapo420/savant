"""Maia-2 move predictions as a long-running worker, for services/chess-maia.js.

Maia-2 (CSSLab, MIT licence: https://github.com/CSSLab/maia2) predicts the move
a human of a given rating would play. This worker loads the model once and then
answers one JSON request per line on stdin:

    {"id": 1, "fen": "...", "elo_self": 1500, "elo_oppo": 1500, "type": "rapid"}
 -> {"id": 1, "moves": {"e2e4": 0.41, ...}, "win_prob": 0.53, "ms": 7.1}

It never downloads anything: the weights must already be in MAIA2_MODELS
(rapid_model.pt / blitz_model.pt, fetched once by the owner with maia2's own
downloader). Device: MAIA2_DEVICE (auto | cpu | cuda); auto takes the GPU when
torch sees one. Run with python -I.
"""
import json
import os
import sys
import time
from importlib.resources import as_file, files

import torch
from maia2.inference import inference_each, prepare
from maia2.main import MAIA2Model
from maia2.train import load_model_state_dict, resolve_device
from maia2.utils import create_elo_dict, get_all_possible_moves, parse_args

MODELS = os.environ.get("MAIA2_MODELS", "")
DEVICE = resolve_device(os.environ.get("MAIA2_DEVICE", "auto"))
torch.set_num_threads(int(os.environ.get("MAIA2_THREADS", "2")))

_loaded = {}


def model_for(kind):
    if kind not in ("rapid", "blitz"):
        kind = "rapid"
    if kind in _loaded:
        return _loaded[kind]
    path = os.path.join(MODELS, f"{kind}_model.pt")
    if not os.path.exists(path):
        raise FileNotFoundError(f"Maia-2 {kind} weights not found at {path}")
    with as_file(files("maia2.configs").joinpath("maia2-training.yaml")) as cfg_path:
        cfg = parse_args(cfg_path)
    model = MAIA2Model(len(get_all_possible_moves()), create_elo_dict(), cfg)
    checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    load_model_state_dict(model, checkpoint["model_state_dict"])
    model = model.to(DEVICE)
    model.eval()
    _loaded[kind] = model
    return model


PREPARED = prepare()


def main():
    print(json.dumps({"ready": True, "device": str(DEVICE)}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        out = {}
        try:
            req = json.loads(line)
            out["id"] = req.get("id")
            t0 = time.perf_counter()
            model = model_for(req.get("type", "rapid"))
            moves, win = inference_each(model, PREPARED, req["fen"], int(req.get("elo_self", 1500)), int(req.get("elo_oppo", 1500)))
            out.update({"moves": moves, "win_prob": win, "ms": round((time.perf_counter() - t0) * 1000, 2)})
        except Exception as e:  # one bad request must not stop the worker
            out["error"] = str(e)[:300]
        print(json.dumps(out), flush=True)


if __name__ == "__main__":
    main()
