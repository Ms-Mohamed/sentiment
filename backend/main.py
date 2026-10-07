"""
FastAPI application for serving sentiment analysis results and managing scraping.
"""

import os
os.environ["PYTHONWARNINGS"] = "ignore"

import json
import yaml
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, BackgroundTasks, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from scraper import start_scheduler
from sentiment_processor import process_raw_files

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DASHBOARD_DIR = os.path.join(BASE_DIR, "../dashboard")

# Load config
with open(os.path.join(BASE_DIR, "config.yaml"), 'r') as f:
    config = yaml.safe_load(f)

data_dir = os.path.join(BASE_DIR, config.get("data_dir", "data"))
processed_dir = os.path.join(data_dir, "processed")

# Global scraper instance
scraper_instance = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan event for startup and shutdown.
    """
    global scraper_instance
    logger.info("Starting up...")
    scraper_instance = start_scheduler()
    yield
    logger.info("Shutting down...")

app = FastAPI(lifespan=lifespan)

# The dashboard is served by this same app, so only local origins need CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[f"http://localhost:{config.get('port', 8000)}", f"http://127.0.0.1:{config.get('port', 8000)}"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

API_CACHE = {}

def get_processed_data(filename: str):
    """
    Reads a JSON file from the processed data directory.
    Uses in-memory cache to prevent excessive disk I/O.
    """
    path = os.path.join(processed_dir, filename)
    if not os.path.exists(path):
        if "heatmap" in filename: return {}
        if "pipeline" in filename: 
            return [{"job":i+1,"name":name,"status":"pending","records_in":0,"records_out":0,"duration_ms":None} 
                    for i, name in enumerate(["Nettoyage", "NLP Sentiment", "Hashtags", "Anomalies", "Vélocité ★"])]
        return []
    
    try:
        mtime = os.path.getmtime(path)
        if filename in API_CACHE and API_CACHE[filename]["mtime"] == mtime:
            return API_CACHE[filename]["data"]
            
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            API_CACHE[filename] = {"mtime": mtime, "data": data}
            return data
    except Exception as e:
        logger.error(f"Error reading {filename}: {e}")
        return {} if "heatmap" in filename else []

# API Endpoints

@app.get("/api/feed")
async def get_feed():
    """
    Returns the latest processed social media posts.
    """
    data = get_processed_data("feed.json")
    return JSONResponse(content=data, headers={"Cache-Control": "no-store"})

@app.get("/api/heatmap")
async def get_heatmap():
    """
    Returns sentiment scores aggregated by Morocco region.
    """
    data = get_processed_data("heatmap.json")
    return JSONResponse(content=data, headers={"Cache-Control": "no-store"})

@app.get("/api/velocity")
async def get_velocity():
    """
    Returns sentiment velocity metrics over time.
    """
    data = get_processed_data("velocity.json")
    return JSONResponse(content=data, headers={"Cache-Control": "no-store"})

@app.get("/api/alerts")
async def get_alerts():
    """
    Returns active trend alerts and anomalies.
    """
    data = get_processed_data("alerts.json")
    return JSONResponse(content=data, headers={"Cache-Control": "no-store"})

@app.get("/api/hashtags")
async def get_hashtags():
    """
    Returns the top trending hashtags.
    """
    data = get_processed_data("hashtags.json")
    return JSONResponse(content=data, headers={"Cache-Control": "no-store"})

@app.get("/api/subjects")
async def get_subjects():
    """
    Returns the top 5 dynamic subjects analyzed from posts.
    """
    data = get_processed_data("subjects.json")
    return JSONResponse(content=data, headers={"Cache-Control": "no-store"})

@app.get("/api/pipeline")
async def get_pipeline():
    """
    Returns the status of the MapReduce processing pipeline stages.
    """
    data = get_processed_data("pipeline.json")
    return JSONResponse(content=data, headers={"Cache-Control": "no-store"})

@app.get("/api/sources")
async def get_sources():
    """
    Per-source collector status (last fetch, new posts, errors). Lets you see exactly what is real and what is down.
    """
    data = get_processed_data("sources.json")
    return JSONResponse(content=data, headers={"Cache-Control": "no-store"})

@app.get("/api/replay")
async def replay(hours: int = 0):
    """
    What the dashboard would have shown `hours` ago: heatmap and feed computed only from posts
    published before that moment. Real history, nothing simulated.
    """
    import datetime
    import sentiment_processor as sp
    hours = max(0, min(int(hours), 24 * 30))
    cutoff = datetime.datetime.now() - datetime.timedelta(hours=hours)
    posts = [p for p in sp.STATE["posts"] if p["created_at"] <= cutoff.isoformat()]
    feed = sorted(posts, key=lambda x: x["created_at"], reverse=True)[:50]
    return JSONResponse(content={"hours": hours, "posts_considered": len(posts),
                                 "heatmap": sp.compute_heatmap(posts), "feed": feed},
                        headers={"Cache-Control": "no-store"})

@app.post("/api/scrape/now")
async def trigger_scrape(background_tasks: BackgroundTasks):
    """
    Triggers an immediate scraping cycle in the background.
    """
    if scraper_instance:
        background_tasks.add_task(scraper_instance.run_cycle)
        return {"status": "started"}
    return {"status": "error", "message": "Scraper not initialized"}

@app.post("/api/pipeline/crash")
async def crash_pipeline():
    """
    Failure-injection DEMO: marks stage 4 (Anomalies) as failed so the dashboard's error handling can be shown.
    This does not crash any real process.
    """
    logger.warning("Failure injection: stage 4 will be reported as failed (demo).")
    with open(os.path.join(data_dir, ".pipeline_failed"), "w") as f:
        f.write("failed")
    
    # Recalculate metrics immediately to reflect changes instantly
    process_raw_files(data_dir)
    return {"status": "crashed", "message": "Failure injected on stage 4 (demo)."}

@app.post("/api/pipeline/restore")
async def restore_pipeline():
    """
    Restores the crashed MapReduce pipeline to normal operation.
    """
    logger.info("Failure injection cleared.")
    failed_path = os.path.join(data_dir, ".pipeline_failed")
    if os.path.exists(failed_path):
        os.remove(failed_path)
    
    # Recalculate metrics immediately to reflect changes instantly
    process_raw_files(data_dir)
    return {"status": "restored", "message": "Pipeline restored to done status."}

from pydantic import BaseModel
class NLPTestRequest(BaseModel):
    text: str

@app.post("/api/test-nlp")
async def test_nlp(request: NLPTestRequest):
    """
    Scores a user-provided string with the same code path as the pipeline. `scorer` says whether the ML model or the lexicon fallback answered.
    """
    import mapper
    post = mapper.score_post({"text": request.text})
    return {"text": request.text, "score": post["raw_score"], "emotion": post["emotion"], "scorer": post["scorer"]}

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)

# Serve dashboard root
@app.get("/")
async def serve_dashboard():
    return FileResponse(os.path.join(DASHBOARD_DIR, "index.html"))

# Mount Static Files for CSS/JS
app.mount("/", StaticFiles(directory=DASHBOARD_DIR), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=config.get("port", 8000))
