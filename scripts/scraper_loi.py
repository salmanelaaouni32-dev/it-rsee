import requests
from bs4 import BeautifulSoup
import hashlib
import time
import os
import subprocess
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# --- CONFIGURATION ---
URL_MONITORING = "https://www.sgg.gov.ma/fr/Lois.aspx"
HASH_FILE = "data/last_hash.txt"
CHECK_INTERVAL = 86400  # 24 heures

# --- CONFIGURATION EMAIL (À remplir) ---
EMAIL_SENDER = "ton_email@gmail.com"
EMAIL_RECEIVER = "ton_email@gmail.com"
# Utilise un "Mot de passe d'application" Google, pas ton mot de passe normal
EMAIL_PASSWORD = "votre_mot_de_passe_application" 

def envoyer_alerte_email(url_concernee):
    """Envoie un mail de notification dès qu'une loi change."""
    msg = MIMEMultipart()
    msg['From'] = EMAIL_SENDER
    msg['To'] = EMAIL_RECEIVER
    msg['Subject'] = "🔔 MAJ JURIDIQUE : Nouveau contenu détecté"

    corps = f"""
    Bonjour,

    L'agent de veille a détecté un changement sur le site : {url_concernee}

    Actions effectuées :
    1. Scraping du nouveau contenu.
    2. Nettoyage des données.
    3. Mise à jour de la base de données vectorielle Pinecone.

    Votre assistant IA est désormais à jour avec les dernières dispositions légales.
    
    --
    Système de Veille Automatisé (PFE)
    """
    
    msg.attach(MIMEText(corps, 'plain'))

    try:
        # Connexion au serveur Gmail
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls() # Sécurisation de la connexion
        server.login(EMAIL_SENDER, EMAIL_PASSWORD)
        server.send_message(msg)
        server.quit()
        print("📧 Notification email envoyée avec succès !")
    except Exception as e:
        print(f"❌ Erreur lors de l'envoi de l'email : {e}")

def get_page_hash(url):
    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        content = soup.find('body').get_text()
        return hashlib.md5(content.encode('utf-8')).hexdigest()
    except Exception as e:
        print(f"❌ Erreur Scraping : {e}")
        return None

def run_update_pipeline():
    print("🚀 Changement détecté ! Lancement du pipeline de mise à jour...")
    
    try:
        # 1. On lance l'ingestion vers Pinecone
        subprocess.run(["python", "scripts/ingection.py"], check=True)
        print("✅ Base de données Pinecone mise à jour.")
        
        # 2. On envoie l'email de confirmation
        envoyer_alerte_email(URL_MONITORING)
        
    except Exception as e:
        print(f"❌ Erreur lors du cycle automatique : {e}")

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
                    # On met à jour le hash pour ne pas renvoyer de mail inutilement
                    with open(HASH_FILE, "w") as f:
                        f.write(current_hash)
                else:
                    print(f"🕒 {time.strftime('%Y-%m-%d %H:%M:%S')} - RAS (Site à jour).")

        time.sleep(CHECK_INTERVAL)

if __name__ == "__main__":
    monitor_laws()