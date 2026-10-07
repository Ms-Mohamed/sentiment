"""
Scraper module for fetching social media data from Twitter and Reddit.
"""

import os
import json
import yaml
import logging
import datetime
import time
from typing import List, Dict
from apscheduler.schedulers.background import BackgroundScheduler
from region_inferrer import infer_region, REGION_KEYWORDS
from sentiment_processor import process_raw_files

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

import random

# Sample data for demo mode
DEMO_POSTS = [
    # Positive / Travel / Culture
    {"text": "Le trafic à Casablanca est vraiment insupportable ce matin #Casa #Maroc", "region": "Casablanca-Settat", "sentiment": -1},
    {"text": "Magnifique coucher de soleil sur la corniche de Tanger! La vue est splendide.", "region": "Tanger-Tétouan", "sentiment": 1},
    {"text": "Superbe weekend à Marrakech, la ville rouge ne déçoit jamais. J'ai adoré l'ambiance de Jemaa el-Fnaa.", "region": "Marrakech-Safi", "sentiment": 1},
    {"text": "Problèmes de connexion internet à Oujda, quelqu'un d'autre a ce souci?", "region": "Oriental", "sentiment": -1},
    {"text": "Les montagnes de l'Atlas sont couvertes de neige, vue incroyable depuis Errachidia. Un vrai paradis!", "region": "Drâa-Tafilalet", "sentiment": 1},
    {"text": "Nouveau projet de transport à Rabat, enfin du progrès pour désengorger la capitale!", "region": "Rabat-Salé", "sentiment": 1},
    {"text": "Fès est vraiment la capitale spirituelle du pays, j'adore l'ambiance et l'histoire de la médina.", "region": "Fès-Meknès", "sentiment": 1},
    {"text": "Il fait trop chaud à Agadir aujourd'hui, direction la plage pour un bon bain de mer.", "region": "Souss-Massa", "sentiment": 0},
    {"text": "Match incroyable hier soir, l'ambiance au stade était folle! Dima Maghrib!", "region": "Casablanca-Settat", "sentiment": 1},
    {"text": "Augmentation des prix du carburant et des légumes, c'est trop difficile pour le pouvoir d'achat.", "region": "National", "sentiment": -1},
    
    # Dynamic additions:
    {"text": "Ce vendredi c'est Couscous en famille! Le meilleur moment de la semaine #Couscous #Friday", "region": "National", "sentiment": 1},
    {"text": "Le tramway de Rabat-Salé est super propre et ponctuel, bravo aux équipes.", "region": "Rabat-Salé", "sentiment": 1},
    {"text": "Un thé à la menthe (Atay) bien chaud avec du 'chebakia' sous la pluie de Chefchaouen, que du bonheur!", "region": "Tanger-Tétouan", "sentiment": 1},
    {"text": "Session surf incroyable ce matin à Taghazout près d'Agadir. Les vagues sont parfaites!", "region": "Souss-Massa", "sentiment": 1},
    {"text": "Les coupures d'eau répétées dans certains villages de la région Drâa-Tafilalet inquiètent les habitants.", "region": "Drâa-Tafilalet", "sentiment": -1},
    {"text": "Le complexe d'énergie solaire Noor à Ouarzazate est une immense fierté nationale.", "region": "Drâa-Tafilalet", "sentiment": 1},
    {"text": "Les travaux de la ligne de TGV Al Boraq vers Marrakech avancent très vite, hâte de l'emprunter!", "region": "National", "sentiment": 1},
    {"text": "Grave accident sur l'autoroute entre Casa et Rabat, soyez prudents sur la route s'il vous plaît.", "region": "Casablanca-Settat", "sentiment": -1},
    {"text": "Inauguration d'un grand pôle universitaire d'excellence à Oujda, super nouvelle pour nos étudiants.", "region": "Oriental", "sentiment": 1},
    {"text": "Trop de mendicité et de harcèlement dans la médina de Marrakech, ça gâche l'expérience des touristes.", "region": "Marrakech-Safi", "sentiment": -1},
    {"text": "Très fier de la qualification historique du club en ligue des champions de la CAF #BotolaPro", "region": "National", "sentiment": 1},
    {"text": "Panne d'électricité générale dans plusieurs quartiers de Meknès hier soir, situation inadmissible.", "region": "Fès-Meknès", "sentiment": -1},
    {"text": "Visite insolite de l'ancienne médina de Fès, un labyrinthe chargé d'histoire millénaire.", "region": "Fès-Meknès", "sentiment": 1},
    {"text": "Les prix de la location immobilière à Casablanca deviennent délirants, impossible pour les jeunes de se loger.", "region": "Casablanca-Settat", "sentiment": -1},
    {"text": "Le festival Mawazine à Rabat ramène une ambiance festive extraordinaire dans la ville!", "region": "Rabat-Salé", "sentiment": 1},
    {"text": "Quel accueil chaleureux à Dakhla! Les gens sont d'une gentillesse incroyable.", "region": "Dakhla-Oued Ed-Dahab", "sentiment": 1},
    {"text": "Le vent souffle extrêmement fort aujourd'hui à Tanger, la traversée en ferry est reportée.", "region": "Tanger-Tétouan", "sentiment": -1},
    {"text": "Le chômage des jeunes diplômés reste un défi majeur, il faut plus de réformes économiques.", "region": "National", "sentiment": -1},
    {"text": "Une journée magnifique dans les forêts d'Ifrane, l'air frais fait tellement de bien.", "region": "Fès-Meknès", "sentiment": 1},
    {"text": "Dégradation flagrante de l'état des routes à Oujda, des nids de poule partout.", "region": "Oriental", "sentiment": -1},
    {"text": "Incroyable victoire de l'équipe nationale! Quelle joie immense dans toutes les rues du pays!", "region": "National", "sentiment": 1},
    {"text": "Gros retards enregistrés ce matin dans les gares ONCF, aucune explication donnée aux voyageurs.", "region": "National", "sentiment": -1},
    {"text": "Le marché de poisson d'Essaouira est magique, les sardines grillées sont délicieuses.", "region": "Marrakech-Safi", "sentiment": 1},
    {"text": "Le coût de la rentrée scolaire est extrêmement lourd pour les familles marocaines de classe moyenne.", "region": "National", "sentiment": -1},
    {"text": "Sublime weekend de détente dans les oasis de Figuig, calme et ressourcement total.", "region": "Oriental", "sentiment": 1},
    {"text": "Le soleil brille à Guelmim, la porte du désert! Une hospitalité inoubliable.", "region": "Guelmim-Oued Noun", "sentiment": 1},
    {"text": "Tempête de sable ce matin à Tan-Tan, la visibilité est très réduite sur la route.", "region": "Guelmim-Oued Noun", "sentiment": -1},
    {"text": "Superbe visite du port de Tarfaya et du musée Saint-Exupéry, chargé d'histoire.", "region": "Laâyoune-Sakia El Hamra", "sentiment": 1},
    {"text": "Développement incroyable des infrastructures à Laâyoune, la ville se transforme rapidement.", "region": "Laâyoune-Sakia El Hamra", "sentiment": 1},
    {"text": "Session de kitesurf spectaculaire dans la lagune de Dakhla, le vent est parfait!", "region": "Dakhla-Oued Ed-Dahab", "sentiment": 1},
    {"text": "Les cascades d'Ouzoud près d'Azilal sont magnifiques en cette saison! Un spectacle grandiose.", "region": "Béni Mellal-Khénifra", "sentiment": 1},
    {"text": "Problème d'irrigation pour l'agriculture dans la plaine de Béni Mellal à cause de la sécheresse.", "region": "Béni Mellal-Khénifra", "sentiment": -1},
    # Authentic Moroccan Arabizi/Darija (Latin) social posts
    {"text": "had l-ma7al f Casa zween bezzaf! Dima top!", "region": "Casablanca-Settat", "sentiment": 1},
    {"text": "had l-khdma li darou f Rabat meziana, choukran bezzaf!", "region": "Rabat-Salé", "sentiment": 1},
    {"text": "walo ma khtdem had l-app, fih glitches khayb bezzaf #walo", "region": "Fès-Meknès", "sentiment": -1},
    {"text": "dima maghrib! l-match dyal l-youm zween khtir!", "region": "National", "sentiment": 1},
    {"text": "l-guelssa hna f Agadir zwina bezzaf, atay rkhiss o l-mandar ghzal!", "region": "Souss-Massa", "sentiment": 1}
]

class Scraper:
    """
    Handles synthetic data generation for the project demo.
    """

    def __init__(self, config_path: str = "config.yaml"):
        # Make config_path absolute relative to this file
        if not os.path.isabs(config_path):
            base_dir = os.path.dirname(os.path.abspath(__file__))
            config_path = os.path.join(base_dir, config_path)
            
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
        self.data_dir = self.config.get("data_dir", "data")
        os.makedirs(os.path.join(self.data_dir, "raw"), exist_ok=True)

    def inject_hashtags(self, text: str) -> str:
        """Enriches post texts with relevant Moroccan hashtags based on keywords."""
        hashtags = ["#Maroc", "#Morocco"]
        
        t_lower = text.lower()
        if "casablanca" in t_lower or "casa" in t_lower:
            hashtags.extend(["#Casablanca", "#Casa"])
        if "marrakech" in t_lower:
            hashtags.extend(["#Marrakech", "#TravelMorocco"])
        if "tanger" in t_lower:
            hashtags.extend(["#Tanger", "#Tangier"])
        if "rabat" in t_lower:
            hashtags.extend(["#Rabat", "#Capital"])
        if "oujda" in t_lower:
            hashtags.extend(["#Oujda", "#Oriental"])
        if "atlas" in t_lower:
            hashtags.extend(["#Atlas", "#Nature"])
        if "fès" in t_lower or "fes" in t_lower:
            hashtags.extend(["#Fes", "#Medina"])
        if "agadir" in t_lower:
            hashtags.extend(["#Agadir", "#Beach"])
        if "match" in t_lower or "stade" in t_lower or "botola" in t_lower:
            hashtags.extend(["#Botola", "#Football", "#DimaMaghrib"])
        if "carburant" in t_lower or "prix" in t_lower:
            hashtags.extend(["#Economie", "#Inflation"])
        if "reddit" in t_lower:
            hashtags.extend(["#MoroccanReddit", "#Discussion"])
            
        selected = list(set(hashtags))
        random.shuffle(selected)
        return text + " " + " ".join(selected[:3])

    def generate_synthetic_traffic(self) -> List[Dict]:
        """Generates mock posts for demo volume."""
        posts = []
        for _ in range(random.randint(5, 10)):
            template = random.choice(DEMO_POSTS)
            text_with_hashtags = self.inject_hashtags(template["text"])
            posts.append({
                "post_id": f"sim_{random.getrandbits(32)}",
                "source": "simulated",
                "text": text_with_hashtags,
                "created_at": datetime.datetime.now().isoformat(),
                "region": template["region"],
                "lang": "fr",
                "raw_score": None
            })
        return posts

    def scrape_reddit(self) -> List[Dict]:
        """Fetches real Reddit posts from r/Morocco, falling back to mock data if it fails."""
        posts = []
        try:
            import urllib.request
            import xml.etree.ElementTree as ET
            req = urllib.request.Request(
                'https://www.reddit.com/r/Morocco/new/.rss?limit=10', 
                headers={'User-Agent': 'python:sentiment-app:v1.0 (by /u/researcher)'}
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                root = ET.fromstring(response.read().decode('utf-8'))
                
            ns = {'atom': 'http://www.w3.org/2005/Atom'}
            for entry in root.findall('atom:entry', ns):
                title_el = entry.find('atom:title', ns)
                if title_el is None or not title_el.text: continue
                title = title_el.text
                
                id_el = entry.find('atom:id', ns)
                post_id = id_el.text if id_el is not None else str(random.getrandbits(32))
                
                # Try to infer region, otherwise pick a random one for demo purposes
                inferred_region = infer_region(title)
                if not inferred_region:
                    # Fallback to random region so the map stays active
                    inferred_region = random.choice(list(REGION_KEYWORDS.keys()))
                
                posts.append({
                    "post_id": f"rd_{post_id}",
                    "source": "reddit",
                    "text": self.inject_hashtags(f"Reddit: {title}"),
                    "created_at": datetime.datetime.now().isoformat(),
                    "region": inferred_region,
                    "lang": "fr",
                    "raw_score": None
                })
        except Exception as e:
            logger.warning(f"Real Reddit scrape failed: {e}. No mock data will be injected.")
        return posts

    def run_cycle(self):
        """
        Runs a full scraping cycle and triggers sentiment processing.
        """
        logger.info("Starting scrape cycle...")
        posts = self.scrape_reddit()
        
        if not posts:
            logger.info("No new posts found this cycle.")
            return

        # Raw storage format /data/raw/YYYY-MM-DD.jsonl
        date_str = datetime.datetime.now().strftime("%Y-%m-%d")
        file_path = os.path.join(self.data_dir, "raw", f"{date_str}.jsonl")
        
        # Fast append without loading entire file into memory (Fix O(N^2) scaling)
        with open(file_path, 'a', encoding='utf-8') as f:
            for post in posts:
                f.write(json.dumps(post, ensure_ascii=False) + "\n")
        
        logger.info(f"Saved {len(posts)} posts to {file_path}")
        
        # Call processing immediately
        process_raw_files(self.data_dir)

def start_scheduler():
    """
    Starts the background scheduler for periodic scraping.
    """
    scraper = Scraper()
    scheduler = BackgroundScheduler()
    # APScheduler: run full scrape cycle every 60 seconds
    interval = scraper.config.get("scrape_interval_seconds", 60)
    scheduler.add_job(scraper.run_cycle, 'interval', seconds=interval)
    scheduler.start()
    logger.info(f"Scheduler started with interval {interval}s")
    return scraper

if __name__ == "__main__":
    s = Scraper()
    s.run_cycle()
