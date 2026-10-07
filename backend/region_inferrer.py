"""
Module for inferring Morocco regions from text using keyword mapping.
"""

from typing import Optional

# Mapping of regions to their prominent cities and variations
REGION_KEYWORDS = {
    "Tanger-Tétouan": ["tanger", "tétouan", "tangier", "tetouan", "chefchaouen", "larache", "ksar el kebir"],
    "Casablanca-Settat": ["casablanca", "casa", "settat", "mohammedia", "el jadida", "berrechid", "benslimane"],
    "Rabat-Salé": ["rabat", "salé", "temara", "kénitra", "skhirat", "khemisset"],
    "Fès-Meknès": ["fès", "fez", "meknès", "taza", "ifrane", "moulay yacoub", "sefrou"],
    "Marrakech-Safi": ["marrakech", "kech", "safi", "essaouira", "el kelaa des sraghna", "al haouz"],
    "Souss-Massa": ["agadir", "tiznit", "taroudant", "inezegane", "ait melloul", "tata"],
    "Oriental": ["oujda", "nador", "berkane", "taourirt", "guercif", "jerada", "figuig"],
    "Drâa-Tafilalet": ["errachidia", "ouarzazate", "midelt", "tinghir", "zagora"],
    "Guelmim-Oued Noun": ["guelmim", "tan-tan", "sidi ifni", "assa-zag", "tantan", "ifni"],
    "Laâyoune-Sakia El Hamra": ["laâyoune", "layoune", "smara", "boujdour", "tarfaya"],
    "Dakhla-Oued Ed-Dahab": ["dakhla", "oued ed-dahab", "aousserd", "dakhla-oued"],
    "Béni Mellal-Khénifra": ["béni mellal", "beni mellal", "khénifra", "khenifra", "khouribga", "azilal", "fquih ben salah"]
}

def infer_region(text: str) -> Optional[str]:
    """
    Infers the Morocco region from the provided text based on keyword matching.

    Args:
        text (str): The social media post content.

    Returns:
        Optional[str]: The name of the region if a match is found, otherwise None.
    """
    if not text:
        return None

    text_lower = text.lower()
    for region, keywords in REGION_KEYWORDS.items():
        if any(keyword in text_lower for keyword in keywords):
            return region
    
    return None
