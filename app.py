import streamlit as st
from groq import Groq
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer

# 1. CONFIGURATION DE LA PAGE
st.set_page_config(page_title="Expert Juridique IA - PFE", layout="wide")

st.markdown("""
    <style>
    .main { background-color: #f5f7f9; }
    .stChatMessage { border-radius: 15px; padding: 15px; margin-bottom: 10px; }
    .stSidebar { background-color: #0e1117; color: white; }
    </style>
    """, unsafe_allow_html=True)

import os

@st.cache_resource
def init_services():
    pc = Pinecone(api_key=os.environ.get("PINECONE_API_KEY", ""))
    index = pc.Index("reglementation-it-maroc")
    embed_model = SentenceTransformer('all-MiniLM-L6-v2')
    groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY", ""))
    return index, embed_model, groq_client

index, embed_model, groq_client = init_services()

# 3. BARRE LATÉRALE (Nouveaux domaines ajoutés)
with st.sidebar:
    st.title("🛡️ Compliance Bot")
    st.subheader("Réglementation & Droit Maroc")
    
    loi_selection = st.selectbox("Choisir le domaine d'expertise :", [
        "Loi 09-08 (Privacy)", 
        "Loi 05-20 (Cyber)", 
        "Droit des Sociétés", 
        "Droit des Contrats"
    ])
    
    if st.button("🗑️ Effacer la conversation"):
        st.session_state.messages = []
        st.rerun()
        
    st.divider()
    st.info("Architecture RAG : Pinecone + Llama 3.1 (Groq)")

# 4. GESTION DU CHAT
if "messages" not in st.session_state:
    st.session_state.messages = []

for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# 5. LOGIQUE RAG MULTI-DOMAINE
if prompt := st.chat_input("Posez votre question juridique ici..."):
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    with st.spinner("Analyse des bases juridiques en cours..."):
        
        # --- LE MAPPING MAGIQUE ---
        # Fait le lien entre le menu et tes IDs de Pinecone
        config_experts = {
            "Loi 09-08 (Privacy)": ("09-08", "expert de la CNDP (Protection des données)"),
            "Loi 05-20 (Cyber)": ("05-20", "expert de la DGSSI (Cybersécurité)"),
            "Droit des Sociétés": ("societe", "expert en droit des affaires marocain"),
            "Droit des Contrats": ("contrat", "expert en droit des obligations et contrats (D.O.C)")
        }
        
        # On récupère l'ID et le rôle dynamiquement
        filtre_loi, role_ia = config_experts[loi_selection]

        # A. Recherche Pinecone avec FILTRE
        query_vector = embed_model.encode(prompt).tolist()
        results = index.query(
            vector=query_vector, 
            top_k=4, 
            include_metadata=True,
            filter={"loi": {"$eq": filtre_loi}} 
        )
        
        contexte = "\n\n".join([res['metadata'].get('text', '') for res in results['matches']])

        # B. Génération avec le rôle spécifique
        response = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system", 
                    "content": f"Tu es un {role_ia}. Réponds strictement en utilisant ce contexte : {contexte}. Si l'info n'y est pas, dis que la loi sélectionnée ne couvre pas ce point précis."
                },
                {"role": "user", "content": prompt}
            ],
            model="llama-3.1-8b-instant",
        )
        answer = response.choices[0].message.content

    # C. Affichage
    st.session_state.messages.append({"role": "assistant", "content": answer})
    with st.chat_message("assistant"):
        st.markdown(answer)
        
        with st.expander("🔍 Voir les sources juridiques consultées"):
            for res in results['matches']:
                st.write(f"📄 **Document:** {res['metadata'].get('titre')} (Fiabilité: {round(res['score']*100)}%)")
                st.caption(res['metadata'].get('text'))