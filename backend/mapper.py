#!/usr/bin/env python3
import sys
import io
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8', errors='replace')
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import json
import os
import string
import re

# AFINN-111 Wordlist + 50 Arabic/Moroccan Sentiment Words
AFINN_111 = {
    "abandon": -2, "abilities": 2, "ability": 2, "aboard": 1, "abuse": -3, "accept": 1,
    "accident": -2, "admire": 3, "angry": -3, "bad": -3, "good": 3,
    "زوين": 3, "خايب": -3, "مزيان": 2, "بزااف": 1, "فرحان": 3, "مقلق": -2, "غزال": 3, "فن": 3, "حشومة": -2, "كذوب": -3,
    "الله يحفظ": 2, "تبارك الله": 3, "ما شاء الله": 3, "برافو": 3, "منور": 2, "توحشناك": 2, "حب": 3, "كره": -3, "عجبني": 2, "بغيت": 1,
    "مرض": -2, "موت": -3, "خوف": -2, "بكي": -2, "ضحك": 3, "وناسة": 3, "سعادة": 3, "راحة": 2, "مشكل": -2, "صعيب": -1,
    "سهل": 1, "قوي": 2, "ضعيف": -2, "غالي": -1, "رخيص": 1, "نقي": 2, "وسخ": -2, "جوع": -1, "شبعان": 1, "عطشان": -1,
    "حمق": 2, "سطي": 2, "بسل": -2, "عيان": -1, "مرتاح": 2, "مهم": 1, "تافه": -2, "رائع": 3, "ممتاز": 3, "خطر": -2,
    "zween": 3, "zwin": 3, "zweena": 3, "zwina": 3, "khayb": -3, "khaib": -3, "khayba": -3, "khaiba": -3,
    "dima": 2, "choukran": 2, "shokran": 2, "walo": -1, "walou": -1, "bezzaf": 1, "besaf": 1,
    "mzyan": 2, "mezian": 2, "hshouma": -2, "chouha": -3, "ghzal": 3, "ghzala": 3,
    "superbe": 4, "magnifique": 4, "incroyable": 4, "excellent": 4, "bravo": 3, "bien": 2, "top": 3, "merci": 2,
    "insupportable": -3, "nul": -3, "déception": -3, "mauvais": -2, "problème": -2, "difficile": -2, "catastrophe": -4,
    "beau": 2, "belle": 2, "adoré": 4, "aimé": 3, "plaisir": 3, "bonheur": 4, "génial": 4, "parfait": 4, "ravie": 3,
}

# Try loading the model, but fall back gracefully to the lexicon.
# NOTE: inside a Hadoop container this import fails unless scikit-learn is installed there;
# every scored post therefore carries "scorer": "ml" | "lexicon" so you can SEE which one ran.
MODEL_FINAL = None
CLASS_INDEX = {"negative": 0, "neutral": 1, "positive": 2}
try:
    import joblib
    # Resolve the path dynamically so it works locally, in Docker and on the Hadoop node.
    model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Model final.joblib')
    if os.path.exists(model_path):
        MODEL_FINAL = joblib.load(model_path)
        if hasattr(MODEL_FINAL, "classes_"):
            CLASS_INDEX = {str(c): i for i, c in enumerate(MODEL_FINAL.classes_)}
except Exception:
    MODEL_FINAL = None

def score_text(text: str) -> float:
    if not text: return 0.0
    text_clean_contractions = re.sub(r"\b(j|l|d|s|c|m|t|qu)'", " ", text, flags=re.IGNORECASE)
    text_clean = text_clean_contractions.translate(str.maketrans('', '', string.punctuation))
    words = text_clean.lower().split()
    score = 0
    match_count = 0

    for word in words:
        w = word.strip()
        if not w or w == "pays": continue
        if w in AFINN_111:
            score += AFINN_111[w]
            match_count += 1

    if match_count == 0: return 0.0
    normalized = score / (match_count * 5.0)
    return max(-1.0, min(1.0, normalized))

def classify_emotion(text: str, score: float) -> str:
    text_lower = text.lower()
    if any(k in text_lower for k in ["dima", "maghrib", "stade", "match", "gagne", "victoire", "joie", "fierte", "fier", "bravo", "splendide", "magnifique", "parfait", "zween", "ghzal", "tbarkallah", "top"]):
        return "Pride/Joy"
    if any(k in text_lower for k in ["prix", "carburant", "inflation", "chomage", "secheresse", "insupportable", "nul", "mauvais", "hshouma", "chouha", "khayb"]):
        return "Grievance"
    if any(k in text_lower for k in ["probleme", "panne", "retard", "accident", "coupure", "eau", "glitch", "danger", "erreur", "souci"]):
        return "Concern"
    if any(k in text_lower for k in ["oasis", "detente", "calme", "plage", "beaute", "merveilleux", "the", "atay", "foret", "voyage"]):
        return "Peace"
        
    if score > 0.3: return "Pride/Joy"
    elif score < -0.3: return "Grievance"
    return "Neutral"

def score_post(post: dict) -> dict:
    """Add raw_score, emotion and scorer to a post. Shared by the Hadoop mapper and the speed layer."""
    text = post.get("text", "")
    if MODEL_FINAL is not None and text.strip():
        probas = MODEL_FINAL.predict_proba([text])[0]
        prob_neg = probas[CLASS_INDEX.get("negative", 0)]
        prob_pos = probas[CLASS_INDEX.get("positive", 2)]
        raw_score = float(prob_pos - prob_neg)

        if prob_pos > 0.45: emotion = "Pride/Joy"
        elif prob_neg > 0.45: emotion = "Grievance"
        elif raw_score < -0.15: emotion = "Concern"
        elif raw_score > 0.15: emotion = "Peace"
        else: emotion = "Neutral"
        post["scorer"] = "ml"
    else:
        raw_score = score_text(text)
        emotion = classify_emotion(text, raw_score)
        post["scorer"] = "lexicon"
    post["raw_score"] = raw_score
    post["emotion"] = emotion
    return post


if __name__ == '__main__':
    for line in sys.stdin:
        line = line.strip()
        if not line: continue

        try:
            post = score_post(json.loads(line))
            region = post.get("region", "Unknown")
            # Emit Key-Value pair for Reducer: Region \t JSON_POST
            print("{}\t{}".format(json.dumps(region), json.dumps(post)))
        except Exception as e:
            sys.stderr.write("reporter:counter:sentiment,bad_records,1\n")
