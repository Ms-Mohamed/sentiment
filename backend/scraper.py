"""
Collector: REAL sources only (Reddit RSS + Moroccan news RSS). No synthetic data.

Design rules
- Every post gets its true publication date, so the velocity chart reflects reality.
- Deduplicate by stable post_id (persisted across restarts by scanning data/raw).
- Region = explicit city mention, otherwise "National". We never guess a region.
- A failing source is reported (data/processed/sources.json) and never blocks the others.
"""

import os
import re
import json
import yaml
import html
import time
import hashlib
import logging
import datetime
import threading
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from typing import Dict, List, Optional, Set

from apscheduler.schedulers.background import BackgroundScheduler

from region_inferrer import infer_region
from sentiment_processor import process_raw_files, atomic_write

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MAX_TEXT_CHARS = 600

# --------------------------------------------------------------------------- #
# Parsing helpers (pure functions: unit-tested without network)
# --------------------------------------------------------------------------- #

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_ARABIC_RE = re.compile(r"[؀-ۿ]")
_FR_WORDS = {"le", "la", "les", "des", "du", "de", "et", "est", "une", "un", "pour", "dans", "que", "qui", "sur", "au", "aux", "pas", "avec"}
_EN_WORDS = {"the", "and", "is", "of", "to", "in", "for", "that", "with", "are", "this", "was", "have"}


def strip_html(s: Optional[str]) -> str:
    if not s:
        return ""
    s = html.unescape(s)
    s = _TAG_RE.sub(" ", s)
    s = html.unescape(s)  # feeds are often double-escaped
    return _WS_RE.sub(" ", s).strip()


def detect_lang(text: str) -> str:
    """Tiny heuristic: 'ar' if mostly Arabic script, else fr/en by stopword count, else 'und'."""
    letters = [c for c in text if c.isalpha()]
    if letters and sum(1 for c in letters if _ARABIC_RE.match(c)) / len(letters) > 0.3:
        return "ar"
    words = re.findall(r"[a-zà-ÿ']+", text.lower())
    fr = sum(1 for w in words if w in _FR_WORDS)
    en = sum(1 for w in words if w in _EN_WORDS)
    if fr == en:
        return "und"
    return "fr" if fr > en else "en"


def parse_date(value: Optional[str]) -> Optional[datetime.datetime]:
    """RFC-822 (RSS) or ISO-8601 (Atom) -> naive local datetime."""
    if not value:
        return None
    value = value.strip()
    dt = None
    try:
        dt = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        try:
            dt = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt.tzinfo is not None:
        dt = dt.astimezone().replace(tzinfo=None)
    return dt


def _local(tag: str) -> str:
    return tag.split('}')[-1]


def _children(el: ET.Element) -> Dict[str, ET.Element]:
    """First child per local tag name (namespace-agnostic)."""
    out: Dict[str, ET.Element] = {}
    for c in el:
        out.setdefault(_local(c.tag), c)
    return out


_REDDIT_FOOTER = re.compile(r"\s*submitted by\s+/?u/\S+(?:\s*\[link\])?(?:\s*\[comments\])?\s*$", re.IGNORECASE)


def strip_reddit_footer(text: str) -> str:
    """Reddit RSS appends '... submitted by /u/<handle> [link] [comments]' to every post.
    It is boilerplate (it pollutes the NLP input) and exposes the author's handle, so drop it."""
    return _REDDIT_FOOTER.sub("", text).strip()


def parse_feed(xml_bytes: bytes, source: str, kind: str, lang_hint: Optional[str] = None) -> List[Dict]:
    """
    Parse an RSS 2.0 or Atom feed into post dicts.
    kind: 'news' | 'reddit_post' | 'reddit_comment'
    """
    root = ET.fromstring(xml_bytes)
    entries = [e for e in root.iter() if _local(e.tag) in ("item", "entry")]
    posts = []
    for e in entries:
        c = _children(e)

        def txt(name):
            return (c[name].text or "") if name in c else ""

        title = strip_html(txt("title"))
        body = strip_html(txt("content") or txt("encoded") or txt("description") or txt("summary"))
        link = ""
        if "link" in c:
            link = c["link"].attrib.get("href") or (c["link"].text or "")
        raw_id = (txt("id") or txt("guid") or link or title).strip()
        if not raw_id:
            continue

        if kind == "reddit_comment":
            text = body  # the title is just "/u/name on <post title>"
        elif kind == "reddit_post":
            text = title if not body or body == title else f"{title}. {body}"
        else:  # news: headline + lead
            text = title if not body or body.startswith(title) else f"{title}. {body}"
        if kind.startswith("reddit"):
            text = strip_reddit_footer(text)
        text = text[:MAX_TEXT_CHARS].strip()
        if len(text) < 8:
            continue

        created = parse_date(txt("published") or txt("pubDate") or txt("updated") or txt("date")) or datetime.datetime.now()
        region = infer_region(text) or "National"
        posts.append({
            "post_id": f"{source}_{hashlib.sha1(raw_id.encode('utf-8')).hexdigest()[:16]}",
            "source": source,
            "kind": kind,
            "text": text,
            "url": link or None,
            "created_at": created.isoformat(),
            "region": region,
            "lang": detect_lang(text) if detect_lang(text) != "und" else (lang_hint or "und"),
            "raw_score": None,
        })
    return posts


def load_known_ids(raw_dir: str) -> Set[str]:
    """Collect post_ids already stored so restarts never create duplicates."""
    ids: Set[str] = set()
    if not os.path.isdir(raw_dir):
        return ids
    pid = re.compile(r'"post_id"\s*:\s*"([^"]+)"')
    for fn in os.listdir(raw_dir):
        if not fn.endswith(".jsonl"):
            continue
        with open(os.path.join(raw_dir, fn), "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                m = pid.search(line)
                if m:
                    ids.add(m.group(1))
    return ids


# --------------------------------------------------------------------------- #
# Collector
# --------------------------------------------------------------------------- #

class Scraper:
    def __init__(self, config_path: str = "config.yaml"):
        if not os.path.isabs(config_path):
            config_path = os.path.join(BASE_DIR, config_path)
        with open(config_path, "r", encoding="utf-8") as f:
            self.config = yaml.safe_load(f)
        self.data_dir = os.path.join(BASE_DIR, self.config.get("data_dir", "data"))
        self.raw_dir = os.path.join(self.data_dir, "raw")
        self.processed_dir = os.path.join(self.data_dir, "processed")
        os.makedirs(self.raw_dir, exist_ok=True)
        os.makedirs(self.processed_dir, exist_ok=True)
        self.user_agent = self.config.get("user_agent", "MoroccoSentimentAnalysis/2.0")
        self.known_ids = load_known_ids(self.raw_dir)
        self.lock = threading.Lock()
        logger.info(f"Loaded {len(self.known_ids)} known post ids from disk.")

    # -- network -------------------------------------------------------------
    def fetch(self, url: str) -> bytes:
        req = urllib.request.Request(url, headers={"User-Agent": self.user_agent, "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read()

    def sources(self) -> List[Dict]:
        """Flatten config into [{name, url, kind, lang}]."""
        out = []
        rd = self.config.get("reddit") or {}
        for sub in rd.get("subreddits", []):
            out.append({"name": f"reddit_{sub}_posts", "source": "reddit", "kind": "reddit_post", "lang": None,
                        "url": f"https://www.reddit.com/r/{sub}/new/.rss?limit={rd.get('posts_limit', 50)}"})
            if rd.get("comments_limit"):
                out.append({"name": f"reddit_{sub}_comments", "source": "reddit", "kind": "reddit_comment", "lang": None,
                            "url": f"https://www.reddit.com/r/{sub}/comments/.rss?limit={rd['comments_limit']}"})
        for feed in self.config.get("news_feeds", []):
            out.append({"name": feed["name"], "source": "news", "kind": "news", "lang": feed.get("lang"), "url": feed["url"]})
        return out

    # -- one cycle -----------------------------------------------------------
    def collect(self) -> (List[Dict], List[Dict]):
        """Fetch every source. Returns (new_posts, per-source status list)."""
        new_posts: List[Dict] = []
        status = []
        for s in self.sources():
            t0 = time.perf_counter()
            entry = {"name": s["name"], "url": s["url"], "ok": False, "fetched": 0, "new": 0, "error": None,
                     "checked_at": datetime.datetime.now().isoformat(timespec="seconds")}
            try:
                posts = parse_feed(self.fetch(s["url"]), s["source"], s["kind"], s["lang"])
                entry["ok"] = True
                entry["fetched"] = len(posts)
                for p in posts:
                    if p["post_id"] in self.known_ids:
                        continue
                    self.known_ids.add(p["post_id"])
                    new_posts.append(p)
                    entry["new"] += 1
            except Exception as e:  # network, HTTP 403/404, malformed XML...
                entry["error"] = f"{type(e).__name__}: {e}"[:200]
                logger.warning(f"Source {s['name']} failed: {entry['error']}")
            entry["duration_ms"] = round((time.perf_counter() - t0) * 1000)
            status.append(entry)
        return new_posts, status

    def store(self, posts: List[Dict]) -> None:
        if not posts:
            return
        path = os.path.join(self.raw_dir, f"{datetime.datetime.now():%Y-%m-%d}.jsonl")
        with open(path, "a", encoding="utf-8") as f:
            for p in posts:
                f.write(json.dumps(p, ensure_ascii=False) + "\n")
        logger.info(f"Stored {len(posts)} new posts in {os.path.basename(path)}")

    def run_cycle(self) -> Dict:
        """Collect -> store -> process. Safe to call concurrently (manual scrape vs scheduler)."""
        if not self.lock.acquire(blocking=False):
            logger.info("A scrape cycle is already running; skipping.")
            return {"skipped": True}
        try:
            logger.info("Starting scrape cycle...")
            new_posts, status = self.collect()
            self.store(new_posts)
            atomic_write(os.path.join(self.processed_dir, "sources.json"), status)
            process_raw_files(self.data_dir)
            return {"new_posts": len(new_posts), "sources": status}
        finally:
            self.lock.release()


def start_scheduler() -> Scraper:
    scraper = Scraper()
    scheduler = BackgroundScheduler()
    interval = scraper.config.get("scrape_interval_seconds", 300)
    scheduler.add_job(scraper.run_cycle, "interval", seconds=interval,
                      next_run_time=datetime.datetime.now(), max_instances=1, coalesce=True)
    scheduler.start()
    logger.info(f"Scheduler started: every {interval}s (first run now).")
    return scraper


if __name__ == "__main__":
    print(json.dumps(Scraper().run_cycle(), indent=2, ensure_ascii=False))
