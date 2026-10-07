"""
Infer a Moroccan administrative region from text.

Only an explicit mention of a city/region counts (whole-word match). A post that
mentions no place gets no region: we never guess. Callers should treat None as
"national / unknown".
"""

import re
from typing import Optional

# Region -> cities / variants (Latin + Arabic script).
REGION_KEYWORDS = {
    "Tanger-Tétouan": ["tanger", "tétouan", "tetouan", "tangier", "chefchaouen", "larache", "ksar el kebir", "al hoceima",
                       "طنجة", "تطوان", "شفشاون", "العرائش", "الحسيمة"],
    "Casablanca-Settat": ["casablanca", "casa", "settat", "mohammedia", "el jadida", "berrechid", "benslimane",
                          "الدار البيضاء", "سطات", "المحمدية", "الجديدة"],
    "Rabat-Salé": ["rabat", "salé", "temara", "kénitra", "kenitra", "skhirat", "khemisset",
                   "الرباط", "سلا", "تمارة", "القنيطرة"],
    "Fès-Meknès": ["fès", "fes", "fez", "meknès", "meknes", "taza", "ifrane", "sefrou",
                   "فاس", "مكناس", "تازة", "إفران"],
    "Marrakech-Safi": ["marrakech", "kech", "safi", "essaouira", "kelaa des sraghna", "al haouz",
                       "مراكش", "آسفي", "الصويرة"],
    "Souss-Massa": ["agadir", "tiznit", "taroudant", "inezgane", "ait melloul", "taghazout",
                    "أكادير", "تيزنيت", "تارودانت"],
    "Oriental": ["oujda", "nador", "berkane", "taourirt", "guercif", "jerada", "figuig",
                 "وجدة", "الناظور", "بركان", "جرادة"],
    "Drâa-Tafilalet": ["errachidia", "ouarzazate", "midelt", "tinghir", "zagora",
                       "الرشيدية", "ورزازات", "ميدلت", "زاكورة"],
    "Guelmim-Oued Noun": ["guelmim", "tan-tan", "tantan", "sidi ifni",
                          "كلميم", "طانطان", "سيدي إفني"],
    "Laâyoune-Sakia El Hamra": ["laâyoune", "laayoune", "layoune", "smara", "boujdour", "tarfaya",
                               "العيون", "السمارة", "بوجدور", "طرفاية"],
    "Dakhla-Oued Ed-Dahab": ["dakhla", "oued ed-dahab", "aousserd", "الداخلة"],
    "Béni Mellal-Khénifra": ["béni mellal", "beni mellal", "khénifra", "khenifra", "khouribga", "azilal", "fquih ben salah",
                             "بني ملال", "خنيفرة", "خريبكة", "أزيلال"],
}

# Pre-compile one regex per region. \b does not work well with Arabic, so we use
# lookarounds on "word characters" (letters/digits, any script).
_WORD = r"[^\W_]"
_PATTERNS = {
    region: re.compile(
        r"(?<!" + _WORD + r")(?:" + "|".join(re.escape(k) for k in sorted(kws, key=len, reverse=True)) + r")(?!" + _WORD + r")",
        re.IGNORECASE,
    )
    for region, kws in REGION_KEYWORDS.items()
}


def infer_region(text: str) -> Optional[str]:
    """Return the region whose city is mentioned most often in `text`, else None."""
    if not text:
        return None
    best, best_n = None, 0
    for region, pat in _PATTERNS.items():
        n = len(pat.findall(text))
        if n > best_n:
            best, best_n = region, n
    return best
