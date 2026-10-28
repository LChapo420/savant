"""
Local fact checkers for the lesson verifier: free, on this machine.

Every claim is judged against source text ("is this claim supported by this
document?"). Two stages, as designed in the owner's "High accuracy system
research" chat (2026-10-21):

  stage 1, on the GPU, for every claim:
    FactCG-DeBERTa-v3-Large (MIT)     probability the document supports the claim
    MiniCheck-Flan-T5-Large (MIT)     the same, a different architecture
  stage 2, in RAM, for claims stage 1 doubts:
    Granite Guardian 3.3 8B Q8 (Apache-2.0)   groundedness: "yes" means NOT grounded
    HalluGuard-Qwen3-4B (Apache-2.0)          GROUNDED / HALLUCINATED_INTRINSIC / _EXTRINSIC

    POST /stage1  {"pairs": [{"doc": "...", "claim": "..."}]}  -> {"results": [{"factcg": 0.93, "minicheck": 0.88}]}
    POST /stage2  {"pairs": [...]}                             -> {"results": [{"granite": "grounded", "halluguard": "GROUNDED", "why": "..."}]}
    GET  /health

Run with the checkers' own Python (folderThing/fact-venv), isolated:
    ..\\fact-venv\\Scripts\\python.exe -I tools/fact-checkers/server.py
FACT_MODELS_DIR points at the downloaded models (default: folderThing/fact-models).
Port FACT_CHECKERS_PORT (default 6790), bound to 127.0.0.1 only.
"""
import json
import os
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(os.path.dirname(HERE))
MODELS = os.environ.get("FACT_MODELS_DIR") or os.path.join(os.path.dirname(APP), "fact-models")
PORT = int(os.environ.get("FACT_CHECKERS_PORT", "6790"))

FACTCG_DIR = os.path.join(MODELS, "yaxili96_FactCG-DeBERTa-v3-Large")
MINICHECK_DIR = os.path.join(MODELS, "lytang_MiniCheck-Flan-T5-Large")
GRANITE_GGUF = os.path.join(MODELS, "ibm-granite_granite-guardian-3.3-8b-GGUF", "granite-guardian-3.3-8b-Q8_0.gguf")
GRANITE_TOKENIZER = os.path.join(MODELS, "ibm-granite_granite-guardian-3.3-8b-tokenizer")
HALLUGUARD_GGUF = os.path.join(MODELS, "lrsbrgrn_HalluGuard-Qwen3-4B-GGUF", "HalluGuard-Qwen3-4B.gguf")

# FactCG's own prompt (github.com/derenlei/FactCG, factcg/utils.py).
FACTCG_TEMPLATE = "{text_a}\n\nChoose your answer: based on the paragraph above can we conclude that \"{text_b}\"?\n\nOPTIONS:\n- Yes\n- No\nI think the answer is "

# HalluGuard's own prompt (its model card).
HALLUGUARD_INSTRUCTIONS = [
    "You will be given a document and a claim.",
    "Decide whether the claim is 'GROUNDED', 'HALLUCINATED_INTRINSIC', or 'HALLUCINATED_EXTRINSIC' based ONLY on the document.",
    "Definitions:",
    "  - GROUNDED: The claim is fully supported by the document. All relevant parts are directly verifiable from the document.",
    "  - HALLUCINATED_INTRINSIC: The claim contradicts what the document states or clearly implies.",
    "  - HALLUCINATED_EXTRINSIC: The claim includes information that is not stated or implied in the document and cannot be verified using only the document (it requires external knowledge).",
    "Justification requirements:",
    "  - Your justification MUST be evidence-grounded.",
    "  - Explicitly refer to the relevant parts of the document (by quoting or paraphrasing them).",
    "  - Explain how these parts SUPPORT, CONTRADICT, or FAIL TO SUPPORT the claim.",
    "  - Do NOT use any external knowledge; rely only on the provided document.",
    "Answer format (VERY IMPORTANT):",
    "  - You MUST respond using EXACTLY the following XML structure:",
    "    <answer>",
    "      <classification>CATEGORY</classification>",
    "      <justification>Your reasoning here</justification>",
    "    </answer>",
    "  - CATEGORY must be ONE of: GROUNDED, HALLUCINATED_INTRINSIC, HALLUCINATED_EXTRINSIC.",
    "  - The <justification> must briefly explain your reasoning and cite evidence from the document.",
    "  - Do NOT add any other text before or after the <answer>...</answer> block.",
    "  - Do NOT add any extra tags or attributes.",
]

_lock = threading.Lock()  # one model call at a time: the GPU and the RAM budget are shared
_stage1 = None
_stage2 = None


def log(*args):
    print(time.strftime("%H:%M:%S"), *args, flush=True)


def load_stage1():
    global _stage1
    if _stage1 is not None:
        return _stage1
    import torch
    from transformers import AutoConfig, AutoModelForSeq2SeqLM, AutoModelForSequenceClassification, AutoTokenizer

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32
    log("stage 1: loading on", device)
    config = AutoConfig.from_pretrained(FACTCG_DIR, num_labels=2, finetuning_task="text-classification")
    config.problem_type = "single_label_classification"
    fc_tok = AutoTokenizer.from_pretrained(FACTCG_DIR, use_fast=True)
    fc_tok.pad_token = fc_tok.eos_token or fc_tok.pad_token
    fc = AutoModelForSequenceClassification.from_pretrained(FACTCG_DIR, config=config, torch_dtype=dtype).to(device).eval()
    mc_tok = AutoTokenizer.from_pretrained(MINICHECK_DIR)
    mc = AutoModelForSeq2SeqLM.from_pretrained(MINICHECK_DIR, torch_dtype=dtype).to(device).eval()
    _stage1 = {"torch": torch, "device": device, "fc": fc, "fc_tok": fc_tok, "mc": mc, "mc_tok": mc_tok}
    log("stage 1: ready")
    return _stage1


def stage1(pairs):
    s = load_stage1()
    torch = s["torch"]
    out = []
    with torch.no_grad():
        for i in range(0, len(pairs), 8):
            batch = pairs[i:i + 8]
            # FactCG: its instruction prompt, probability of label 1 (supported).
            texts = [FACTCG_TEMPLATE.format(text_a=p["doc"], text_b=p["claim"]) for p in batch]
            enc = s["fc_tok"](texts, max_length=2048, truncation=True, padding="longest", return_tensors="pt").to(s["device"])
            fc_probs = torch.softmax(s["fc"](**enc).logits.float(), dim=-1)[:, 1].tolist()
            # MiniCheck: "predict: doc</s>claim", first decoder step, tokens 3 ("0") and 209 ("1").
            eos = s["mc_tok"].eos_token
            mtexts = ["predict: " + p["doc"] + eos + p["claim"] for p in batch]
            menc = s["mc_tok"](mtexts, max_length=2048, truncation=True, padding=True, return_tensors="pt").to(s["device"])
            dec = torch.zeros((menc["input_ids"].size(0), 1), dtype=torch.long, device=s["device"])
            logits = s["mc"](input_ids=menc["input_ids"], attention_mask=menc["attention_mask"], decoder_input_ids=dec).logits.squeeze(1)
            mc_probs = torch.softmax(logits[:, [3, 209]].float(), dim=-1)[:, 1].tolist()
            for a, b in zip(fc_probs, mc_probs):
                out.append({"factcg": round(a, 4), "minicheck": round(b, 4)})
    return out


def load_stage2():
    global _stage2
    if _stage2 is not None:
        return _stage2
    from llama_cpp import Llama
    from transformers import AutoTokenizer

    threads = max(2, (os.cpu_count() or 8) - 2)
    log("stage 2: loading Granite Guardian and HalluGuard in RAM,", threads, "threads")
    granite = Llama(model_path=GRANITE_GGUF, n_ctx=8192, n_threads=threads, n_gpu_layers=0, verbose=False)
    granite_tok = AutoTokenizer.from_pretrained(GRANITE_TOKENIZER)
    halluguard = Llama(model_path=HALLUGUARD_GGUF, n_ctx=8192, n_threads=threads, n_gpu_layers=0, verbose=False)
    _stage2 = {"granite": granite, "granite_tok": granite_tok, "halluguard": halluguard}
    log("stage 2: ready")
    return _stage2


def granite_grounded(s, doc, claim):
    # Granite Guardian's own groundedness criterion, rendered by its own chat template.
    messages = [{"role": "assistant", "content": claim}]
    prompt = s["granite_tok"].apply_chat_template(
        messages, guardian_config={"criteria_id": "groundedness"}, documents=[{"doc_id": "0", "text": doc}],
        think=False, tokenize=False, add_generation_prompt=True)
    text = s["granite"].create_completion(prompt, max_tokens=24, temperature=0.0)["choices"][0]["text"]
    m = re.search(r"<score>\s*(yes|no)\s*</score>", text, re.I) or re.search(r"\b(yes|no)\b", text, re.I)
    if not m:
        return "unclear"
    return "ungrounded" if m.group(1).lower() == "yes" else "grounded"


def halluguard_label(s, doc, claim):
    prompt = json.dumps({"instructions": HALLUGUARD_INSTRUCTIONS, "document": f"'{doc}'", "claim": f"'{claim}'"})
    res = s["halluguard"].create_chat_completion(
        messages=[{"role": "user", "content": prompt}], max_tokens=int(os.environ.get("HALLUGUARD_MAX_TOKENS", "700")), temperature=0.6, top_p=0.95, top_k=20)
    text = res["choices"][0]["message"]["content"] or ""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    m = re.search(r"<classification>\s*([A-Z_]+)\s*</classification>", text)
    why = re.search(r"<justification>(.*?)</justification>", text, re.S)
    return (m.group(1) if m else "UNCLEAR"), (why.group(1).strip()[:400] if why else "")


def stage2(pairs):
    s = load_stage2()
    out = []
    for p in pairs:
        t0 = time.time()
        g = granite_grounded(s, p["doc"], p["claim"])
        t1 = time.time()
        # A claim Granite already finds ungrounded goes to the judge either way, so
        # HalluGuard (the slow one: it reasons first) only gives its second opinion
        # on claims Granite would pass.
        if g == "ungrounded":
            h, why = "SKIPPED", ""
        else:
            h, why = halluguard_label(s, p["doc"], p["claim"])
        log(f"  granite {t1 - t0:.1f}s, halluguard {time.time() - t1:.1f}s: {g} / {h}")
        out.append({"granite": g, "halluguard": h, "why": why})
    return out


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):  # quiet
        pass

    def do_GET(self):
        if self.path == "/health":
            have = {k: os.path.exists(v) for k, v in {
                "factcg": FACTCG_DIR, "minicheck": MINICHECK_DIR, "granite": GRANITE_GGUF,
                "granite_tokenizer": GRANITE_TOKENIZER, "halluguard": HALLUGUARD_GGUF}.items()}
            return self._send(200, {"ok": True, "models": have, "stage1_loaded": _stage1 is not None, "stage2_loaded": _stage2 is not None})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
            pairs = [{"doc": str(p.get("doc", ""))[:12000], "claim": str(p.get("claim", ""))[:1000]} for p in body.get("pairs", [])]
            started = time.time()
            with _lock:
                if self.path == "/stage1":
                    results = stage1(pairs)
                elif self.path == "/stage2":
                    results = stage2(pairs)
                else:
                    return self._send(404, {"error": "not found"})
            log(self.path, len(pairs), "pairs in", round(time.time() - started, 1), "s")
            self._send(200, {"results": results})
        except Exception as e:  # report, keep serving
            log("error:", repr(e))
            self._send(500, {"error": str(e)[:500]})


if __name__ == "__main__":
    if "--preload" in sys.argv:
        load_stage1()
    log(f"fact checkers on http://127.0.0.1:{PORT} (models in {MODELS})")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
