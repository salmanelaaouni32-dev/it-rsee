import fitz  # PyMuPDF
import os
from database_setup import indexer_chunks  # type: ignore
from langchain_text_splitters import RecursiveCharacterTextSplitter

def extract_clean_text(pdf_path):
    """Extrait le texte d'un PDF en ignorant les en-têtes et pieds de page."""
    if not os.path.exists(pdf_path):
        print(f"Erreur : Le fichier {pdf_path} est introuvable.")
        return ""

    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        blocks = page.get_text("blocks")
        # Filtrage y=50 à height-50 pour le Bulletin Officiel
        filtered_blocks = [b[4] for b in blocks if 50 < float(b[1]) < page.rect.height - 50]
        text += "\n".join(filtered_blocks) + "\n"
    return text.strip()

def create_chunks(text):
    """Découpe le texte de manière sémantique."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=512,
        chunk_overlap=64,
        separators=["\nArticle ", "\n\n", "\n", " "],
        length_function=len
    )
    return splitter.split_text(text)

# --- CONFIGURATION DES LOIS A TRAITER ---
# Tu peux ajouter autant de lois que tu veux ici
lois_a_traiter = [
    {
        "id": "09-08",
        "chemin": r'data/raw/loi-09-08.pdf',
        "titre": "Protection des données"
    },
    {
        "id": "05-20",
        "chemin": r'data/raw/loi-05-20.pdf',
        "titre": "Cybersécurité"
    },
    {
        "id": "societe",
        "chemin": r'C:\Users\c\Documents\DATA\buisness\creation_societe\Loi 17-95.pdf',
        "titre": "Droit des Sociétés (Maroc)"
    },
    {
        "id": "contrat",
        "chemin": r'C:\Users\c\Desktop\PROJET_PFE_IT_RSE\data\raw\4_ONC_Law_fr-FR.pdf',
        "titre": "Droit des Obligations et Contrats"
    }
]

# --- BOUCLE D'EXECUTION ---
for loi in lois_a_traiter:
    print(f"\n--- Traitement de la {loi['titre']} (ID: {loi['id']}) ---")
    
    # 1. Extraction
    content = extract_clean_text(loi['chemin'])
    
    if content:
        # 2. Chunking
        chunks = create_chunks(content)
        print(f"Nombre de morceaux créés : {len(chunks)}")
        
        # 3. Préparation des métadonnées avec le tag "loi"
        metadata_list = []
        for i in range(len(chunks)):
            metadata_list.append({
                "text": chunks[i],
                "loi": loi['id'],  # <--- INDISPENSABLE pour le filtre de l'app
                "source": f"Loi {loi['id']}",
                "titre": loi['titre'],
                "pays": "Maroc"
            })
        
        # 4. Envoi vers Pinecone
        print(f"Indexation en cours pour la loi {loi['id']}...")
        indexer_chunks(chunks, metadata_list)
        print(f"Succès : La loi {loi['id']} est prête.")

print("\nFélicitations ! Toutes vos lois sont maintenant dans Pinecone.")