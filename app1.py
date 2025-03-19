import os
import json
from flask import Flask, request, jsonify, Response, g
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

# ----------------------------------------------------------------
# 2) WEB SCRAPING & TF-IDF
# ----------------------------------------------------------------
def scrape_page(url):
    try:
        response = requests.get(url, stream=True)  # Stream response to save memory
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        paragraphs = soup.find_all('p')
        page_text = " ".join(p.get_text() for p in paragraphs)
        return page_text[:5000]  # Limit to 5000 characters to reduce RAM usage
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

documents = [scrape_page(url) for url in urls if scrape_page(url)]
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

# ----------------------------------------------------------------
# 3) FAQ DATA LOADING (Lazy & Efficient)
# ----------------------------------------------------------------
def get_faq_model():
    if not hasattr(g, 'faq_model'):
        g.faq_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")  # Lighter model
    return g.faq_model

def get_faq_data():
    with open("data1.json", "r", encoding="utf-8") as f:
        for line in f:
            yield json.loads(line)  # Stream data instead of loading all at once

@app.route('/get_response', methods=['POST'])
def get_response():
    data = request.get_json()
    query = data.get("query", "")
    corrected_query = correct_spelling(query)

    faq_model = get_faq_model()
    query_embedding = faq_model.encode(corrected_query, convert_to_tensor=True)

    best_match = None
    best_score = 0.0
    THRESHOLD_FAQ = 0.65

    for faq in get_faq_data():
        faq_embedding = faq_model.encode(faq["question"], convert_to_tensor=True)
        score = util.pytorch_cos_sim(query_embedding, faq_embedding).item()

        if score > best_score:
            best_match = faq
            best_score = score

    if best_score >= THRESHOLD_FAQ:
        return jsonify({
            "best_doc": best_match["answer"],
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
# 4) WHISPER FOR SPEECH-TO-TEXT (Lazy Loading)
# ----------------------------------------------------------------
def get_whisper_model():
    if not hasattr(g, 'whisper_model'):
        g.whisper_model = whisper.load_model("tiny").to("cpu")  # Lighter model, use CPU to save RAM
    return g.whisper_model

def transcribe_audio(audio_data):
    try:
        whisper_model = get_whisper_model()
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

# ----------------------------------------------------------------
# 5) FLASK SERVER CONFIGURATION (Optimized for Render)
# ----------------------------------------------------------------
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 10000))  # Bind to the correct Render port
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)  # Disable debug mode, enable threading
