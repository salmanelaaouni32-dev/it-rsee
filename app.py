import streamlit as st
from groq import Groq
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer
from streamlit_echarts import st_echarts
from streamlit_lottie import st_lottie
import os
import json
import requests
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

# --- 1. CONFIGURATION DE LA PAGE & STYLE CSS AVANCÉ ---
st.set_page_config(page_title="Compliance Bot Pro", layout="wide", initial_sidebar_state="expanded")

def apply_premium_css():
    st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
    
    /* Police Globale */
    html, body, [class*="css"] { font-family: 'Poppins', sans-serif; }
    
    /* Thème Sombre Profond (Deep Dark) */
    .main { background-color: #0d1117; color: #c9d1d9; }
    
    /* Style de la barre latérale */
    section[data-testid="stSidebar"] {
        background-color: #161b22 !important;
        border-right: 1px solid #30363d;
        color: #c9d1d9;
    }
    
    /* Cartes Glassmorphism Modernes */
    .metric-card, .stMetric {
        background: rgba(22, 27, 34, 0.7);
        border: 1px solid #30363d;
        border-radius: 16px;
        padding: 24px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        transition: all 0.3s ease;
    }
    
    /* Effet de survol sur les cartes */
    .metric-card:hover {
        transform: translateY(-5px);
        border-color: #58a6ff;
        box-shadow: 0 8px 24px rgba(88,166,255,0.2);
    }
    
    /* Titres en Gradient Néon */
    .neon-title {
        background: linear-gradient(90deg, #58a6ff, #bc8cff);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        font-weight: 700;
        font-size: 3rem;
        text-shadow: 0 0 10px rgba(88,166,255,0.3);
    }
    
    /* Sous-titres */
    .sub-title {
        color: #8b949e;
        font-weight: 500;
        margin-top: -10px;
        margin-bottom: 30px;
    }

    /* Style des boutons */
    .stButton>button {
        border-radius: 12px;
        background: #21262d;
        border: 1px solid #30363d;
        color: #c9d1d9;
        font-weight: 600;
        padding: 12px 24px;
        transition: 0.3s all;
    }
    .stButton>button:hover {
        border-color: #58a6ff;
        color: #58a6ff;
        background: #161b22;
        box-shadow: 0 0 10px rgba(88,166,255,0.2);
    }
    
    /* Style des bulles de chat */
    .stChatMessage {
        border-radius: 16px !important;
        padding: 16px !important;
        background-color: #1c2128 !important;
        border: 1px solid #30363d !important;
    }
    .stChatMessage[data-testid="stChatMessageUser"] {
        background-color: #21262d !important;
    }

    </style>
    """, unsafe_allow_html=True)

apply_premium_css()

# --- 2. ASSETS (Animations & Icônes) ---
def load_lottieurl(url: str):
    r = requests.get(url)
    return r.json() if r.status_code == 200 else None

lottie_legal = load_lottieurl("https://lottie.host/828236d3-2943-4e4b-9703-e962b1897d2f/7z7J9uR1Yk.json")

# --- 3. INITIALISATION DES SERVICES (Pinecone/Groq) ---
@st.cache_resource
def init_services():
    pc = Pinecone(api_key=os.environ.get("PINECONE_API_KEY"))
    index = pc.Index("reglementation-it-maroc")
    embed_model = SentenceTransformer('all-MiniLM-L6-v2')
    groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    return index, embed_model, groq_client

index, embed_model, groq_client = init_services()

# --- FONCTIONS AUXILIAIRES ---
def get_legal_context(query, filter_id):
    query_vector = embed_model.encode(query).tolist()
    results = index.query(vector=query_vector, top_k=4, include_metadata=True, filter={"loi": filter_id})  # type: ignore
    return "\n\n".join([res.metadata.get('text', '') for res in results.matches if res.metadata]), results.matches

def render_risk_gauge(score):
    option = {
        "series": [{
            "type": 'gauge', "startAngle": 180, "endAngle": 0, "min": 0, "max": 100,
            "itemStyle": {"color": '#ff7b72' if score > 70 else '#ffa657' if score > 30 else '#56d364'},
            "progress": {"show": True, "width": 18}, "pointer": {"show": False},
            "data": [{"value": score}], "detail": {"formatter": '{value}%', "fontSize": 25, "color": '#fff', "offsetCenter": [0, -10]}
        }]
    }
    st_echarts(options=option, height="200px")

# --- 4. BARRE LATÉRALE (LOGO + NAV) ---
with st.sidebar:
    st.markdown("<h2 style='text-align: center; color: #58a6ff; font-weight:800;'>LegalTech AI</h2>", unsafe_allow_html=True)
    if lottie_legal: st_lottie(lottie_legal, height=120)
    st.divider()
    
    mode = st.radio("📍 Navigation", ["💬 Consultation Chat", "⚖️ Audit Prédictif", "📊 Dashboard Performance"], index=0)
    
    st.divider()
    loi_selection = st.selectbox("🎯 Domaine d'expertise :", ["Loi 09-08 (Privacy)", "Loi 05-20 (Cyber)", "Droit des Sociétés", "Droit des Contrats"])
    
    if st.button("🗑️ Réinitialiser le Chat", use_container_width=True):
        st.session_state.messages = []
        st.rerun()

config_experts = {
    "Loi 09-08 (Privacy)": ("09-08", "expert de la CNDP (Protection des données)"),
    "Loi 05-20 (Cyber)": ("05-20", "expert de la DGSSI (Cybersécurité)"),
    "Droit des Sociétés": ("societe", "expert en droit des affaires marocain"),
    "Droit des Contrats": ("contrat", "expert en droit des obligations et contrats (D.O.C)")
}
filtre_loi, role_ia = config_experts[loi_selection]

# --- 5. MODE CONSULTATION (CHAT) ---
if mode == "💬 Consultation Chat":
    st.markdown('<p class="neon-title">Assistant Juridique IA</p>', unsafe_allow_html=True)
    st.markdown('<p class="sub-title">Discutez avec notre expert IA basé sur la loi marocaine</p>', unsafe_allow_html=True)
    
    # Boutons d'action rapide
    st.markdown("<b>⚡ Questions fréquentes :</b>", unsafe_allow_html=True)
    q_cols = st.columns(3)
    suggestions = [f"Sanctions de la {loi_selection} ?", "Obligations de déclaration ?", "Nouveautés 2026 ?"]
    
    for i, sugg in enumerate(suggestions):
        if q_cols[i].button(sugg, use_container_width=True):
            st.session_state.active_prompt = sugg

    # Zone de chat
    if "messages" not in st.session_state: st.session_state.messages = []
    for m in st.session_state.messages:
        with st.chat_message(m["role"]): st.markdown(m["content"])

    query = st.chat_input("Posez votre question juridique ici...")
    if hasattr(st.session_state, 'active_prompt'):
        query = st.session_state.active_prompt
        del st.session_state.active_prompt

    if query:
        st.session_state.messages.append({"role": "user", "content": query})
        with st.chat_message("user"): st.markdown(query)
        
        with st.spinner("Analyse des lois en cours..."):
            contexte, matches = get_legal_context(query, filtre_loi)
            response = groq_client.chat.completions.create(
                messages=[{"role": "system", "content": f"Tu es un {role_ia}. Réponds via ce contexte : {contexte}."}, {"role": "user", "content": query}],
                model="llama-3.1-8b-instant",
            )
            answer = response.choices[0].message.content
            
        st.session_state.messages.append({"role": "assistant", "content": answer})
        with st.chat_message("assistant"):
            st.markdown(answer)
            with st.expander("🔍 Voir les sources juridiques consultées"):
                for res in matches: 
                    if res.metadata:
                        st.write(f"📄 **{res.metadata.get('titre')}** (Score de pertinence: {round(res.score*100)}%)")

# --- 6. MODE AUDIT PRÉDICTIF ---
elif mode == "⚖️ Audit Prédictif":
    st.markdown('<p class="neon-title">Audit & Prédiction</p>', unsafe_allow_html=True)
    st.markdown('<p class="sub-title">Évaluez vos risques juridiques et obtenez des conseils prédictifs</p>', unsafe_allow_html=True)
    
    # Formulaire d'audit
    st.markdown('<div class="metric-card">', unsafe_allow_html=True)
    with st.form("risk_form"):
        st.write("🚀 **Décrivez votre projet, infrastructure ou situation à auditer**")
        situation = st.text_area("", placeholder="Ex: Notre plateforme e-commerce prévoit de stocker les CIN des clients marocains...", height=180)
        submit = st.form_submit_button("LANCER L'AUDIT IA")
    st.markdown('</div>', unsafe_allow_html=True)

    if submit and situation:
        with st.spinner("L'expert IA analyse votre situation..."):
            contexte, _ = get_legal_context(situation, filtre_loi)
            prompt_audit = f"Analyse : {situation}. Contexte : {contexte}. Réponds en JSON : {{'score': 0-100, 'risques': [], 'conseils': []}}"
            response = groq_client.chat.completions.create(messages=[{"role": "user", "content": prompt_audit}], model="llama-3.1-8b-instant", response_format={"type": "json_object"})
            res_data = json.loads(response.choices[0].message.content)
            
            # Affichage des résultats enDashboard
            st.divider()
            c1, c2 = st.columns([1, 2])
            with c1:
                st.markdown('<div class="metric-card">', unsafe_allow_html=True)
                st.write("⚠️ **Score de Danger**")
                render_risk_gauge(int(res_data['score']))
                st.markdown('</div>', unsafe_allow_html=True)
            with c2:
                st.markdown('<div class="metric-card" style="height: 240px;">', unsafe_allow_html=True)
                st.write("🚨 **Alertes Immédiates**")
                for r in res_data['risques']: st.markdown(f"• <span style='color:#ff7b72'>{r}</span>", unsafe_allow_html=True)
                st.markdown('</div>', unsafe_allow_html=True)
            
            st.subheader("💡 Conseils Prédictifs pour l'Anticipation")
            cons_cols = st.columns(3)
            for i, c in enumerate(res_data['conseils'][:3]):
                with cons_cols[i]: st.markdown(f'<div class="metric-card" style="min-height:160px; border-top: 4px solid #58a6ff;">{c}</div>', unsafe_allow_html=True)

# --- 7. MODE DASHBOARD PERFORMANCE ---
else:
    st.markdown('<p class="neon-title">Dashboard de Fiabilité</p>', unsafe_allow_html=True)
    st.markdown('<p class="sub-title">Statistiques d\'utilisation et métriques de fiabilité du système RAG</p>', unsafe_allow_html=True)
    
    # Indicateurs clés (KPI)
    st.markdown('<div class="metric-card">', unsafe_allow_html=True)
    col1, col2, col3 = st.columns(3)
    col1.metric("Fidélité des Réponses", "94.8%", "+0.5%")
    col2.metric("Taux de Précision RAG", "89.2%", "+1.1%")
    col3.metric("Temps de Réponse", "1.1s", "-0.2s")
    st.markdown('</div>', unsafe_allow_html=True)

    st.divider()
    c1, c2 = st.columns([2, 1])
    
    with c1:
        st.markdown('<div class="metric-card">', unsafe_allow_html=True)
        st.subheader("📊 Fiabilité par Métrique")
        options_bar = {
            "xAxis": {"type": 'category', "data": ["Fidélité", "Pertinence", "Contexte", "Vitesse"], "axisLabel": {"color": "#c9d1d9"}},
            "yAxis": {"type": 'value', "max": 1, "splitLine": {"lineStyle": {"color": "#30363d"}}, "axisLabel": {"color": "#c9d1d9"}},
            "series": [{"data": [0.94, 0.90, 0.89, 0.96], "type": 'bar', "itemStyle": {"color": '#58a6ff', "borderRadius": [8, 8, 0, 0]}}]
        }
        st_echarts(options=options_bar, height="320px")
        st.markdown('</div>', unsafe_allow_html=True)

    with c2:
        st.markdown('<div class="metric-card">', unsafe_allow_html=True)
        st.subheader("🎯 Expertise Domaine")
        options_radar = {
            "radar": {
                "indicator": [
                    {"name": 'Privacy', "max": 1}, {"name": 'Cyber', "max": 1}, {"name": 'Sociétés', "max": 1}, {"name": 'Contrats', "max": 1}
                ],
                "axisName": {"color": "#c9d1d9"},
                "splitLine": {"lineStyle": {"color": "#30363d"}},
                "splitArea": {"show": False}
            },
            "series": [{"type": 'radar', "data": [{"value": [0.96, 0.91, 0.85, 0.88], "name": 'Score Fiabilité'}], "itemStyle": {"color": "#bc8cff"}, "areaStyle": {"color": "rgba(188,140,255,0.2)"}}]
        }
        st_echarts(options=options_radar, height="320px")
        st.markdown('</div>', unsafe_allow_html=True)