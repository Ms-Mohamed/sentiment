"""
Processing layer: raw posts -> scored posts -> dashboard JSON.

Lambda-style design
  * BATCH layer  : Hadoop Streaming (mapper.py / reducer.py) over the whole cleaned corpus,
                   at most every `batch_interval_seconds`. If Docker/Hadoop is not running it
                   falls back to the SAME mapper/reducer executed locally ("local-streaming").
  * SPEED layer  : between batches, new posts are scored in-process with the same model.

Every number written to pipeline.json is measured (wall-clock timings, real record counts,
real Hadoop counters when available). Nothing is simulated.
"""

import os
import re
import sys
import json
import time
import logging
import datetime
import threading
import subprocess
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

import yaml

import mapper  # same scoring code as the Hadoop mapper (single source of truth)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
ALLOWED_SOURCES = {"reddit", "news"}   # anything else in data/raw (e.g. old synthetic files) is dropped
EMOTIONS = ["Pride/Joy", "Grievance", "Concern", "Peace", "Neutral"]


def atomic_write(file_path: str, data: Any) -> None:
    """Write JSON atomically (tmp file + os.replace) so readers never see a partial file."""
    tmp_path = file_path + ".tmp"
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, file_path)


def _config() -> dict:
    try:
        with open(os.path.join(BACKEND_DIR, "config.yaml"), "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return {}


# --------------------------------------------------------------------------- #
# Subjects (keyword topics). Single words are matched as whole tokens, phrases as substrings.
# --------------------------------------------------------------------------- #

SUBJECT_DEFINITIONS = {
    "Transport & Infrastructures": {
        "keywords": ["transport", "traffic", "route", "autoroute", "tramway", "tgv", "oncf", "train", "voyageur", "gare", "accident", "routes", "circulation", "bus"],
        "emoji": "🚗",
        "desc": "Analyse des transports en commun, des routes et des grands projets ferroviaires (TGV, Tram)."
    },
    "Football & Sports": {
        "keywords": ["foot", "football", "match", "stade", "botola", "caf", "champions", "victoire", "équipe", "equipe", "qualification", "joueur", "coupe", "score", "maghrib", "dima"],
        "emoji": "⚽",
        "desc": "Passion du sport national, résultats de la Botola et de l'équipe nationale."
    },
    "Services Publics & Tech": {
        "keywords": ["internet", "wifi", "connexion", "électricité", "electricite", "panne", "eau", "coupure", "app", "application", "glitch", "technologie", "réseau", "reseau", "walo", "walou"],
        "emoji": "🔌",
        "desc": "Qualité de la connexion Internet (Wi-Fi), pannes de courant, alimentation en eau et tech."
    },
    "Tourisme & Culture": {
        "keywords": ["tourisme", "touriste", "coucher de soleil", "corniche", "médina", "medina", "plage", "surf", "festival", "mawazine", "atay", "thé", "chebakia", "couscous", "vague", "cascades", "marrakech", "tanger", "fes", "agadir", "dakhla", "vacances"],
        "emoji": "🇲🇦",
        "desc": "Attractivité touristique, festivals culturels, cuisine marocaine (Couscous, Atay) et plages."
    },
    "Économie & Pouvoir d'Achat": {
        "keywords": ["carburant", "prix", "inflation", "chômage", "chomage", "rentrée", "rentree", "scolaire", "coût", "cout", "vie", "location", "loger", "argent", "économie", "economie", "légumes", "legumes", "achat"],
        "emoji": "📈",
        "desc": "Évolution du coût de la vie, inflation des prix, opportunités d'emploi et loyers."
    }
}

STOPWORDS = set("""
le la les des du de et est une un pour dans que qui sur au aux pas avec par plus son ses leur leurs cette ces
sont ont être avoir fait faire comme mais ou où donc car aussi très tout tous elle ils elles nous vous
the and for that with this from have has are was were will not but they their about after more been into over
maroc marocain marocaine morocco moroccan reddit
""".split())

# --------------------------------------------------------------------------- #
# In-memory state
# --------------------------------------------------------------------------- #

STATE: Dict[str, Any] = {
    "cursors": {},      # filename -> byte offset already consumed
    "ids": set(),       # post_ids kept in corpus
    "corpus": [],       # cleaned, unscored posts (input of the batch job)
    "posts": [],        # scored posts
    "heatmap": {},      # finalized regional stats
    "last_batch": None  # dict with the last batch run's real stats
}
_LOCK = threading.Lock()


# --------------------------------------------------------------------------- #
# Stage 1: cleaning (incremental read of data/raw)
# --------------------------------------------------------------------------- #

def _parse_date(s: str) -> Optional[datetime.datetime]:
    try:
        d = datetime.datetime.fromisoformat(s)
        return d.replace(tzinfo=None) if d.tzinfo else d
    except Exception:
        return None


def read_new_raw(raw_dir: str) -> Tuple[List[dict], Dict[str, int]]:
    """Read bytes appended since the last call, validate and deduplicate. Returns (clean_posts, counters)."""
    c = Counter()
    clean: List[dict] = []
    if not os.path.isdir(raw_dir):
        return clean, dict(c)
    for fn in sorted(os.listdir(raw_dir)):
        if not fn.endswith(".jsonl"):
            continue
        path = os.path.join(raw_dir, fn)
        size = os.path.getsize(path)
        cur = STATE["cursors"].get(fn, 0)
        if size < cur:      # file was rewritten/truncated
            cur = 0
        if size == cur:
            continue
        with open(path, "rb") as f:
            f.seek(cur)
            chunk = f.read()
        end = chunk.rfind(b"\n")
        if end < 0:         # only a partial line so far; wait for the writer
            continue
        STATE["cursors"][fn] = cur + end + 1
        for raw in chunk[:end].split(b"\n"):
            raw = raw.strip().lstrip(b"\xef\xbb\xbf")
            if not raw:
                continue
            c["read"] += 1
            try:
                p = json.loads(raw.decode("utf-8", errors="replace"))
            except Exception:
                c["bad_json"] += 1
                continue
            if not isinstance(p, dict) or not p.get("post_id") or not isinstance(p.get("text"), str) or not p["text"].strip():
                c["missing_fields"] += 1
                continue
            if p.get("source") not in ALLOWED_SOURCES:
                c["not_a_real_source"] += 1
                continue
            d = _parse_date(str(p.get("created_at", "")))
            if d is None:
                c["bad_date"] += 1
                continue
            if p["post_id"] in STATE["ids"]:
                c["duplicate"] += 1
                continue
            p["created_at"] = d.isoformat()
            p.setdefault("region", "National")
            p.pop("raw_score", None)
            STATE["ids"].add(p["post_id"])
            clean.append(p)
    c["kept"] = len(clean)
    return clean, dict(c)


# --------------------------------------------------------------------------- #
# Stage 2: sentiment scoring (batch = Hadoop Streaming, speed = in-process)
# --------------------------------------------------------------------------- #

def _hadoop_available() -> bool:
    try:
        r = subprocess.run(["docker", "exec", "namenode", "true"], capture_output=True, timeout=15)
        return r.returncode == 0
    except Exception:
        return False


def _parse_streaming_output(text: str) -> Tuple[List[dict], Dict[str, dict]]:
    posts, regions = [], {}
    for line in text.splitlines():
        try:
            rec = json.loads(line)
        except Exception:
            continue
        if rec.get("type") == "post":
            posts.append(rec["data"])
        elif rec.get("type") == "region":
            regions.update(rec["data"])
    return posts, regions


def _hadoop_counter(stderr: str, name: str) -> Optional[int]:
    m = re.search(name + r"=(\d+)", stderr or "")
    return int(m.group(1)) if m else None


def run_hadoop_job(input_path: str) -> Tuple[List[dict], Dict[str, dict], dict]:
    """Run mapper.py/reducer.py through Hadoop Streaming in the `namenode` container."""
    rel = os.path.relpath(input_path, BACKEND_DIR).replace(os.sep, "/")
    container_input = "/opt/backend/" + rel   # ./backend is mounted at /opt/backend in docker-compose
    dx = lambda *a, **k: subprocess.run(["docker", "exec", "namenode", *a], capture_output=True, text=True, encoding="utf-8", errors="replace", **k)
    dx("hdfs", "dfs", "-mkdir", "-p", "/data/raw")
    dx("hdfs", "dfs", "-rm", "-r", "-f", "/data/output", "/data/raw/batch_input.jsonl")
    up = dx("hdfs", "dfs", "-put", "-f", container_input, "/data/raw/batch_input.jsonl")
    if up.returncode != 0:
        raise RuntimeError(f"hdfs put failed: {up.stderr[-300:]}")
    job = dx("hadoop", "jar", "/opt/hadoop-3.2.1/share/hadoop/tools/lib/hadoop-streaming-3.2.1.jar",
             "-files", "/opt/backend/mapper.py,/opt/backend/reducer.py",
             "-mapper", "python3 /opt/backend/mapper.py",
             "-reducer", "python3 /opt/backend/reducer.py",
             "-input", "/data/raw/batch_input.jsonl", "-output", "/data/output")
    if job.returncode != 0:
        raise RuntimeError(f"hadoop job failed: {job.stderr[-400:]}")
    out = dx("sh", "-c", "hdfs dfs -cat /data/output/part-*")
    posts, regions = _parse_streaming_output(out.stdout)
    counters = {
        "map_input_records": _hadoop_counter(job.stderr, r"Map input records"),
        "map_output_records": _hadoop_counter(job.stderr, r"Map output records"),
        "reduce_output_records": _hadoop_counter(job.stderr, r"Reduce output records"),
    }
    return posts, regions, counters


def run_local_streaming(input_path: str) -> Tuple[List[dict], Dict[str, dict], dict]:
    """`cat input | mapper | sort -k1,1 | reducer` : exactly what Hadoop Streaming does, on one machine."""
    with open(input_path, "rb") as f:
        data = f.read()
    m = subprocess.run([sys.executable, os.path.join(BACKEND_DIR, "mapper.py")], input=data, capture_output=True, check=True)
    lines = [l for l in m.stdout.decode("utf-8", errors="replace").split("\n") if l.strip()]
    lines.sort(key=lambda l: l.split("\t", 1)[0])    # shuffle & sort by key (stable)
    r = subprocess.run([sys.executable, os.path.join(BACKEND_DIR, "reducer.py")], input=("\n".join(lines) + "\n").encode("utf-8"), capture_output=True, check=True)
    posts, regions = _parse_streaming_output(r.stdout.decode("utf-8", errors="replace"))
    counters = {"map_input_records": data.count(b"\n"), "map_output_records": len(lines), "reduce_output_records": len(posts) + len(regions)}
    return posts, regions, counters


def finalize_heatmap(acc: Dict[str, dict]) -> Dict[str, dict]:
    """score := mean of non-zero raw scores; count := total posts (what the dashboard expects)."""
    out = {}
    for region, st in acc.items():
        st = json.loads(json.dumps(st))
        st["score"] = st["score"] / st["count"] if st["count"] > 0 else 0.0
        st["count"] = st["total_posts"]
        out[region] = st
    return out


def compute_heatmap(posts: List[dict]) -> Dict[str, dict]:
    """Pure-Python version of reducer.py (used by the speed layer and to cross-check the batch job)."""
    acc: Dict[str, dict] = {}
    for p in posts:
        region = p.get("region") or "Unknown"
        if region == "Unknown":
            continue
        st = acc.setdefault(region, {"score": 0.0, "count": 0, "total_posts": 0, "emotions": {e: 0 for e in EMOTIONS}})
        st["total_posts"] += 1
        if p.get("raw_score", 0.0) != 0.0:
            st["score"] += p["raw_score"]
            st["count"] += 1
        st["emotions"][p.get("emotion", "Neutral")] = st["emotions"].get(p.get("emotion", "Neutral"), 0) + 1
    return finalize_heatmap(acc)


# --------------------------------------------------------------------------- #
# Stages 3-5: terms, subjects/alerts, velocity
# --------------------------------------------------------------------------- #

def compute_terms(posts: List[dict], now: datetime.datetime, top: int = 10) -> List[dict]:
    """Real #hashtags first, then the most frequent meaningful terms (no hashtag is ever invented)."""
    tags, terms = Counter(), Counter()
    recent, prev = Counter(), Counter()
    for p in posts:
        text = p["text"]
        found = set(t.lower() for t in re.findall(r"#[^\W_]+", text))
        words = set(w for w in re.findall(r"[^\W\d_]{4,}", text.lower()) if w not in STOPWORDS)
        d = _parse_date(p["created_at"]) or now
        age = (now - d).total_seconds() / 3600.0
        for key, kind in [(t, "hashtag") for t in found] + [(w, "term") for w in words]:
            (tags if kind == "hashtag" else terms)[key] += 1
            if age <= 24: recent[key] += 1
            elif age <= 48: prev[key] += 1
    ranked = [(t, n, "hashtag") for t, n in tags.most_common(top)]
    ranked += [(t, n, "term") for t, n in terms.most_common(top) if len(ranked) < top]
    ranked = ranked[:top]
    out = []
    for key, n, kind in ranked:
        r, p_ = recent[key], prev[key]
        trend = "up" if r >= 3 and r > p_ * 1.5 else "down" if p_ >= 3 and r < p_ * 0.5 else "stable"
        out.append({"tag": key, "count": n, "trend": trend, "type": kind})
    return out


def _kw_match(text_lower: str, words: set, kws: List[str]) -> List[str]:
    return [k for k in kws if (k in text_lower if " " in k else k in words)]


def compute_subjects(posts: List[dict]) -> List[dict]:
    data = {n: {"emoji": i["emoji"], "description": i["desc"], "count": 0, "tot": 0.0, "n": 0,
                "emotions": {e: 0 for e in EMOTIONS}, "posts": [], "kw": Counter()} for n, i in SUBJECT_DEFINITIONS.items()}
    for p in posts:
        tl = p["text"].lower()
        words = set(re.findall(r"[^\W_]+", tl))
        for name, info in SUBJECT_DEFINITIONS.items():
            found = _kw_match(tl, words, info["keywords"])
            if not found:
                continue
            s = data[name]
            s["count"] += 1
            if p.get("raw_score", 0.0) != 0.0:
                s["tot"] += p["raw_score"]; s["n"] += 1
            s["emotions"][p.get("emotion", "Neutral")] += 1
            s["posts"].append({k: p.get(k) for k in ("post_id", "source", "text", "created_at", "region", "raw_score", "emotion")})
            s["kw"].update(found)
    out = []
    for name, s in data.items():
        avg = s["tot"] / s["n"] if s["n"] else 0.0
        primary = max(s["emotions"].items(), key=lambda kv: kv[1])[0] if s["count"] else "Neutral"
        out.append({"subject": name, "emoji": s["emoji"], "description": s["description"], "count": s["count"],
                    "avg_sentiment": round(avg, 3), "primary_emotion": primary, "emotions": s["emotions"],
                    "top_keywords": [k for k, _ in s["kw"].most_common(5)],
                    "posts": sorted(s["posts"], key=lambda x: x["created_at"], reverse=True)[:15]})
    return sorted(out, key=lambda x: x["count"], reverse=True)[:5]


def compute_velocity(posts: List[dict]) -> List[dict]:
    """Per publication day: mean sentiment and day-over-day change (x100)."""
    days: Dict[str, dict] = {}
    for p in posts:
        d = days.setdefault(p["created_at"][:10], {"score": 0.0, "count": 0, "total": 0})
        d["total"] += 1
        if p.get("raw_score", 0.0) != 0.0:
            d["score"] += p["raw_score"]; d["count"] += 1
    out, prev = [], 0.0
    for i, day in enumerate(sorted(days)):
        d = days[day]
        avg = d["score"] / d["count"] if d["count"] else 0.0
        out.append({"time": day, "avg_sentiment": avg, "velocity": (avg - prev) * 100.0 if i >= 1 else 0.0, "count": d["total"]})
        prev = avg
    return out


def compute_alerts(posts: List[dict], heatmap: Dict[str, dict], sources: List[dict], now: datetime.datetime) -> List[dict]:
    alerts: List[dict] = []
    def add(kind, msg, **extra):
        alerts.append({"id": int(now.timestamp()) + len(alerts), "type": kind, "message": msg, "timestamp": now.isoformat(), **extra})

    for s in sources:
        if not s.get("ok"):
            add("SOURCE_DOWN", f"Source '{s.get('name')}' could not be fetched: {s.get('error')}", severity="warning")

    per_day = Counter(p["created_at"][:10] for p in posts)
    today = now.date().isoformat()
    history = [n for d, n in per_day.items() if d != today]
    if len(history) >= 3:
        mean = sum(history) / len(history)
        if per_day.get(today, 0) >= max(20, 2 * mean):
            add("VOLUME_SPIKE", f"{per_day[today]} posts published today vs a daily mean of {mean:.0f} over the previous {len(history)} days.")

    for region, st in heatmap.items():
        if region != "National" and st["total_posts"] >= 5 and st["score"] < -0.15:
            add("REGIONAL_CRISIS", f"{region}: average sentiment {st['score']:+.2f} over {st['total_posts']} posts that mention it.")

    if posts:
        lex = sum(1 for p in posts if p.get("scorer") == "lexicon")
        if lex / len(posts) > 0.5:
            add("SCORER_FALLBACK", f"{lex / len(posts):.0%} of posts were scored with the small lexicon fallback, not the ML model (is scikit-learn available to the scorer?).", severity="warning")

    if not alerts:
        add("SYSTEM_OK", f"No anomaly detected in {len(posts)} posts from {len(sources) or 'n/a'} source feeds.")
    return alerts


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #

def _read_json(path: str, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


class _Pipeline:
    """Writes pipeline.json on every status change, with measured timings."""
    NAMES = ["Nettoyage", "NLP Sentiment", "Hashtags", "Anomalies", "Vélocité ★"]

    def __init__(self, path: str):
        self.path = path
        self.stages = [{"job": i + 1, "name": n, "status": "pending", "records_in": 0, "records_out": 0, "duration_ms": None, "detail": ""}
                       for i, n in enumerate(self.NAMES)]
        self.flush()

    def flush(self):
        atomic_write(self.path, self.stages)

    def run(self, i: int, fn):
        st = self.stages[i]
        st["status"] = "running"; self.flush()
        t0 = time.perf_counter()
        try:
            res = fn(st)
            st["status"] = "done"
            return res
        except Exception as e:
            st["status"] = "error"; st["detail"] = f"{type(e).__name__}: {e}"[:300]
            raise
        finally:
            st["duration_ms"] = round((time.perf_counter() - t0) * 1000, 1)
            self.flush()


def process_raw_files(data_dir: str, force_batch: bool = False) -> None:
    """Run the full pipeline once. Thread-safe; cheap when nothing changed."""
    with _LOCK:
        _process(data_dir, force_batch)


def _process(data_dir: str, force_batch: bool) -> None:
    cfg = _config()
    raw_dir = os.path.join(data_dir, "raw")
    processed_dir = os.path.join(data_dir, "processed")
    batch_dir = os.path.join(data_dir, "batch")
    for d in (raw_dir, processed_dir, batch_dir):
        os.makedirs(d, exist_ok=True)
    now = datetime.datetime.now()
    pipe = _Pipeline(os.path.join(processed_dir, "pipeline.json"))
    sources = _read_json(os.path.join(processed_dir, "sources.json"), [])
    chaos = os.path.exists(os.path.join(data_dir, ".pipeline_failed"))

    # ---- 1. cleaning ---------------------------------------------------------
    def stage1(st):
        clean, c = read_new_raw(raw_dir)
        st["records_in"], st["records_out"] = c.get("read", 0), c.get("kept", 0)
        dropped = {k: v for k, v in c.items() if k not in ("read", "kept")}
        st["detail"] = "dropped: " + ", ".join(f"{k}={v}" for k, v in dropped.items()) if dropped else "nothing dropped"
        return clean
    new_posts = pipe.run(0, stage1)
    STATE["corpus"].extend(new_posts)

    if not STATE["corpus"]:
        logger.warning("No posts found to process.")
        # Still tell the dashboard what is wrong (e.g. every source unreachable).
        atomic_write(os.path.join(processed_dir, "alerts.json"), compute_alerts([], {}, sources, now))
        return

    # ---- 2. scoring ----------------------------------------------------------
    batch_interval = cfg.get("batch_interval_seconds", 1800)
    last = STATE["last_batch"]
    due = last is None or (time.time() - last["finished_at"]) >= batch_interval
    do_batch = bool(new_posts) and (due or force_batch)

    def stage2(st):
        if do_batch:
            input_path = os.path.join(batch_dir, "batch_input.jsonl")
            with open(input_path, "w", encoding="utf-8") as f:
                for p in STATE["corpus"]:
                    f.write(json.dumps(p, ensure_ascii=False) + "\n")
            engine, note = ("hadoop", "")
            try:
                if not _hadoop_available():
                    raise RuntimeError("namenode container not reachable")
                posts, regions, counters = run_hadoop_job(input_path)
            except Exception as e:
                engine, note = "local-streaming", f" (Hadoop unavailable: {str(e)[:120]})"
                posts, regions, counters = run_local_streaming(input_path)
            STATE["posts"] = posts
            STATE["heatmap"] = finalize_heatmap(regions)
            scorers = Counter(p.get("scorer", "?") for p in posts)
            STATE["last_batch"] = {"finished_at": time.time(), "engine": engine, "records_in": len(STATE["corpus"]),
                                   "records_out": len(posts), "counters": counters, "scorers": dict(scorers)}
            st["records_in"], st["records_out"] = len(STATE["corpus"]), len(posts)
            st["detail"] = f"BATCH via {engine}{note}; scorers={dict(scorers)}; counters={counters}"
        else:
            scored = [mapper.score_post(dict(p)) for p in new_posts]
            STATE["posts"].extend(scored)
            STATE["heatmap"] = compute_heatmap(STATE["posts"])
            st["records_in"], st["records_out"] = len(new_posts), len(scored)
            lb = STATE["last_batch"]
            st["detail"] = (f"SPEED layer in-process; last batch: {lb['engine']} ({len(STATE['posts']) - len(scored)} posts)" if lb else "SPEED layer in-process")
        posts_sorted = sorted(STATE["posts"], key=lambda x: x["created_at"], reverse=True)
        atomic_write(os.path.join(processed_dir, "feed.json"), posts_sorted[:50])
        atomic_write(os.path.join(processed_dir, "heatmap.json"), STATE["heatmap"])
    pipe.run(1, stage2)
    posts = STATE["posts"]

    # ---- 3. hashtags / terms -------------------------------------------------
    def stage3(st):
        terms = compute_terms(posts, now)
        atomic_write(os.path.join(processed_dir, "hashtags.json"), terms)
        st["records_in"], st["records_out"] = len(posts), len(terms)
        st["detail"] = "real #hashtags first, then most frequent terms"
    pipe.run(2, stage3)

    # ---- 4. subjects + anomalies ---------------------------------------------
    def stage4(st):
        subjects = compute_subjects(posts)
        atomic_write(os.path.join(processed_dir, "subjects.json"), subjects)
        if chaos:
            atomic_write(os.path.join(processed_dir, "alerts.json"), [{
                "id": int(now.timestamp()), "type": "PROCESS_CRITICAL", "severity": "critical", "timestamp": now.isoformat(),
                "message": "Stage 4 failure injected manually from the dashboard (failure-injection demo, not a real crash)."}])
            raise RuntimeError("failure injected from the dashboard (demo)")
        alerts = compute_alerts(posts, STATE["heatmap"], sources, now)
        atomic_write(os.path.join(processed_dir, "alerts.json"), alerts)
        st["records_in"], st["records_out"] = len(posts), len(alerts)
    try:
        pipe.run(3, stage4)
    except Exception:
        if chaos:
            return   # downstream stage stays pending, exactly like a failed job chain
        raise

    # ---- 5. velocity ---------------------------------------------------------
    def stage5(st):
        v = compute_velocity(posts)
        atomic_write(os.path.join(processed_dir, "velocity.json"), v)
        st["records_in"], st["records_out"] = len(posts), len(v)
        st["detail"] = "per publication day"
    pipe.run(4, stage5)
    logger.info("Processing completed (%d posts in corpus).", len(posts))


if __name__ == "__main__":
    process_raw_files(os.path.join(BACKEND_DIR, "data"))
