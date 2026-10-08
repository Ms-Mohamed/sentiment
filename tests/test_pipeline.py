import os, json, datetime
import pytest

import scraper
import region_inferrer
import sentiment_processor as sp


def read(fixtures_dir, name):
    with open(os.path.join(fixtures_dir, name), "rb") as f:
        return f.read()


# ------------------------------------------------------------------ parsing
def test_parse_rss_news(fixtures_dir):
    posts = scraper.parse_feed(read(fixtures_dir, "news.rss"), "news", "news", "fr")
    assert len(posts) == 3                      # the 1-char title is dropped
    p = posts[0]
    assert p["source"] == "news" and p["kind"] == "news"
    assert "<p>" not in p["text"] and "&amp;" not in p["text"]          # double-escaped HTML cleaned
    assert p["text"].startswith("Trafic insupportable à Casablanca")
    assert p["region"] == "Casablanca-Settat"
    assert p["created_at"].startswith("2026-10-0")                       # real publication date, not "now"
    assert p["lang"] == "fr"
    assert posts[1]["lang"] == "ar" and posts[1]["region"] == "Casablanca-Settat"
    assert posts[2]["region"] == "National"                              # no place mentioned -> no guess


def test_parse_atom_reddit_comments(fixtures_dir):
    posts = scraper.parse_feed(read(fixtures_dir, "reddit_comments.atom"), "reddit", "reddit_comment")
    assert len(posts) == 2
    assert posts[0]["text"] == "had l-ma7al zween bezzaf, dima top!"    # body only, not "/u/someone on ..."
    assert posts[0]["created_at"].startswith("2026-10-06T")
    assert posts[0]["post_id"] != posts[1]["post_id"]


def test_post_ids_are_stable(fixtures_dir):
    a = scraper.parse_feed(read(fixtures_dir, "news.rss"), "news", "news")
    b = scraper.parse_feed(read(fixtures_dir, "news.rss"), "news", "news")
    assert [p["post_id"] for p in a] == [p["post_id"] for p in b]


# ------------------------------------------------------------------ regions
@pytest.mark.parametrize("text,expected", [
    ("Gros trafic à Rabat ce matin", "Rabat-Salé"),
    ("Superbe journée à Marrakech", "Marrakech-Safi"),
    ("وصول الوفد إلى مدينة وجدة", "Oriental"),
    ("Big data pipeline update", None),           # 'tata'/'casa' must not match inside other words
    ("Les données de la metatata", None),
    ("Un commentaire sans lieu", None),
    ("Je suis à Tanger, pas à Casa", None),       # tie between two regions is resolved below
])
def test_infer_region(text, expected):
    got = region_inferrer.infer_region(text)
    if text.startswith("Je suis"):
        assert got in ("Tanger-Tétouan", "Casablanca-Settat")
    else:
        assert got == expected


# ------------------------------------------------------------------ collector
class FakeScraper(scraper.Scraper):
    def __init__(self, cfg_path, fixtures_dir):
        super().__init__(cfg_path)
        self.fixtures_dir = fixtures_dir
    def fetch(self, url):
        if "broken" in url:
            raise OSError("boom")
        return read(self.fixtures_dir, "reddit_comments.atom" if "reddit" in url else "news.rss")


@pytest.fixture
def cfg(tmp_path):
    p = tmp_path / "config.yaml"
    p.write_text(
        f"data_dir: '{tmp_path / 'data'}'\n"
        "reddit: {subreddits: [Morocco], posts_limit: 5, comments_limit: 5}\n"
        "news_feeds:\n"
        "  - {name: ok_feed, url: 'https://ok.example/feed', lang: fr}\n"
        "  - {name: broken_feed, url: 'https://broken.example/feed', lang: fr}\n",
        encoding="utf-8")
    return str(p)


def test_collector_dedups_isolates_failures_and_survives_restart(cfg, fixtures_dir, monkeypatch):
    monkeypatch.setattr(sp, "process_raw_files", lambda *a, **k: None)
    monkeypatch.setattr(scraper, "process_raw_files", lambda *a, **k: None)
    s = FakeScraper(cfg, fixtures_dir)
    res1 = s.run_cycle()
    status = {x["name"]: x for x in res1["sources"]}
    assert status["broken_feed"]["ok"] is False and "boom" in status["broken_feed"]["error"]
    assert status["ok_feed"]["ok"] is True
    n1 = res1["new_posts"]
    assert n1 > 0

    res2 = s.run_cycle()                       # same feeds again -> nothing new (old code re-appended everything)
    assert res2["new_posts"] == 0

    s2 = FakeScraper(cfg, fixtures_dir)        # "restart": ids reloaded from disk
    assert s2.run_cycle()["new_posts"] == 0

    lines = []
    for fn in os.listdir(s.raw_dir):
        lines += open(os.path.join(s.raw_dir, fn), encoding="utf-8").read().splitlines()
    assert len(lines) == n1 == len({json.loads(l)["post_id"] for l in lines})


# ------------------------------------------------------------------ processor
def write_raw(data_dir, name, rows, extra_lines=()):
    d = os.path.join(data_dir, "raw"); os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, name), "a", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
        for l in extra_lines:
            f.write(l + "\n")


def mk(i, text, region="National", source="reddit", days_ago=0):
    t = (datetime.datetime.now() - datetime.timedelta(days=days_ago, minutes=i)).isoformat()
    return {"post_id": f"{source}_{i}", "source": source, "text": text, "created_at": t, "region": region, "lang": "fr"}


def pipeline(data_dir):
    return {s["job"]: s for s in json.load(open(os.path.join(data_dir, "processed", "pipeline.json"), encoding="utf-8"))}


def test_processor_batch_then_speed_layer(tmp_path):
    data = str(tmp_path / "data")
    rows = [mk(1, "Le trafic à Casablanca est insupportable", "Casablanca-Settat"),
            mk(2, "Superbe weekend à Marrakech, j'ai adoré", "Marrakech-Safi"),
            mk(3, "zween bezzaf dima top", "Casablanca-Settat"),
            mk(4, "Nouvelle réunion du conseil", "National", days_ago=1),
            mk(1, "doublon du post 1 (même id)", "Casablanca-Settat"),          # duplicate id
            mk(9, "tweet inventé", "National", source="twitter"),               # not a real source
            mk(8, "   ", "National")]                                          # empty text
    write_raw(data, "2026-10-06.jsonl", rows, extra_lines=["{not json", ""])
    sp.process_raw_files(data)

    p = pipeline(data)
    assert all(p[i]["status"] == "done" for i in range(1, 6))
    assert p[1]["records_out"] == 4 and "duplicate=1" in p[1]["detail"] and "not_a_real_source=1" in p[1]["detail"]
    assert p[2]["detail"].startswith("BATCH via local-streaming")           # no Docker here -> honest fallback
    assert p[2]["records_in"] == 4 and p[2]["records_out"] == 4
    assert all(s["duration_ms"] is not None for s in p.values())            # measured, not formulas

    # The Hadoop-style reducer output must equal the pure-python recomputation.
    heat = json.load(open(os.path.join(data, "processed", "heatmap.json"), encoding="utf-8"))
    ref = sp.compute_heatmap(sp.STATE["posts"])
    assert set(heat) == set(ref)
    for r in heat:
        assert heat[r]["count"] == ref[r]["count"]
        assert heat[r]["score"] == pytest.approx(ref[r]["score"])

    # every scored post says which scorer produced it
    assert {x["scorer"] for x in sp.STATE["posts"]} <= {"ml", "lexicon"}
    assert any(x["raw_score"] < 0 for x in sp.STATE["posts"] if "insupportable" in x["text"])

    # new data later -> speed layer, existing posts untouched
    write_raw(data, "2026-10-07.jsonl", [mk(20, "Panne de courant à Rabat", "Rabat-Salé")])
    sp.process_raw_files(data)
    p = pipeline(data)
    assert p[2]["detail"].startswith("SPEED layer") and p[2]["records_out"] == 1
    assert len(sp.STATE["posts"]) == 5
    assert "Rabat-Salé" in json.load(open(os.path.join(data, "processed", "heatmap.json"), encoding="utf-8"))

    # nothing new -> idempotent
    sp.process_raw_files(data)
    assert len(sp.STATE["posts"]) == 5


def test_partial_last_line_is_not_consumed(tmp_path):
    data = str(tmp_path / "data")
    write_raw(data, "d.jsonl", [mk(1, "Bonne nouvelle pour Rabat", "Rabat-Salé")])
    with open(os.path.join(data, "raw", "d.jsonl"), "a", encoding="utf-8") as f:
        f.write('{"post_id": "reddit_2", "sou')           # writer is mid-line
    sp.process_raw_files(data)
    assert len(sp.STATE["posts"]) == 1
    with open(os.path.join(data, "raw", "d.jsonl"), "a", encoding="utf-8") as f:   # writer finishes the line
        f.write('rce": "reddit", "text": "ligne complète maintenant", "created_at": "%s", "region": "National"}\n' % datetime.datetime.now().isoformat())
    sp.process_raw_files(data)
    assert len(sp.STATE["posts"]) == 2


def test_failure_injection_marks_stage4_error_and_stops_chain(tmp_path):
    data = str(tmp_path / "data")
    write_raw(data, "d.jsonl", [mk(1, "Texte quelconque sur la gare de Rabat", "Rabat-Salé")])
    os.makedirs(data, exist_ok=True)
    open(os.path.join(data, ".pipeline_failed"), "w").write("x")
    sp.process_raw_files(data)
    p = pipeline(data)
    assert p[4]["status"] == "error" and p[5]["status"] == "pending"
    alerts = json.load(open(os.path.join(data, "processed", "alerts.json"), encoding="utf-8"))
    assert alerts[0]["type"] == "PROCESS_CRITICAL" and "demo" in alerts[0]["message"].lower()


def test_alerts_use_real_numbers(tmp_path):
    now = datetime.datetime.now()
    posts = [{"text": "x", "created_at": (now - datetime.timedelta(days=d)).isoformat(), "scorer": "ml"} for d in (1, 1, 2, 2, 3, 3)]
    posts += [{"text": "y", "created_at": now.isoformat(), "scorer": "ml"} for _ in range(40)]
    heat = {"Oriental": {"score": -0.4, "count": 8, "total_posts": 8, "emotions": {}}}
    alerts = sp.compute_alerts(posts, heat, [{"name": "feedX", "ok": False, "error": "HTTP 403"}], now)
    types = {a["type"] for a in alerts}
    assert {"SOURCE_DOWN", "VOLUME_SPIKE", "REGIONAL_CRISIS"} <= types
    assert "+200%" not in json.dumps(alerts)
    quiet = sp.compute_alerts([{"text": "z", "created_at": now.isoformat(), "scorer": "ml"}], {}, [], now)
    assert quiet[0]["type"] == "SYSTEM_OK"


def test_terms_never_invent_hashtags():
    now = datetime.datetime.now()
    posts = [{"text": "Match de football à Rabat #Botola", "created_at": now.isoformat()},
             {"text": "Grève des transports, retards ONCF", "created_at": now.isoformat()}]
    terms = sp.compute_terms(posts, now)
    tags = [t["tag"] for t in terms if t["type"] == "hashtag"]
    assert tags == ["#botola"]
    assert all(t["tag"].startswith("#") or t["type"] == "term" for t in terms)


def test_subjects_match_whole_words_only():
    now = datetime.datetime.now().isoformat()
    posts = [{"post_id": "1", "source": "news", "text": "I think the other approach is fine", "created_at": now, "region": "National", "raw_score": 0.1, "emotion": "Neutral"}]
    assert all(s["count"] == 0 for s in sp.compute_subjects(posts))   # old code matched 'the' / 'app' inside random words


# ------------------------------------------------------------------ API
def test_replay_endpoint_uses_only_past_posts(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    monkeypatch.setattr("scraper.start_scheduler", lambda: None)
    import main
    now = datetime.datetime.now()
    old = {"post_id": "a", "text": "ancien", "created_at": (now - datetime.timedelta(hours=10)).isoformat(), "region": "Oriental", "raw_score": 0.5, "emotion": "Peace"}
    new = {"post_id": "b", "text": "récent", "created_at": now.isoformat(), "region": "Oriental", "raw_score": -0.5, "emotion": "Grievance"}
    sp.STATE["posts"] = [old, new]
    with TestClient(main.app) as c:
        r = c.get("/api/replay?hours=5").json()
        assert r["posts_considered"] == 1 and r["heatmap"]["Oriental"]["score"] == pytest.approx(0.5)
        r = c.get("/api/replay?hours=0").json()
        assert r["posts_considered"] == 2
        assert c.get("/api/sources").status_code == 200


def test_empty_corpus_still_reports_dead_sources(tmp_path):
    data = str(tmp_path / "data")
    os.makedirs(os.path.join(data, "processed"), exist_ok=True)
    json.dump([{"name": "feedX", "ok": False, "error": "HTTP 403"}], open(os.path.join(data, "processed", "sources.json"), "w"))
    sp.process_raw_files(data)
    alerts = json.load(open(os.path.join(data, "processed", "alerts.json"), encoding="utf-8"))
    assert alerts[0]["type"] == "SOURCE_DOWN" and "feedX" in alerts[0]["message"]


@pytest.mark.parametrize("raw,expected", [
    ("Looking for a repair shop in Rabat. submitted by /u/SnooDrawings7547 [link] [comments]",
     "Looking for a repair shop in Rabat."),
    ("Khot li 3ndo permis ?. submitted by /u/higma55 [link] [comments]", "Khot li 3ndo permis ?."),
    ("Texte sans pied de page", "Texte sans pied de page"),
    ("Merci /u/someone pour l'aide, submitted by the way", "Merci /u/someone pour l'aide, submitted by the way"),
])
def test_reddit_footer_is_stripped_without_touching_real_text(raw, expected):
    from scraper import strip_reddit_footer
    assert strip_reddit_footer(raw) == expected
