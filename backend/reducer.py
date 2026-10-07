#!/usr/bin/env python3
import sys
import io
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8', errors='replace')
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import json

current_region = None
region_data = None

def init_region_data():
    return {
        "score": 0.0, 
        "count": 0, 
        "total_posts": 0,
        "emotions": {
            "Pride/Joy": 0,
            "Grievance": 0,
            "Concern": 0,
            "Peace": 0,
            "Neutral": 0
        }
    }

def output_region(region, data):
    if region and region != "Unknown":
        print(json.dumps({"type": "region", "data": {region: data}}))

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
        
    try:
        region_json, post_json = line.split('\t', 1)
        region = json.loads(region_json)
        post = json.loads(post_json)
        
        # Output the individual scored post for the backend feed/velocity
        print(json.dumps({"type": "post", "data": post}))
        
        if current_region != region:
            if current_region is not None:
                output_region(current_region, region_data)
            current_region = region
            region_data = init_region_data()
            
        region_data["total_posts"] += 1
        raw_score = post.get("raw_score", 0.0)
        
        if raw_score != 0.0:
            region_data["score"] += raw_score
            region_data["count"] += 1
            
        emotion = post.get("emotion", "Neutral")
        if emotion in region_data["emotions"]:
            region_data["emotions"][emotion] += 1
            
    except Exception as e:
        pass

# Output the last region
if current_region is not None:
    output_region(current_region, region_data)
