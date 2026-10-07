# SentimentAI Morocco - Big Data Pipeline

## System Overview
This project is an end-to-end Big Data pipeline for real-time sentiment analysis and trend detection across Moroccan social media (Twitter and Reddit). It ingests live social streams, scores texts against an AFINN + custom Arabic/Moroccan sentiment dictionary, and detects regional velocity anomalies. The system visualizes these insights through a high-performance, GSAP-animated dashboard decoupling the heavy MapReduce logic from the real-time API.

## Architecture

```text
[ External Sources ]       [ Backend - Python ]             [ Data Layer ]          [ API Layer - FastAPI ]      [ Frontend - Vanilla JS/GSAP ]
                                                                                                            
   ( Simulated )             +--------------+                +------------+                                      +------------------+
        |                    |  scraper.py  | -------------> | /data/raw/ |                                      |   index.html     |
        +------------------> |              |                |   *.jsonl  |                                      | (Main Dashboard) |
                             +--------------+                +------------+                                      +--------+---------+
   ( Reddit )                       |                               |                                                     ^
        |                    +--------------+                +------------+                                               |
        +------------------> |  sentiment_  |                | /data/     |                                      +--------+---------+
                             |  processor.py| <------------- | processed/ |                                      |     main.js      |
                             +--------------+                | heatmap.js |                                      | (Orchestrator)   |
                                    |                        | feed.json  |                                      +--------+---------+
                             +--------------+                | velocity.j |             +-------------+                   |
                             |  region_     |                | alerts.js  | <---------  |   main.py   | <-----------------+
                             |  inferrer.py | -------------> | hashtags.j |             |  (FastAPI)  |          (Polls/Requests)
                             +--------------+                +------------+             +-------------+
```

## Prerequisites
- **Python**: Version 3.10+
- **Pip**: Python package manager
- **Reddit Account**: Required to generate PRAW credentials for live stream scraping (optional, falls back to simulated data).

## Installation
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```
2. Install the required Python dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```

## Configuration
Before running the system, you must configure your API tokens in `backend/config.yaml`.
- **Reddit**: Go to [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps), create a new app (script), and copy the Client ID and Secret. Place them under `reddit_client_id` and `reddit_client_secret`.
- **Other Settings**: You can adjust `scrape_interval_seconds` (default: 60) and the API `port`.

## Running
1. Navigate to the backend directory and start the FastAPI server:
   ```bash
   cd backend
   uvicorn main:app --reload --port 8000
   ```
2. Open your browser and navigate to the dashboard:
   [http://localhost:8000](http://localhost:8000)

## Manual Scrape Trigger
The system polls automatically every 60 seconds. To trigger an immediate scrape (ideal for live demos):
- **UI**: Click the "Scrape Now" refresh button on the top right of the dashboard.
- **CLI**: Run the following command:
  ```bash
  curl -X POST http://localhost:8000/api/scrape/now
  ```

## Connecting Real Hadoop Output
This backend currently simulates the final processing layer. To connect your real Java Hadoop MapReduce output:
1. Configure your Hadoop jobs to output JSON data.
2. Drop the generated JSON files directly into `backend/data/processed/` matching these exact formats:
   - `heatmap.json`: `{"Region Name": {"score": 0.5, "count": 100}, ...}`
   - `velocity.json`: `[{"time": "YYYY-MM-DD", "avg_sentiment": 0.1, "velocity": 0.05, "count": 50}, ...]`
   - `alerts.json`: `[{"id": 1, "type": "TREND_SPIKE", "message": "...", "timestamp": "ISO8601"}, ...]`
   - `feed.json`: `[{"post_id": "1", "source": "twitter", "text": "...", "created_at": "ISO8601", "region": "Casa", "raw_score": 0.8}, ...]`
   - `hashtags.json`: `[{"tag": "#Maroc", "count": 500, "trend": "up"}, ...]`

## Troubleshooting
- **Scraping Volume**: If Reddit blocks requests, the scraper automatically injects simulated Moroccan social posts to keep the dashboard active.
- **Reddit 403 Error**: Verify your `reddit_user_agent` in `config.yaml` is descriptive and accurate.
- **Map Not Showing**: The Leaflet map uses embedded GeoJSON and does not fetch external files. Check the browser console for JavaScript syntax errors.
- **No Data After Scrape**: Check the `backend/data/raw/` directory to ensure new `.jsonl` files are being generated. Verify network connectivity.
