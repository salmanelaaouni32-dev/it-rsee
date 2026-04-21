import sys
import os
sys.path.append(os.path.dirname(__file__))

from ingection import extract_clean_text, create_chunks
from database_setup import indexer_chunks

# 1. On définit les sources
pdf_path = r'C:\Users\c\Desktop\PROJET_PFE_IT_RSE\data\raw\loi-09-08-protection-donnees-personnelles.pdf' # Vérifiez le nom exact
source_name = "Loi 09-08 (Maroc)"

print(f"--- Début du traitement pour : {source_name} ---")

# 2. Extraction du texte propre
raw_text = extract_clean_text(pdf_path)

if raw_text:
    # 3. Création des chunks (morceaux)
    chunks = create_chunks(raw_text)
    print(f"Nombre de morceaux à envoyer : {len(chunks)}")

    # 4. Préparation des métadonnées pour chaque morceau
    # C'est ce qui permettra à vos agents de filtrer les recherches
    metadata_list = []
    for i in range(len(chunks)):
        metadata_list.append({
            "source": source_name,
            "pays": "Maroc",
            "type": "Loi",
            "domaine": "Données Personnelles"
        })

    # 5. Envoi vers Pinecone
    indexer_chunks(chunks, metadata_list)
    print("--- Ingestion terminée avec succès ! ---")
else:
    print("Erreur : Impossible d'extraire le texte du PDF.")