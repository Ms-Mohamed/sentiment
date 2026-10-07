"""
Draw a random sample of REAL collected posts into a CSV you label by hand.

    python training/make_label_sample.py --n 300 --out training/to_label.csv

Open the CSV, fill the `label` column with: negative | neutral | positive, save it as
training/labeled.csv, then run training/evaluate.py. Label BEFORE looking at the model's predictions
(the CSV deliberately does not contain them).
"""
import argparse, csv, glob, json, os, random

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "..", "backend", "data", "raw")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=300)
    ap.add_argument("--out", default=os.path.join(HERE, "to_label.csv"))
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--raw", default=RAW, help="folder with collected *.jsonl")
    a = ap.parse_args()

    posts, seen = [], set()
    for fn in sorted(glob.glob(os.path.join(a.raw, "*.jsonl"))):
        with open(fn, encoding="utf-8", errors="ignore") as f:
            for line in f:
                try:
                    p = json.loads(line)
                except Exception:
                    continue
                if p.get("source") in ("reddit", "news") and p.get("post_id") not in seen and len(p.get("text", "")) >= 15:
                    seen.add(p["post_id"]); posts.append(p)
    if not posts:
        raise SystemExit("No collected posts yet. Start the backend and let it collect for a few days first.")

    random.Random(a.seed).shuffle(posts)
    # keep the source mix balanced so the evaluation is not 100% news headlines
    by = {}
    for p in posts:
        by.setdefault(p["source"], []).append(p)
    sample, i = [], 0
    while len(sample) < min(a.n, len(posts)):
        for src in list(by):
            if by[src] and len(sample) < a.n:
                sample.append(by[src].pop())
        if not any(by.values()):
            break
    with open(a.out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["post_id", "source", "lang", "text", "label"])
        for p in sample:
            w.writerow([p["post_id"], p["source"], p.get("lang", ""), p["text"].replace("\n", " "), ""])
    print(f"Wrote {len(sample)} posts to {a.out}. Fill the 'label' column (negative|neutral|positive).")


if __name__ == "__main__":
    main()
