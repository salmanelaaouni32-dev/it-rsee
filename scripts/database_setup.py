from pinecone import Pinecone, ServerlessSpec
from sentence_transformers import SentenceTransformer
import time

# 1. Connexion à Pinecone (Utilisez votre clé API)
pc = Pinecone(api_key="pcsk_4U8X6q_MjkfU2LaPZ3NP4cbduoQzczoAN9DC7wi2EexSjMcaD22XNm2X9FVocohLJdvDRE")

# 2. Configuration de l'index
index_name = "reglementation-it-maroc"

# MODIFICATION : Nouvelle syntaxe pour lister les index
existing_indexes = [index.name for index in pc.list_indexes()]

if index_name not in existing_indexes:
    print(f"Création de l'index '{index_name}'...")
    pc.create_index(
        name=index_name,
        dimension=384, 
        metric="cosine", 
        spec=ServerlessSpec(
            cloud="aws",
            region="us-east-1" 
        )
    )
    # Attendre que l'index soit prêt (important pour Pinecone Serverless)
    while not pc.describe_index(index_name).status['ready']:
        time.sleep(1)
    print(f"Index '{index_name}' créé et prêt.")
else:
    print(f"L'index '{index_name}' existe déjà.")

# 3. Connexion à l'index
index = pc.Index(index_name)

# 4. Chargement du modèle d'Embedding
# Ce modèle transforme vos articles de loi en vecteurs de 384 dimensions
model = SentenceTransformer('all-MiniLM-L6-v2')

def indexer_chunks(chunks, metadata_list):
    """
    Indexe les morceaux de texte dans Pinecone par lots (batchs) 
    pour éviter l'erreur de limite de 1000 vecteurs.
    """
    from sentence_transformers import SentenceTransformer
    embed_model = SentenceTransformer('all-MiniLM-L6-v2')
    
    vectors = []
    for i, chunk in enumerate(chunks):
        embedding = embed_model.encode(chunk).tolist()
        vectors.append({
            "id": f"vec_{metadata_list[i]['loi']}_{i}",
            "values": embedding,
            "metadata": metadata_list[i]
        })

    # --- NOUVELLE LOGIQUE DE BATCHING ---
    # On découpe la liste 'vectors' en morceaux de 100
    batch_size = 100
    for i in range(0, len(vectors), batch_size):
        batch = vectors[i : i + batch_size]
        index.upsert(vectors=batch)
        print(f"Batch {i//batch_size + 1} envoyé ({len(batch)} vecteurs)...")
    
    # Envoi vers Pinecone
    # Note : upsert accepte une liste d'objets
    index.upsert(vectors=vectors)
    print(f"Succès : {len(vectors)} morceaux indexés dans Pinecone.")

# --- SECTION DE TEST (Vous pouvez commenter ceci après le premier test) ---
# test_chunks = ["Ceci est un test sur la loi 09-08", "La cybersécurité au Maroc est régie par la loi 05-20"]
# test_metadata = [{"source": "test"}, {"source": "test"}]
# indexer_chunks(test_chunks, test_metadata)