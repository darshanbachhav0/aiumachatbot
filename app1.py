import os
import json
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
from sentence_transformers import SentenceTransformer, util

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

@app.route('/')
def index():
    return app.send_static_file('index.html')

# ----------------------------------------------------------------
# SPELLING CORRECTION (SymSpell)
# ----------------------------------------------------------------
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
    data = request.get_json()
    user_input = data.get("query", "")
    corrected_query = correct_spelling(user_input)
    return jsonify({"corrected_query": corrected_query})


def correct_spelling_internal(text):
    corrected_words = []
    for word in text.split():
        suggestions = sym_spell.lookup(word, Verbosity.CLOSEST, max_edit_distance=2)
        corrected_word = suggestions[0].term if suggestions else word
        corrected_words.append(corrected_word)
    return " ".join(corrected_words)

# ----------------------------------------------------------------
# 2) WEB SCRAPING & TF-IDF
# ----------------------------------------------------------------
# ----------------------------------------------------------------
def scrape_page(url):
    try:
        response = requests.get(url)
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
    "https://uma.edu.pe/alumni/",
    "https://uma.edu.pe/docentes/",
    "https://uma.edu.pe/curso-ia40/",
    "https://uma.edu.pe/por-que-la-uma/",
    "https://uma.edu.pe/admisionpregrado/",
    "https://uma.edu.pe/noticias/",
    "https://uma.edu.pe/convenios-internacionales/",
    "https://uma.edu.pe/convenios-nacionales/"
]

documents = []
for url in urls:
    text = scrape_page(url)
    if text:
        documents.append(text)
if not documents:
    documents.append("No data available.")

nltk.download('stopwords')
spanish_stopwords = stopwords.words('spanish')
vectorizer = TfidfVectorizer(stop_words=spanish_stopwords)
doc_vectors = vectorizer.fit_transform(documents)


def get_best_doc_and_score(query):
    query_vec = vectorizer.transform([query])
    similarities = cosine_similarity(query_vec, doc_vectors).flatten()
    best_idx = similarities.argmax()
    best_doc = documents[best_idx]
    best_score = similarities[best_idx]
    UMA_KEYWORDS = ["curso", "cursos", "admisión", "facultad", "estudios", "clases", "universidad"]
    if any(keyword in query.lower() for keyword in UMA_KEYWORDS) and best_score < 0.3:
        best_score += 0.1
    return best_doc, best_score

def normalize_text(text):
    text = text.lower()
    text = re.sub(r'[^\w\sáéíóúñü]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

# ----------------------------------------------------------------
# 3) LOAD FAQ DATA FROM data.json & PRECOMPUTE EMBEDDINGS
# ----------------------------------------------------------------
# ----------------------------------------------------------------
# 3) LOAD FAQ DATA FROM data.json & PRECOMPUTE EMBEDDINGS
# ----------------------------------------------------------------
with open("data1.json", "r", encoding="utf-8") as f:
    raw_data = json.load(f)
    faq_list = [faq for faq in raw_data if isinstance(faq, dict)]

def create_faq_embedding_text(faq):
    variations_text = " ".join(faq.get("variations", []))
    synonyms_text = " ".join(faq.get("synonyms", []))
    return faq["question"] + " " + variations_text + " " + synonyms_text

faq_model = SentenceTransformer("sentence-transformers/multi-qa-mpnet-base-dot-v1")
faq_texts = [create_faq_embedding_text(faq) for faq in faq_list]
faq_embeddings = faq_model.encode(faq_texts, convert_to_tensor=True)



@app.route('/get_response', methods=['POST'])
def get_response():
    data = request.get_json()
    query = data.get("query", "")
    corrected_query = correct_spelling(query)

    query_embedding = faq_model.encode(corrected_query, convert_to_tensor=True)
    scores = util.pytorch_cos_sim(query_embedding, faq_embeddings).cpu().numpy().flatten()
    best_index = int(np.argmax(scores))
    best_score = float(scores[best_index])
    THRESHOLD_FAQ = 0.65

    if best_score >= THRESHOLD_FAQ:
        return jsonify({
            "best_doc": faq_list[best_index]["answer"],
            "best_score": best_score,
            "corrected_query": corrected_query,
            "is_faq": True
        })
    
    return jsonify({
        "best_doc": "No relevant answer found.",
        "best_score": 0.0,
        "corrected_query": corrected_query,
        "is_faq": False
    })




# ----------------------------------------------------------------
# 4) WHISPER FOR SPEECH-TO-TEXT
# ----------------------------------------------------------------
device = "cuda" if torch.cuda.is_available() else "cpu"
whisper_model = whisper.load_model("small").to(device)

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
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)