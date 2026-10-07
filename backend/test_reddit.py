import urllib.request
import json

try:
    req = urllib.request.Request(
        'https://www.reddit.com/r/Morocco/new.json?limit=5', 
        headers={'User-Agent': 'python:sentiment_ai:1.0 (by /u/test)'}
    )
    with urllib.request.urlopen(req, timeout=5) as response:
        data = json.loads(response.read().decode('utf-8'))
        print("Success 1:", len(data.get('data', {}).get('children', [])))
except Exception as e:
    print("Fail 1:", e)

try:
    req = urllib.request.Request(
        'https://api.reddit.com/r/Morocco/new?limit=5', 
        headers={'User-Agent': 'python:sentiment_ai:1.0 (by /u/test)'}
    )
    with urllib.request.urlopen(req, timeout=5) as response:
        data = json.loads(response.read().decode('utf-8'))
        print("Success 2:", len(data.get('data', {}).get('children', [])))
except Exception as e:
    print("Fail 2:", e)
