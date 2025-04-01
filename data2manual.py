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
from sentence_transformers import SentenceTransformer, util, CrossEncoder
from rank_bm25 import BM25Okapi
from unidecode import unidecode

# Additional imports for ML training feature
from transformers import AutoTokenizer, AutoModelForSequenceClassification, Trainer, TrainingArguments
from datasets import Dataset

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

@app.route('/')
def index():
    return app.send_static_file('index.html')

# ----------------------------- SPELLING CORRECTION -----------------------------
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

# ----------------------------- SCRAPING & BM25 -----------------------------
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
    "https://uma.edu.pe/curso-ia40/",
    "https://uma.edu.pe/por-que-la-uma/",
    "https://uma.edu.pe/admisionpregrado/",
]

nltk.download('stopwords')
spanish_stopwords = stopwords.words('spanish')

documents = []
for url in urls:
    text = scrape_page(url)
    if text:
        documents.append(text)
if not documents:
    documents.append("No data available.")

bm25_docs = [doc.lower().split() for doc in documents]
bm25_model = BM25Okapi(bm25_docs)

vectorizer = TfidfVectorizer(stop_words=spanish_stopwords)
doc_vectors = vectorizer.fit_transform(documents)

def normalize_text(text):
    text = text.lower()
    text = unidecode(text)
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
    bm25_best_score = max(bm25_scores)
    
    UMA_KEYWORDS = ["curso", "cursos", "admisión", "facultad", "estudios", "clases", "universidad"]
    if any(keyword in normalized_query for keyword in UMA_KEYWORDS) and best_score < 0.3:
        best_score += 0.1

    final_score = max(best_score, bm25_best_score / 10)
    return best_doc, final_score

# ----------------------------- FAQ EMBEDDING -----------------------------
# Load the modified JSON dataset that uses "variations" as the list of examples
with open("data2manual_train.json", "r", encoding="utf-8") as f:
    raw_data = json.load(f)
    faq_list = [faq for faq in raw_data if isinstance(faq, dict)]

# Updated to use only the "variations" field as examples.
def create_faq_embedding_text(faq):
    examples = " ".join(faq.get("variations", []))
    return normalize_text(examples)

faq_model = SentenceTransformer("intfloat/e5-large")
faq_texts = [create_faq_embedding_text(faq) for faq in faq_list]
faq_embeddings = faq_model.encode(faq_texts, convert_to_tensor=True)

cross_encoder = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

# ----------------------------- ML TRAINING FEATURE -----------------------------
def train_classifier():
    texts = []
    labels = []
    # For the new JSON format, use the "variations" field as training examples.
    for i, faq in enumerate(faq_list):
        text = " ".join(faq.get("variations", []))
        texts.append(normalize_text(text))
        labels.append(i)
    train_data = {"text": texts, "label": labels}
    dataset = Dataset.from_dict(train_data)
    split_dataset = dataset.train_test_split(test_size=0.2, seed=42)
    train_dataset = split_dataset["train"]
    eval_dataset = split_dataset["test"]
    
    model_name = "bert-base-multilingual-cased"
    tokenizer_ml = AutoTokenizer.from_pretrained(model_name)
    def tokenize_function(example):
        return tokenizer_ml(example["text"], truncation=True, padding="max_length")
    train_dataset = train_dataset.map(tokenize_function, batched=True)
    eval_dataset = eval_dataset.map(tokenize_function, batched=True)
    
    train_dataset = train_dataset.remove_columns(["text"])
    eval_dataset = eval_dataset.remove_columns(["text"])
    
    num_labels = len(faq_list)
    model_ml = AutoModelForSequenceClassification.from_pretrained(model_name, num_labels=num_labels)
    
    training_args = TrainingArguments(
        output_dir="./results",
        num_train_epochs=3,
        per_device_train_batch_size=4,
        per_device_eval_batch_size=4,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        logging_steps=10,
        disable_tqdm=True,
    )
    
    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        predictions = np.argmax(logits, axis=-1)
        accuracy = np.mean(predictions == labels)
        return {"accuracy": accuracy}
    
    trainer_ml = Trainer(
        model=model_ml,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        compute_metrics=compute_metrics,
    )
    
    trainer_ml.train()
    eval_results = trainer_ml.evaluate()
    accuracy = eval_results["eval_accuracy"]
    
    model_ml.save_pretrained("./trained_faq_model")
    tokenizer_ml.save_pretrained("./trained_faq_model")
    
    with open("model_accuracy.txt", "w") as f:
        f.write(str(accuracy))
        
    return accuracy, model_ml, tokenizer_ml

if not os.path.exists("./trained_faq_model"):
    model_accuracy, trained_model, trained_tokenizer = train_classifier()
else:
    if os.path.exists("model_accuracy.txt"):
        with open("model_accuracy.txt", "r") as f:
            model_accuracy = float(f.read())
    else:
        model_accuracy = 0.0
    trained_tokenizer = AutoTokenizer.from_pretrained("./trained_faq_model")
    trained_model = AutoModelForSequenceClassification.from_pretrained("./trained_faq_model")

# ----------------------------- GET RESPONSE (ML CLASSIFIER) -----------------------------
@app.route('/get_response', methods=['POST'])
def get_response():
    data = request.get_json()
    query = data.get("query", "")
    corrected_query = correct_spelling(query)
    normalized_query = normalize_text(corrected_query)
    
    # Use the trained ML classifier to predict FAQ index
    inputs = trained_tokenizer(normalized_query, return_tensors="pt", truncation=True, padding=True)
    with torch.no_grad():
        outputs = trained_model(**inputs)
    logits = outputs.logits
    probs = torch.softmax(logits, dim=-1)
    pred_label = int(torch.argmax(probs, dim=-1).item())
    confidence = float(probs[0][pred_label])
    
    ml_answer = faq_list[pred_label]["answer"]
    
    return jsonify({
        "best_doc": ml_answer,
        "model_accuracy": model_accuracy,
        "confidence": confidence,
        "corrected_query": corrected_query,
        "is_faq": True,
        "method": "ml_classifier"
    })

# ----------------------------- SPEECH TO TEXT -----------------------------
device = "cuda" if torch.cuda.is_available() else "cpu"
whisper_model = whisper.load_model("tiny").to(device)

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
