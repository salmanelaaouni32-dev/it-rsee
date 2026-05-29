import pandas as pd

# 1. On définit nos questions de test (Le "Golden Dataset")
# Tu peux en ajouter d'autres selon tes fichiers dans Pinecone
test_data = [
    {
        "question": "Quelles sont les sanctions prévues par la loi 09-08 en cas de traitement sans déclaration ?",
        "ground_truth": "Selon la loi 09-08, le non-respect de l'obligation de déclaration est passible d'une amende de 10 000 à 100 000 DH."
    },
    {
        "question": "Quelle est la mission principale de la DGSSI selon la loi 05-20 ?",
        "ground_truth": "La DGSSI assure la sécurité des systèmes d'information de l'État, des infrastructures d'importance vitale et des administrations publiques."
    }
]

df_test = pd.DataFrame(test_data)
print("✅ Dataset de test créé avec succès.")