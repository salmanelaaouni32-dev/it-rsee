import os
import json
import pandas as pd
from groq import Groq
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

load_dotenv()

# --- INITIALISATION ---
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY", "pcsk_4y7sKf_8sYumckSZn47dKNhZ95UNM5rxvSjeufzwsveeRZkcwZF8pT5AQUzHbeRLQF6Dzq"))
index = pc.Index("reglementation-it-maroc")
embed_model = SentenceTransformer('all-MiniLM-L6-v2')
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY", "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"))

# --- DATASET DE TEST (Le "Golden Dataset") ---
# Ajoute ici au moins 5-10 questions types pour ton PFE
questions_test = [
    {
        "question": "Quelles sont les sanctions de la loi 09-08 ?",
        "expected": "Amendes de 10 000 à 100 000 DH pour défaut de déclaration."
    },
    {
        "question": "Qui doit respecter la loi 05-20 ?",
        "expected": "Les administrations publiques, les établissements publics et les infrastructures d'importance vitale."
    }
]

def evaluer_systeme():
    results = []
    
    print("🧪 Début de l'évaluation du système RAG...")
    
    for item in questions_test:
        # A. Retrieval (Recherche Pinecone)
        query_vec = embed_model.encode(item['question']).tolist()
        search_res = index.query(vector=query_vec, top_k=3, include_metadata=True)
        contexte = "\n".join([r.metadata.get('text', '') for r in search_res.matches if r.metadata])
        
        # B. Generation (Appel Groq)
        response = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": f"Réponds strictement avec ce contexte : {contexte}"},
                {"role": "user", "content": item['question']}
            ],
            model="llama-3.1-8b-instant"
        )
        answer = response.choices[0].message.content
        
        # C. Scoring (Auto-évaluation par IA)
        # On demande à un "Juge IA" de noter la fidélité de 0 à 10
        prompt_juge = f"""
        Évalue la réponse suivante basée sur le contexte fourni.
        CONTEXTE : {contexte}
        RÉPONSE IA : {answer}
        NOTE de 0 à 10 sur la FIDÉLITÉ (0 = invention, 10 = totalement fidèle au contexte).
        Réponds uniquement avec le chiffre.
        """
        score_eval = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt_juge}],
            model="llama-3.1-8b-instant"
        ).choices[0].message.content

        results.append({
            "Question": item['question'],
            "Réponse IA": answer[:100] + "...",
            "Score Fidélité": float(score_eval) / 10 # Normalisé sur 1
        })

    # --- CRÉATION DU RAPPORT ---
    df = pd.DataFrame(results)
    avg_score = df["Score Fidélité"].mean()
    
    print(f"\n✅ Évaluation terminée ! Score Moyen : {avg_score:.2f}/1.0")
    print(df[["Question", "Score Fidélité"]])
    
    # Sauvegarde pour ton rapport de stage
    df.to_csv("data/rapport_evaluation.csv", index=False)
    return avg_score

if __name__ == "__main__":
    evaluer_systeme()