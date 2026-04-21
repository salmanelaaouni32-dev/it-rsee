import os
from groq import Groq
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer

# 1. Vos Clés
PINECONE_API_KEY = os.environ.get("PINECONE_API_KEY", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")

# 2. Initialisation
pc = Pinecone(api_key=PINECONE_API_KEY)
index = pc.Index("reglementation-it-maroc")
model_embed = SentenceTransformer('all-MiniLM-L6-v2')

# Client Groq
client = Groq(api_key=GROQ_API_KEY)

def poser_question(question):
    # A. Recherche dans Pinecone (Retrieval)
    query_vector = model_embed.encode(question).tolist()
    results = index.query(vector=query_vector, top_k=3, include_metadata=True)
    
    contexte = "\n".join([res['metadata']['text'] for res in results['matches']])
    
    # B. Génération avec Llama 3 (via Groq)
   # B. Génération avec la version à jour
    chat_completion = client.chat.completions.create(
        messages=[
            {
                "role": "system",
                "content": f"Tu es un expert juridique marocain. Réponds à la question en utilisant uniquement ce contexte : {contexte}"
            },
            {
                "role": "user",
                "content": question,
            }
        ],
        model="llama-3.1-8b-instant", # Ce modèle remplace l'ancien 8b
    )
    
    return chat_completion.choices[0].message.content

# --- TEST ---
print("\n--- TEST AGENT AVEC GROQ (LLAMA 3) ---")
try:
    reponse = poser_question("Quelles sont les sanctions prévues par la loi 09-08 ?")
    print(reponse)
except Exception as e:
    print(f"Erreur avec Groq : {e}")