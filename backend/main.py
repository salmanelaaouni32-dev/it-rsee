import os
os.environ["HF_TOKEN"] = os.getenv("HF_TOKEN", "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")
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from groq import Groq
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer
import json
import pypdf
import io
import base64
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="LegalTech AI Backend", version="2.5")

# --- CONFIGURATION CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- INITIALISATION DES SERVICES ---
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "pcsk_4y7sKf_8sYumckSZn47dKNhZ95UNM5rxvSjeufzwsveeRZkcwZF8pT5AQUzHbeRLQF6Dzq")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "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")

pc = Pinecone(api_key=PINECONE_API_KEY)
index = pc.Index("reglementation-it-maroc")
embed_model = SentenceTransformer('all-MiniLM-L6-v2')
groq_client = Groq(api_key=GROQ_API_KEY)

# --- SCHÉMAS DE REQUÊTES ---
class ChatRequest(BaseModel):
    prompt: str
    loi: str

class AuditRequest(BaseModel):
    situation: str
    loi: str
    instruction: str | None = None


@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcription audio via Groq Whisper pour contourner les erreurs Web Speech navigateur."""
    try:
        audio_bytes = await file.read()
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Fichier audio vide.")

        response = groq_client.audio.transcriptions.create(
            file=(file.filename or "recording.webm", audio_bytes),
            model="whisper-large-v3",
            language="fr",
            prompt="Transcris fidelement en francais. N'invente pas. Garde les termes juridiques.",
            temperature=0,
            response_format="json",
        )
        text = (getattr(response, "text", None) or "").strip()
        if not text:
            raise HTTPException(status_code=400, detail="Aucun texte detecte dans l'audio.")
        return {"text": text}
    except HTTPException:
        raise
    except Exception as e:
        print(f"🚨 Erreur Transcription Audio: {str(e)}")
        raise HTTPException(status_code=500, detail="Echec de transcription audio.")


def _query_matches(results) -> list:
    """Compatibilite typage Pyright / Pinecone (matches present a l'execution)."""
    return list(getattr(results, "matches", []) or [])


@app.get("/")
async def root():
    return {"status": "online", "message": "LegalTech AI API is running"}

# --- ROUTE : CONSULTATION (CHAT) ---
@app.post("/api/chat")
async def legal_chat(request: ChatRequest):
    try:
        query_vector = embed_model.encode(request.prompt).tolist()
        results = index.query(vector=query_vector, top_k=4, include_metadata=True, filter={"loi": request.loi}) # type: ignore
        matches = _query_matches(results)
        contexte = "\n\n".join([res.metadata.get('text', '') for res in matches if res.metadata])
        
        sources = [
            {
                "titre": str(res.metadata.get('titre') or res.metadata.get('title') or f"Article/Source (Score: {round(res.score, 2)})"),
                "score": res.score
            } 
            for res in matches if res.metadata
        ]

        response = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system", 
                    "content": f"Tu es un expert juridique marocain de haut niveau. Réonds au regard de ce contexte officiel :\n{contexte}"
                },
                {"role": "user", "content": request.prompt}
            ],
            model="llama-3.1-8b-instant",
        )
        return {"answer": response.choices[0].message.content, "sources": sources}
    except Exception as e:
        print(f"🚨 Erreur Route Chat: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# --- ROUTE 1 : AUDIT TEXTE MANUEL ---
@app.post("/api/audit")
async def legal_audit(request: AuditRequest):
    return await execute_audit_pipeline(request.situation, request.loi, request.instruction)

# --- ROUTE 2 : AUDIT DOCUMENT (PDF/IMAGE) ---
@app.post("/api/audit/pdf")
async def legal_audit_pdf(
    file: UploadFile = File(...),
    loi: str = Form(...),
    instruction: str = Form(""),
):
    try:
        file_content = await file.read()
        content_type = file.content_type or ""
        filename = (file.filename or "").lower()

        extracted_text = ""
        if content_type == "application/pdf" or filename.endswith(".pdf"):
            pdf_reader = pypdf.PdfReader(io.BytesIO(file_content))
            for page in pdf_reader.pages:
                text = page.extract_text()
                if text:
                    extracted_text += text + "\n"
        elif content_type.startswith("image/") or filename.endswith((".png", ".jpg", ".jpeg", ".webp")):
            extracted_text = extract_text_from_image(file_content, content_type)
        else:
            raise HTTPException(
                status_code=400,
                detail="Format non supporte. Utilisez un PDF ou une image (png/jpg/jpeg/webp).",
            )

        if not extracted_text.strip():
            raise HTTPException(
                status_code=400,
                detail="Le document semble vide/non lisible. Ajoutez une consigne ou utilisez un fichier plus net.",
            )

        truncated_text = " ".join(extracted_text.split()[:4000])
        return await execute_audit_pipeline(truncated_text, loi, instruction)

    except HTTPException:
        raise

    except Exception as e:
        print(f"🚨 Erreur Traitement PDF: {str(e)}")
        return JSONResponse(status_code=500, content={
            "score": 0,
            "risques": [f"Erreur d'extraction du document : {str(e)}"],
            "conseils": ["Vérifiez que le PDF ou l'image est lisible et que le backend tourne."]
        })

# --- PIPELINE DE CALCUL ET D'ANALYSE D'AUDIT COMMUN ---
def extract_text_from_image(image_bytes: bytes, content_type: str) -> str:
    """Utilise Groq Vision pour extraire le texte clé d'une image."""
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    response = groq_client.chat.completions.create(
        model="meta-llama/llama-4-scout-17b-16e-instruct",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Extrait le texte juridique lisible de cette image. Réponds en texte brut uniquement."},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{content_type};base64,{image_b64}"},
                    },
                ],
            }
        ],
    )
    return (response.choices[0].message.content or "").strip()


async def execute_audit_pipeline(text_to_analyze: str, loi: str, instruction: str | None = None):
    try:
        # Recherche contextuelle RAG
        search_query = text_to_analyze[:1000]
        query_vector = embed_model.encode(search_query).tolist()
        results = index.query(vector=query_vector, top_k=4, include_metadata=True, filter={"loi": loi}) # type: ignore
        matches = _query_matches(results)
        contexte = "\n\n".join([res.metadata.get('text', '') for res in matches if res.metadata])

        # Construction du prompt d'évaluation rigide
        prompt_audit = (
            f"Analyse le document/la situation suivante au regard de la législation marocaine.\n"
            f"Contenu à évaluer : {text_to_analyze}\n"
            f"Contexte juridique extrait de la base : {contexte}\n\n"
            f"Consigne utilisateur (prioritaire) : {instruction or 'Aucune consigne speciale.'}\n\n"
            f"Tu dois impérativement répondre sous la forme d'un unique objet JSON valide contenant exactement ces clés :\n"
            f"{{\n"
            f"  \"score\": 75,\n"
            f"  \"risques\": [\"Risque 1 détaillé au regard de la loi marocaine\", \"Risque 2\"],\n"
            f"  \"conseils\": [\"Recommandation concrète 1 pour être conforme\", \"Recommandation 2\"]\n"
            f"}}\n"
            f"Ne renvoie aucun texte d'introduction, d'explication ou de conclusion. Uniquement le JSON."
        )

        response = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt_audit}],
            model="llama-3.1-8b-instant",
            response_format={"type": "json_object"}
        )

        content = response.choices[0].message.content
        if not content:
            raise ValueError("Reponse vide du modele Groq")
        raw_json_content = content.strip()

        # Nettoyage des balises Markdown de bloc code
        if raw_json_content.startswith("```json"):
            raw_json_content = raw_json_content.replace("```json", "").replace("```", "").strip()
        elif raw_json_content.startswith("```"):
            raw_json_content = raw_json_content.replace("```", "").strip()

        parsed_json = json.loads(raw_json_content)

        complet_json = {
            "score": int(parsed_json.get("score", 50)),
            "risques": parsed_json.get("risques", ["Aucun risque saillant détecté ou structure JSON incomplète."]),
            "conseils": parsed_json.get("conseils", ["Aucun conseil extrait automatiquement."])
        }
        return JSONResponse(status_code=200, content=complet_json)

    except Exception as e:
        print(f"🚨 Erreur Pipeline Audit: {str(e)}")
        return JSONResponse(status_code=500, content={
            "score": 0,
            "risques": [f"Erreur lors de la génération de l'audit prédictif : {str(e)}"],
            "conseils": ["Veuillez vérifier les logs de la console backend Python."]
        })

def _free_port(port: int) -> None:
    """Arrete tout processus qui ecoute encore sur ce port (Windows)."""
    import os
    import subprocess
    import sys
    import time

    if sys.platform != "win32":
        return

    script = (
        f"$procIds = (Get-NetTCPConnection -LocalPort {port} -State Listen "
        f"-ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique; "
        f"foreach ($procId in $procIds) {{ "
        f'if ($procId -and $procId -ne {os.getpid()}) {{ '
        f'Write-Host "Ancien serveur arrete (PID $procId, port {port})"; '
        f"Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue "
        f"}} }}"
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", script], check=False)
    time.sleep(1)


if __name__ == "__main__":
    import uvicorn

    PORT = 8000
    _free_port(PORT)
    print(f"Demarrage du serveur : http://127.0.0.1:{PORT}")
    print(f"Documentation : http://127.0.0.1:{PORT}/docs")
    # reload=False : evite WinError 10013/10048 sous Windows (double processus)
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")