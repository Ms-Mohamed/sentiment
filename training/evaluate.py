"""
Evaluate the shipped model on YOUR hand-labeled sample of real posts.

    pip install -r backend/requirements.txt
    python training/evaluate.py --labeled training/labeled.csv

Prints per-class precision / recall / F1, a confusion matrix, and per-source / per-language accuracy,
and writes docs/EVALUATION.md. Only numbers produced by this script should be quoted anywhere
(README, portfolio, report).
"""
import argparse, csv, datetime, os, sys, warnings
from collections import Counter, defaultdict

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "backend"))
import mapper  # noqa: E402

LABELS = ["negative", "neutral", "positive"]


def predict(text):
    probas = mapper.MODEL_FINAL.predict_proba([text])[0]
    idx = mapper.CLASS_INDEX
    return max(LABELS, key=lambda l: probas[idx[l]])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--labeled", default=os.path.join(HERE, "labeled.csv"))
    ap.add_argument("--report", default=os.path.join(HERE, "..", "docs", "EVALUATION.md"))
    a = ap.parse_args()
    if mapper.MODEL_FINAL is None:
        raise SystemExit("Model could not be loaded (check scikit-learn version in requirements.txt).")

    rows = [r for r in csv.DictReader(open(a.labeled, encoding="utf-8")) if r["label"].strip()]
    bad = [r["label"] for r in rows if r["label"].strip().lower() not in LABELS]
    if bad:
        raise SystemExit(f"Invalid labels found: {set(bad)}. Use only {LABELS}.")
    if len(rows) < 100:
        print(f"WARNING: only {len(rows)} labeled rows; per-class numbers will be noisy.")

    y_true = [r["label"].strip().lower() for r in rows]
    y_pred = [predict(r["text"]) for r in rows]

    from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
    rep = classification_report(y_true, y_pred, labels=LABELS, digits=3, zero_division=0)
    cm = confusion_matrix(y_true, y_pred, labels=LABELS)
    acc = accuracy_score(y_true, y_pred)

    groups = defaultdict(lambda: [0, 0])
    for r, t, p in zip(rows, y_true, y_pred):
        for key in (f"source={r['source']}", f"lang={r['lang'] or 'und'}"):
            groups[key][0] += int(t == p); groups[key][1] += 1

    dist = Counter(y_true)
    lines = [
        "# Model evaluation", "",
        f"_Generated {datetime.date.today()} by `training/evaluate.py` on {len(rows)} hand-labeled real posts "
        f"(label distribution: {dict(dist)})._", "",
        "## Classification report", "", "```", rep.rstrip(), "```", "",
        "## Confusion matrix (rows = true, columns = predicted)", "", "```",
        "            " + " ".join(f"{l:>9}" for l in LABELS),
        *[f"{LABELS[i]:>10}  " + " ".join(f"{v:>9}" for v in cm[i]) for i in range(3)], "```", "",
        f"Accuracy: **{acc:.3f}**", "",
        "## Accuracy by slice", "",
        *[f"- {k}: {c}/{n} = {c / n:.3f}" for k, (c, n) in sorted(groups.items())], "",
        "## How to read this", "",
        "- Labels were assigned by hand before looking at predictions.",
        "- A sample this size has wide error bars; do not over-interpret differences of a few points.",
        "- News headlines are mostly neutral in tone; if `neutral` recall is low, the model is reading factual headlines as polarized.",
    ]
    os.makedirs(os.path.dirname(a.report), exist_ok=True)
    open(a.report, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"\nReport written to {a.report}")


if __name__ == "__main__":
    main()
