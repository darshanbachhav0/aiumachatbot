# Chatbot backend with personalization + RAG + Gemini fallback
# Adds: Authorization support, personal context from UMA APIs, returns personal_context to the UI.

import os
import json
from datetime import datetime
from flask import Flask, request, jsonify, Response
import requests
from bs4 import BeautifulSoup
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from flask_cors import CORS
from symspellpy import SymSpell, Verbosity
import whisper
import soundfile as sf
import io
import torch
import numpy as np
import nltk
from nltk.corpus import stopwords
import re
from sentence_transformers import SentenceTransformer, util, CrossEncoder
from rank_bm25 import BM25Okapi
# from unidecode import unidecode  # optional

# ---------- Flask / CORS ----------
app = Flask(__name__, static_folder='static', static_url_path='')
# allow Authorization header for the WebView token
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=False)

@app.route('/')
def index():
    return app.send_static_file('index.html')

# ---------- CONFIG ----------
APP_BASE = "http://37.60.229.241:8085/service-uma"  # your mobile app backend

# ---------- SPELLING ----------
sym_spell = SymSpell(max_dictionary_edit_distance=2, prefix_length=7)
sym_spell.load_dictionary("es_50k.txt", term_index=0, count_index=1)

def correct_spelling(text):
    corrected_words = []
    for word in text.split():
        suggestions = sym_spell.lookup(word, Verbosity.CLOSEST, max_edit_distance=2)
        corrected_word = suggestions[0].term if suggestions else word
        corrected_words.append(corrected_word)
    return " ".join(corrected_words)

@app.route('/correct_spelling', methods=['POST'])
def correct_spelling_route():
    data = request.get_json() or {}
    user_input = data.get("query", "")
    corrected_query = correct_spelling(user_input)
    return jsonify({"corrected_query": corrected_query})

# ---------- SCRAPING + BM25 (RAG-lite over public pages) ----------
def scrape_page(url):
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        paragraphs = soup.find_all('p')
        page_text = " ".join(p.get_text() for p in paragraphs)
        return page_text.strip()
    except Exception as e:
        print(f"Error scraping {url}: {e}")
        return ""

urls = [
    "https://uma.edu.pe/",
    "https://uma.edu.pe/por-que-la-uma/",
    "https://uma.edu.pe/admisionpregrado/",
]

try:
    nltk.download('stopwords')
    spanish_stopwords = stopwords.words('spanish')
except Exception:
    spanish_stopwords = None

documents = []
for u in urls:
    t = scrape_page(u)
    if t:
        documents.append(t)
if not documents:
    documents.append("No data available.")

bm25_docs = [doc.lower().split() for doc in documents]
bm25_model = BM25Okapi(bm25_docs)

vectorizer = TfidfVectorizer(stop_words=spanish_stopwords) if spanish_stopwords else TfidfVectorizer()
doc_vectors = vectorizer.fit_transform(documents)

def normalize_text(text):
    text = text.lower()
    # text = unidecode(text)
    text = re.sub(r'[^\w\s]', '', text)
    return re.sub(r'\s+', ' ', text).strip()

def get_best_doc_and_score(query):
    normalized_query = normalize_text(query)
    query_vec = vectorizer.transform([normalized_query])
    similarities = cosine_similarity(query_vec, doc_vectors).flatten()

    best_idx = similarities.argmax()
    best_doc = documents[best_idx]
    best_score = similarities[best_idx]

    bm25_scores = bm25_model.get_scores(normalized_query.split())
    bm25_best_score = max(bm25_scores) if len(bm25_scores) else 0.0

    UMA_KEYWORDS = ["curso", "cursos", "admisión", "facultad", "estudios", "clases", "universidad"]
    if any(k in normalized_query for k in UMA_KEYWORDS) and best_score < 0.3:
        best_score += 0.1

    final_score = max(best_score, bm25_best_score / 10.0)
    return best_doc, final_score

# ---------- FAQ EMBEDDING ----------
with open("data1.json", "r", encoding="utf-8") as f:
    raw_data = json.load(f)
    faq_list = [faq for faq in raw_data if isinstance(faq, dict)]

def create_faq_embedding_text(faq):
    variations = " ".join(faq.get("variations", []))
    synonyms = " ".join(faq.get("synonyms", []))
    return normalize_text(faq.get("question","") + " " + variations + " " + synonyms)

faq_model = SentenceTransformer("intfloat/e5-large")
faq_texts = [create_faq_embedding_text(faq) for faq in faq_list]
faq_embeddings = faq_model.encode(faq_texts, convert_to_tensor=True)

cross_encoder = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

# ---------- Personalization helpers (call your own UMA APIs with the same bearer) ----------
def bearer_header():
    auth = request.headers.get("Authorization", "")
    return auth if auth.startswith("Bearer ") else ""

def call_app(path, payload=None, timeout=10):
    """POST to your app backend with the same Bearer token the Android app uses."""
    bh = bearer_header()
    if not bh:
        return None
    try:
        r = requests.post(
            APP_BASE + path,
            json=payload or {},
            headers={"Authorization": bh, "Content-Type": "application/json"},
            timeout=timeout,
        )
        if r.status_code == 200:
            return r.json()
        else:
            print(f"[call_app] {path} -> {r.status_code} {r.text[:200]}")
            return None
    except Exception as e:
        print(f"[call_app] {path} error: {e}")
        return None

def intent_of(q):
    t = normalize_text(q)
    if any(k in t for k in ["horario","horarios","clase","a que hora","a qué hora","aula","salon","salón"]): return "schedule"
    if any(k in t for k in ["pago","pagos","cuota","boleta","saldo","deuda"]): return "payments"
    if any(k in t for k in ["nota","notas","calificacion","calificación","curso","creditos","créditos","matricula","matrícula"]): return "academics"
    if any(k in t for k in ["servicio","servicios","biblioteca","laboratorio","tramite","trámite"]): return "services"
    if any(k in t for k in ["regla","reglas","reglamento","norma"]): return "rules"
    if any(k in t for k in ["evento","eventos","actividad"]): return "events"
    return "general"

def summarize_profile(j):
    if not j: return ""
    name = j.get("name") or j.get("nombre") or j.get("full_name") or ""
    program = j.get("program") or j.get("programa") or ""
    ciclo = j.get("ciclo") or j.get("semester") or ""
    sede = j.get("campus") or j.get("sede") or ""
    parts = []
    if name: parts.append(f"Nombre: {name}")
    if program: parts.append(f"Programa: {program}")
    if ciclo: parts.append(f"Ciclo: {ciclo}")
    if sede: parts.append(f"Sede: {sede}")
    return "; ".join(parts)

def summarize_schedule(j):
    if not j: return ""
    today = datetime.now().strftime("%d/%m")
    # Try a few common fields; adapt as needed to your actual payload
    classes = j.get("classes") or j.get("data") or j.get("horario") or []
    if isinstance(classes, dict): classes = [classes]
    if not classes: return ""
    top = []
    for c in classes[:4]:
        course = c.get("course") or c.get("nombre") or c.get("curso") or "Curso"
        start = c.get("start") or c.get("hora_inicio") or c.get("inicio") or "—"
        end   = c.get("end")   or c.get("hora_fin")    or c.get("fin")    or "—"
        room  = c.get("room")  or c.get("aula")        or "—"
        day   = c.get("day")   or c.get("dia")         or ""
        if day: top.append(f"{course}: {day} {start}-{end} (Aula {room})")
        else:   top.append(f"{course}: {start}-{end} (Aula {room})")
    return f"Horario {today}: " + "; ".join(top)

def summarize_payments(j):
    if not j: return ""
    items = j.get("items") or j.get("pagos") or j.get("data") or []
    if isinstance(items, dict): items = [items]
    if not items: return "Pagos: sin deudas registradas."
    pending = [x for x in items if str(x.get("status") or x.get("estado") or "").lower() in ("pendiente","pending")]
    if pending:
        top = []
        for p in pending[:3]:
            concept = p.get("concept") or p.get("concepto") or "Pago"
            due     = p.get("due_date") or p.get("vencimiento") or "—"
            amount  = p.get("amount") or p.get("monto") or "-"
            top.append(f"{concept}: vence {due}, monto {amount}")
        return "Pagos pendientes: " + "; ".join(top)
    return "No tienes pagos pendientes."

def summarize_qualifications(j):
    if not j: return ""
    items = j.get("grades") or j.get("notas") or j.get("data") or []
    if isinstance(items, dict): items = [items]
    if not items: return ""
    top = []
    for g in items[:5]:
        course = g.get("course") or g.get("curso") or "Curso"
        grade  = g.get("grade") or g.get("nota") or "—"
        top.append(f"{course}: {grade}")
    return "Notas: " + "; ".join(top)

def build_personal_context(query):
    """Fetch only what the intent needs; degrade gracefully if endpoints need different payloads."""
    intent = intent_of(query)
    ctx = []

    # profile is useful in any case
    profile = call_app("/student/student", {})
    sprof = summarize_profile(profile)
    if sprof: ctx.append(sprof)

    try:
        if intent in ("schedule","general"):
            # try a simple payload; adapt to your API later
            sch = call_app("/student/course-schedule", {"date": "today"})
            ssch = summarize_schedule(sch)
            if ssch: ctx.append(ssch)

        if intent in ("payments","general"):
            pay = call_app("/student/payment", {"range": "current"})
            spay = summarize_payments(pay)
            if spay: ctx.append(spay)

        if intent in ("academics","general"):
            q = call_app("/student/course-qualifications", {})
            sq = summarize_qualifications(q)
            if sq: ctx.append(sq)

        if intent in ("services","general"):
            # you can add /student/attendance or other service endpoints
            pass

        if intent in ("rules","general"):
            # rules likely come from public RAG; keep empty here
            pass

        if intent in ("events","general"):
            # add your events endpoint when available
            pass
    except Exception as e:
        print("personal_context error:", e)

    return " | ".join([c for c in ctx if c])

# ---------- Main chat retrieval ----------
@app.route('/get_response', methods=['POST'])
def get_response():
    data = request.get_json() or {}
    query = data.get("query", "")
    corrected_query = correct_spelling(query)
    normalized_query = normalize_text(corrected_query)

    # Build PERSONAL CONTEXT using student's bearer token (if present)
    personal_context = build_personal_context(normalized_query)

    # FAQ retrieve
    query_embedding = faq_model.encode(normalized_query, convert_to_tensor=True)
    scores = util.pytorch_cos_sim(query_embedding, faq_embeddings).cpu().numpy().flatten()

    top_k = 5
    top_indices = np.argsort(-scores)[:top_k]

    candidate_pairs = []
    candidate_indices = []
    for idx in top_indices:
        q = faq_list[idx].get("question","")
        a = faq_list[idx].get("answer","")
        candidate_text = f"{q} {a}"
        candidate_pairs.append((corrected_query, candidate_text))
        candidate_indices.append(idx)

    cross_scores = cross_encoder.predict(candidate_pairs) if candidate_pairs else [0.0]
    best_cross_idx = int(np.argmax(cross_scores))
    best_cross_score = float(cross_scores[best_cross_idx])
    best_faq_index = candidate_indices[best_cross_idx] if candidate_indices else 0

    THRESHOLD_CROSS = 1.7
    if best_cross_score >= THRESHOLD_CROSS:
        return jsonify({
            "best_doc": faq_list[best_faq_index].get("answer",""),
            "best_score": best_cross_score,
            "corrected_query": corrected_query,
            "is_faq": True,
            "is_tramite": False,
            "personal_context": personal_context
        })

    # Web RAG-lite
    best_doc, tfidf_score = get_best_doc_and_score(corrected_query)
    is_tramite = "tramite" in corrected_query.lower() or "trámite" in corrected_query.lower()

    if tfidf_score > 0.1:
        return jsonify({
            "best_doc": best_doc[:1200],
            "best_score": tfidf_score,
            "corrected_query": corrected_query,
            "is_faq": False,
            "is_tramite": is_tramite,
            "personal_context": personal_context
        })
    else:
        return jsonify({
            "best_doc": "Lo siento, no encontré una respuesta adecuada.",
            "best_score": 0.0,
            "corrected_query": corrected_query,
            "is_faq": False,
            "is_tramite": False,
            "personal_context": personal_context
        })

# ---------- Speech-to-text (unchanged) ----------
device = "cuda" if torch.cuda.is_available() else "cpu"
whisper_model = whisper.load_model("large").to(device)

def transcribe_audio(audio_data):
    try:
        audio, _ = sf.read(io.BytesIO(audio_data))
        audio = np.array(audio, dtype=np.float32)
        result = whisper_model.transcribe(audio, language="es")
        return result["text"]
    except Exception as e:
        print("Error in transcription:", str(e))
        return ""

@app.route('/speech_to_text_stream', methods=['POST'])
def speech_to_text_stream():
    def generate():
        while True:
            audio_chunk = request.stream.read(4096)
            if not audio_chunk:
                break
            text = transcribe_audio(audio_chunk)
            yield f"data: {text}\n\n"
    return Response(generate(), mimetype="text/event-stream")

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port, debug=True)
