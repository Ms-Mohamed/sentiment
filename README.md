# SentimentAI Morocco

Sentiment and topic monitoring of Moroccan online conversation (French, Arabic, darija/arabizi), built as a
Big Data pipeline: **Hadoop Streaming (MapReduce) + scikit-learn + FastAPI + Leaflet dashboard**.

> **What is real, what is not** (read this before quoting any number from this project)
> - Data is collected from **free public sources only**: Reddit RSS (r/Morocco posts and comments; not verified from my build environment, which blocks reddit.com, so check `/api/sources` on your machine) and Moroccan news RSS feeds (Hespress FR/AR, Médias24, Yabiladi: verified as valid RSS; see `backend/config.yaml`). No Twitter/X (the API is paid), and **no synthetic or simulated posts** anywhere in the pipeline.
> - A post gets a **region only if its text names a Moroccan city/region**. Everything else is `National`. The regional map is therefore sparse by design.
> - Every figure in `pipeline.json` (record counts, durations) is **measured**. If Docker/Hadoop is not running, the batch job runs the same `mapper.py`/`reducer.py` locally and says so (`engine: local-streaming`).
> - Each scored post carries `scorer: ml | lexicon` so you can see whether the ML model or the small lexicon fallback produced the score.
> - Model quality is whatever `training/evaluate.py` measures on **your own hand-labeled sample** (`docs/EVALUATION.md`). Figures in the original academic report (`SentimentAI_Morocco_Rapport.*`) predate this version and used simulated data; they are superseded.

## Architecture

```
 Reddit RSS ─┐                      ┌──────── BATCH layer (every batch_interval_seconds) ────────┐
             ├─► scraper.py ─► data/raw/*.jsonl ─► clean/dedup ─► Hadoop Streaming: mapper.py ─► sort ─► reducer.py ─┐
 News RSS ───┘   (dedup, real dates,                                (or the same scripts locally)                    │
                  region = city mention)        └─► SPEED layer: new posts scored in-process (same model) ───────────┤
                                                                                                                       ▼
                                           terms/hashtags · subjects · alerts · velocity ─► data/processed/*.json ─► FastAPI ─► dashboard
```

| Stage (pipeline.json) | What actually runs |
|---|---|
| 1 Nettoyage | JSON/field validation, source allow-list, de-duplication by `post_id` |
| 2 NLP Sentiment | Batch: Hadoop Streaming job (map: score + emotion, reduce: per-region aggregation). Between batches: in-process scoring |
| 3 Hashtags | Real `#hashtags` first, then most frequent terms (no hashtag is ever generated) |
| 4 Anomalies | Source down, volume spike vs previous days, regional negative drift (≥5 posts), scorer-fallback warning |
| 5 Vélocité | Day-over-day change of mean sentiment, by publication date |

The "Injecter une panne (démo)" button only marks stage 4 as failed to demonstrate the dashboard's error state; it does not crash any process.
The "Rejeu" slider calls `/api/replay?hours=N`, which recomputes the heatmap/feed from posts that had actually been published N hours ago.

## Model

`backend/Model final.joblib`: scikit-learn `Pipeline` = `FeatureUnion(TF-IDF word 1-2-grams (50k) + TF-IDF char_wb 3-6-grams (70k))` → `LogisticRegression(C=2, class_weight=balanced, saga)`, classes `negative/neutral/positive`.
Score = `P(positive) − P(negative)`. Saved with scikit-learn 1.7.2 (pinned in `requirements.txt`).
The training data and training script are **not** in this repository, so the model is used as a given artifact; add them under `training/` to make it reproducible.

Known limitations: trained on informal text; factual news headlines are often scored as polarized instead of neutral; sarcasm and darija code-switching are weak spots. Measure, don't assume (see below).

## Run

```bash
pip install -r backend/requirements.txt
cd backend && uvicorn main:app --port 8000        # dashboard on http://localhost:8000
```

The collector starts immediately and then every `scrape_interval_seconds`. `GET /api/sources` shows, per feed, whether the last fetch worked and how many new posts it brought. A feed that fails is skipped and reported; edit feed URLs in `config.yaml`.

With Hadoop (4 DataNodes, YARN, history server):

```bash
docker compose up -d           # first start takes a few minutes
```

> **Check this once:** the mapper runs inside the Hadoop workers, which need `scikit-learn` and the model file to use the ML scorer. If they don't have them, `mapper.py` silently falls back to the lexicon. The pipeline's stage-2 detail (`scorers={...}`) and the `SCORER_FALLBACK` alert tell you which one ran.

Manual scrape: `curl -X POST http://localhost:8000/api/scrape/now`

## Measure the model (do this before quoting any metric)

```bash
python training/make_label_sample.py --n 300      # after a few days of collection
# fill the `label` column (negative|neutral|positive) in training/to_label.csv, save as training/labeled.csv
python training/evaluate.py                       # writes docs/EVALUATION.md
```

## Tests

```bash
pip install pytest httpx
python -m pytest tests -q
```

Covered: RSS/Atom parsing, region inference, de-duplication across cycles and restarts, source-failure isolation, partial-line reads, batch vs speed layer, reducer output vs pure-Python recomputation, failure injection, alerts, replay endpoint.

## Data & privacy

Collected posts are public RSS content; `backend/data/` is git-ignored and stays on your machine.
