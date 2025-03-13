import os
from flask import Flask, request, jsonify
import requests
from bs4 import BeautifulSoup
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from flask_cors import CORS

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

@app.route('/')
def index():
    """
    Serves the index.html file from the 'static' folder at the root URL.
    """
    return app.send_static_file('index.html')

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
    "https://uma.edu.pe/admision/",
    "https://uma.edu.pe/proyectos-de-investigacion/",
    "https://uma.edu.pe/uma-barrio/",
    "https://uma.edu.pe/alumni/",
    "https://uma.edu.pe/docentes/",
    "https://uma.edu.pe/oficina-de-gestion-docente/",
  
"https://uma.edu.pe/dici-uma/",
"https://uma.edu.pe/contactos/",
"https://uma.edu.pe/curso-ia40/",
"https://uma.edu.pe/uma-solar/",
"https://uma.edu.pe/proyecto-suma/",
"https://uma.edu.pe/voluntariado/",
"https://uma.edu.pe/postula-aqui/",
"https://uma.edu.pe/expoferia-virtual-uma-exhibira-productos-de-emprendedores/",
"https://uma.edu.pe/uma-lanza-cursos-cortos-para-emprendedores-y-mipymes/",
"https://uma.edu.pe/22-oct-uma-10-anos-10-momentos-que-marcaron-nuestra-historia/",
"https://uma.edu.pe/uma-realizo-congreso-internacional-de-investigacion/",
"https://uma.edu.pe/uma-realizo-con-exito-el-expo-emprendedor-2021/"


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
    best_doc, best_score = get_best_doc_and_score(query)
    return jsonify({
        "best_doc": best_doc,
        "best_score": float(best_score)
    })

if __name__ == '__main__':
    # Grab the PORT environment variable provided by Render, default to 5000 locally
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
