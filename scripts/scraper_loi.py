import requests
from bs4 import BeautifulSoup
import hashlib
import time
import os
import subprocess # Pour lancer l'ingestion automatiquement

# Configuration
URL_MONITORING = "https://www.sgg.gov.ma/fr/Lois.aspx" # Lien à adapter
HASH_FILE = "data/last_hash.txt"
CHECK_INTERVAL = 86400  # 24 heures en secondes

def get_page_hash(url):
    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        # On cible le contenu principal pour éviter les faux positifs (dates, compteurs)
        content = soup.find('body').get_text()
        return hashlib.md5(content.encode('utf-8')).hexdigest()
    except Exception as e:
        print(f"❌ Erreur Scraping : {e}")
        return None

def run_update_pipeline():
    """Lance le processus de nettoyage et mise à jour de la base de données."""
    print("🚀 Changement détecté ! Lancement du pipeline de mise à jour...")
    
    # On appelle ton script d'ingestion existant
    try:
        # Remplace par le chemin correct vers ton python si nécessaire
        subprocess.run(["python", "scripts/ingection.py"], check=True)
        print("✅ Base de données Pinecone mise à jour avec succès.")
    except Exception as e:
        print(f"❌ Erreur lors de la mise à jour automatique : {e}")

def monitor_laws():
    print(f"📡 Veille juridique activée (Fréquence : 24h)")
    
    while True:
        current_hash = get_page_hash(URL_MONITORING)
        
        if current_hash:
            if not os.path.exists(HASH_FILE):
                with open(HASH_FILE, "w") as f:
                    f.write(current_hash)
                print("📝 Première empreinte enregistrée.")
            else:
                with open(HASH_FILE, "r") as f:
                    last_hash = f.read().strip()
                
                if current_hash != last_hash:
                    run_update_pipeline()
                    with open(HASH_FILE, "w") as f:
                        f.write(current_hash)
                else:
                    print(f"🕒 {time.strftime('%Y-%m-%d %H:%M:%S')} - Aucune modification sur le site.")

        # Pause de 24 heures
        print(f"💤 Mise en veille pour 24h...")
        time.sleep(CHECK_INTERVAL)

if __name__ == "__main__":
    monitor_laws()