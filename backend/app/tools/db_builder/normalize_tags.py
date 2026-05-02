"""
Tag normalization + type classification for theory_db.json.

Pipeline:
  Step 1 (build_vocabulary): collect all unique soft_tags, ask Gemini to
    cluster them into canonical tags + assign type (evokes/technique/domain).
  Step 2 (apply_to_units): map each unit's soft_tags to canonical tags
    using the vocabulary and write tags_canonical / tags_evokes /
    tags_technique / tags_domain into a new theory_db_v2.json.

Run:
  # full vocabulary build (slow, costs a few cents)
  python -m app.tools.db_builder.normalize_tags vocab

  # apply vocabulary to units
  python -m app.tools.db_builder.normalize_tags apply

  # dry-run on 50-unit sample
  python -m app.tools.db_builder.normalize_tags apply --sample 50
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import Counter
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types

ROOT = Path(__file__).resolve().parents[3]
DB_DIR = ROOT / "app" / "db"
THEORY_DB = DB_DIR / "theory_db.json"
THEORY_DB_V2 = DB_DIR / "theory_db_v2.json"
VOCAB_PATH = DB_DIR / "tag_vocabulary.json"
LOG_PATH = DB_DIR / "tag_normalization_log.json"

load_dotenv(ROOT.parent / ".env")
load_dotenv(ROOT / ".env")
API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("ERROR: GEMINI_API_KEY not set", file=sys.stderr)
    sys.exit(1)

client = genai.Client(api_key=API_KEY)
MODEL = "gemini-2.5-flash"

VOCAB_PROMPT = """You are normalizing a tag vocabulary for a film/cinematography theory database.

You will receive a list of raw tags (with their frequency in the corpus). Group synonyms / near-duplicates / spelling variants together, give each group a canonical English name (lowercase, snake_case if multi-word), and classify each canonical tag into exactly ONE type:

- "evokes": effects, emotions, viewer reactions, narrative purposes (e.g. tension, intimacy, suspense, isolation, dominance, empathy)
- "technique": concrete craft tools / shot types / camera-or-edit moves (e.g. close_up, dutch_angle, cross_cutting, tracking_shot, eyeline_match)
- "domain": broad working areas / categories (e.g. editing, composition, blocking, continuity, lighting, sound)

Rules:
- A tag goes to exactly one type. If borderline, prefer evokes > technique > domain (most specific first).
- Merge aggressively: "close-up", "close up", "closeup", "tight shot" → close_up.
- Keep canonical names short and English.
- If a tag is too vague to be useful (e.g. "general", "misc"), still include it under domain.
- Do NOT invent tags that weren't in the input.

Output a JSON object with this exact schema:
{
  "vocabulary": [
    {
      "canonical": "close_up",
      "type": "technique",
      "synonyms": ["close-up", "close up", "closeup", "cu"]
    },
    ...
  ]
}

Input tags (format: "tag (frequency)"):
"""


APPLY_FALLBACK_PROMPT = """You are mapping leftover film-theory tags to a canonical vocabulary.

Canonical vocabulary (each entry: canonical name | type):
{vocab_summary}

For each input tag, return the BEST matching canonical name from the vocabulary above, or "NEW:<suggested_canonical>:<type>" if no good match exists. Type must be one of: evokes, technique, domain.

Output JSON: {{"mappings": [{{"input": "...", "canonical": "..."}}]}}

Input tags:
{tags}
"""


def load_db() -> dict:
    return json.loads(THEORY_DB.read_text(encoding="utf-8"))


def collect_tags(db: dict) -> Counter:
    c: Counter = Counter()
    for u in db.get("theory_units", []):
        for t in u.get("soft_tags", []) or []:
            c[t.strip()] += 1
    return c


def build_vocabulary() -> dict:
    """Step 1: ask Gemini to cluster all unique tags into canonical groups."""
    db = load_db()
    counts = collect_tags(db)
    print(f"[vocab] {len(counts)} unique tags, {sum(counts.values())} occurrences")

    # Sort by frequency desc; with 1M context we can fit them all.
    tag_lines = [f"{t} ({n})" for t, n in counts.most_common()]
    prompt = VOCAB_PROMPT + "\n".join(tag_lines)

    print(f"[vocab] sending {len(tag_lines)} tags to {MODEL} ...")
    t0 = time.time()
    resp = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.1,
        ),
    )
    print(f"[vocab] response in {time.time() - t0:.1f}s")

    data = json.loads(resp.text)
    vocab = data.get("vocabulary", [])
    print(f"[vocab] -> {len(vocab)} canonical tags")

    # Build reverse index: synonym -> (canonical, type)
    reverse: dict = {}
    for entry in vocab:
        canon = entry["canonical"]
        typ = entry["type"]
        for syn in [canon] + list(entry.get("synonyms", [])):
            reverse[syn.lower().strip()] = {"canonical": canon, "type": typ}

    out = {
        "vocabulary": vocab,
        "reverse_index": reverse,
        "stats": {
            "input_unique_tags": len(counts),
            "output_canonical_tags": len(vocab),
            "coverage": sum(1 for t in counts if t.lower().strip() in reverse) / max(1, len(counts)),
        },
    }
    VOCAB_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[vocab] coverage: {out['stats']['coverage']:.1%}")
    print(f"[vocab] saved -> {VOCAB_PATH}")

    type_counts = Counter(e["type"] for e in vocab)
    print(f"[vocab] type distribution: {dict(type_counts)}")


def _resolve_unmapped(tags: list[str], vocab: dict) -> dict[str, dict]:
    """Send leftover tags to Gemini in a single batch, get canonical mapping."""
    if not tags:
        return {}
    vocab_summary = "\n".join(
        f"- {e['canonical']} | {e['type']}" for e in vocab["vocabulary"]
    )
    prompt = APPLY_FALLBACK_PROMPT.format(
        vocab_summary=vocab_summary, tags="\n".join(tags)
    )
    resp = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.1,
        ),
    )
    data = json.loads(resp.text)
    out: dict[str, dict] = {}
    type_lookup = {e["canonical"]: e["type"] for e in vocab["vocabulary"]}
    for m in data.get("mappings", []):
        inp = m["input"].lower().strip()
        canon_raw = m["canonical"]
        if canon_raw.startswith("NEW:"):
            parts = canon_raw.split(":", 2)
            if len(parts) == 3:
                _, new_canon, new_type = parts
                out[inp] = {"canonical": new_canon.strip(), "type": new_type.strip(), "new": True}
            continue
        canon = canon_raw.strip()
        if canon in type_lookup:
            out[inp] = {"canonical": canon, "type": type_lookup[canon], "new": False}
    return out


def apply_to_units(sample: int | None = None) -> None:
    """Step 2: apply vocabulary to each theory_unit, write theory_db_v2.json."""
    if not VOCAB_PATH.exists():
        print("ERROR: vocabulary not built yet. Run `vocab` first.", file=sys.stderr)
        sys.exit(1)

    db = load_db()
    vocab = json.loads(VOCAB_PATH.read_text(encoding="utf-8"))
    reverse = {k.lower().strip(): v for k, v in vocab["reverse_index"].items()}

    units = db.get("theory_units", [])
    if sample:
        units = units[:sample]
        print(f"[apply] DRY-RUN on {len(units)} units")

    # First pass: identify unmapped tags
    unmapped: set[str] = set()
    for u in units:
        for t in u.get("soft_tags", []) or []:
            if t.lower().strip() not in reverse:
                unmapped.add(t)
    print(f"[apply] unmapped tags: {len(unmapped)}")

    fallback: dict[str, dict] = {}
    if unmapped:
        # batch in chunks of ~150 tags
        unmapped_list = sorted(unmapped)
        chunk = 150
        for i in range(0, len(unmapped_list), chunk):
            sub = unmapped_list[i : i + chunk]
            print(f"[apply] resolving unmapped batch {i}-{i+len(sub)} ...")
            fallback.update(_resolve_unmapped(sub, vocab))

    # Apply
    new_units = []
    log_entries = []
    for u in units:
        canonical = []
        evokes, technique, domain = [], [], []
        seen = set()
        for raw in u.get("soft_tags", []) or []:
            key = raw.lower().strip()
            entry = reverse.get(key) or fallback.get(key)
            if not entry:
                log_entries.append({"unit": u["id"], "raw": raw, "status": "unresolved"})
                continue
            canon = entry["canonical"]
            typ = entry["type"]
            if canon in seen:
                continue
            seen.add(canon)
            canonical.append(canon)
            if typ == "evokes":
                evokes.append(canon)
            elif typ == "technique":
                technique.append(canon)
            elif typ == "domain":
                domain.append(canon)
        new_u = dict(u)
        new_u["tags_canonical"] = canonical
        new_u["tags_evokes"] = evokes
        new_u["tags_technique"] = technique
        new_u["tags_domain"] = domain
        new_units.append(new_u)

    # Stats
    total_evokes = sum(len(u["tags_evokes"]) for u in new_units)
    total_tech = sum(len(u["tags_technique"]) for u in new_units)
    total_dom = sum(len(u["tags_domain"]) for u in new_units)
    no_evokes = sum(1 for u in new_units if not u["tags_evokes"])
    print(
        f"[apply] units={len(new_units)} | evokes={total_evokes} technique={total_tech} domain={total_dom}"
    )
    print(f"[apply] units with no evokes tag: {no_evokes}")

    if sample:
        print("[apply] sample mode — not writing theory_db_v2.json")
        for u in new_units[:5]:
            print(
                f"  {u['id']} | E={u['tags_evokes']} T={u['tags_technique']} D={u['tags_domain']}"
            )
        return

    out_db = dict(db)
    out_db["theory_units"] = new_units
    THEORY_DB_V2.write_text(json.dumps(out_db, ensure_ascii=False, indent=2), encoding="utf-8")
    LOG_PATH.write_text(json.dumps(log_entries, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[apply] saved -> {THEORY_DB_V2}")
    print(f"[apply] log    -> {LOG_PATH}  ({len(log_entries)} unresolved)")


def main() -> None:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("vocab", help="Step 1: build canonical vocabulary")
    a = sub.add_parser("apply", help="Step 2: apply vocabulary to units")
    a.add_argument("--sample", type=int, default=None)
    args = p.parse_args()

    if args.cmd == "vocab":
        build_vocabulary()
    elif args.cmd == "apply":
        apply_to_units(sample=args.sample)


if __name__ == "__main__":
    main()
