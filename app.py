import os
from flask import Flask, request, jsonify, Response  # Add Response here!

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
whisper_model = whisper.load_model("small")



app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

@app.route('/')
def index():
    """ Serves the index.html file from the 'static' folder at the root URL. """
    return app.send_static_file('index.html')

# Initialize SymSpell for spelling correction
sym_spell = SymSpell(max_dictionary_edit_distance=2, prefix_length=7)
sym_spell.load_dictionary("es_50k.txt", term_index=0, count_index=1)

@app.route('/correct_spelling', methods=['POST'])
def correct_spelling():
    """ Corrects spelling mistakes in Spanish queries. """
    data = request.get_json()
    user_input = data.get("query", "")

    corrected_words = []
    for word in user_input.split():
        suggestions = sym_spell.lookup(word, Verbosity.CLOSEST, max_edit_distance=2)
        corrected_word = suggestions[0].term if suggestions else word
        corrected_words.append(corrected_word)

    corrected_query = " ".join(corrected_words)
    return jsonify({"corrected_query": corrected_query})


def scrape_page(url):
    """
    Fetches the URL and extracts text from all <p> tags.
    """
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

# List of UMA pages to scrape
urls = [
    "https://uma.edu.pe/",
    "https://uma.edu.pe/alumni/",
    "https://uma.edu.pe/docentes/",
    "https://uma.edu.pe/contactos/",
    "https://uma.edu.pe/curso-ia40/",
    "https://uma.edu.pe/por-que-la-uma/",
    "https://uma.edu.pe/admisionpregrado/",
    "https://uma.edu.pe/noticias/",
    "https://uma.edu.pe/convenios-internacionales/",
    "https://uma.edu.pe/convenios-nacionales/"
]

# Scrape pages and store the results in 'documents'
documents = []
for url in urls:
    text = scrape_page(url)
    if text:
        documents.append(text)

# If no data is scraped, store a placeholder
if not documents:
    documents.append("No data available.")

# Initialize TF-IDF
vectorizer = TfidfVectorizer(stop_words='english')
doc_vectors = vectorizer.fit_transform(documents)

def get_best_doc_and_score(query):
    """
    Given a user query, returns:
      best_doc  : the text of the most similar scraped document
      best_score: the highest similarity score (float)
    """
    query_vec = vectorizer.transform([query])
    similarities = cosine_similarity(query_vec, doc_vectors).flatten()
    best_idx = similarities.argmax()
    best_doc = documents[best_idx]
    best_score = similarities[best_idx]
    return best_doc, best_score

@app.route('/get_response', methods=['POST'])
def get_response():
    """
    Endpoint for the chatbot's POST request.
    Expects JSON with 'query' field.
    Returns the best matching document and its similarity score.
    """
    data = request.get_json()
    query = data.get("query", "")

    # Correct spelling before processing
    corrected_query = correct_spelling_internal(query)

    best_doc, best_score = get_best_doc_and_score(corrected_query)
    return jsonify({
        "best_doc": best_doc,
        "best_score": float(best_score),
        "corrected_query": corrected_query
    })

def correct_spelling_internal(text):
    """
    Internal function for correcting spelling.
    """
    corrected_words = []
    for word in text.split():
        suggestions = sym_spell.lookup(word, Verbosity.CLOSEST, max_edit_distance=2)
        corrected_word = suggestions[0].term if suggestions else word
        corrected_words.append(corrected_word)
    return " ".join(corrected_words)


# Load Whisper model
device = "cuda" if torch.cuda.is_available() else "cpu"
whisper_model = whisper.load_model("small").to(device)

def transcribe_audio(audio_data):
    """
    Transcribes Spanish speech-to-text using OpenAI Whisper.
    """
    try:
        # Convert raw audio bytes to numpy array
        audio, _ = sf.read(io.BytesIO(audio_data))

        # Ensure audio is in float32 format for Whisper
        audio = np.array(audio, dtype=np.float32)

        # Transcribe the audio using Whisper in Spanish only
        result = whisper_model.transcribe(audio, language="es")

        return result["text"]
    except Exception as e:
        print("Error in transcription:", str(e))
        return ""
    
@app.route('/speech_to_text_stream', methods=['POST'])
def speech_to_text_stream():
    """
    Streams audio from the frontend and transcribes it live in Spanish.
    """
    def generate():
        while True:
            audio_chunk = request.stream.read(4096)  # Read small audio chunks
            if not audio_chunk:
                break
            text = transcribe_audio(audio_chunk)
            yield f"data: {text}\n\n"

    return Response(generate(), mimetype="text/event-stream")  # ✅ Fixed import issue


if __name__ == '__main__':
    # Grab the PORT environment variable provided by Render, default to 5000 locally
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
