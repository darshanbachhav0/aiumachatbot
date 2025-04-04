
# UMA AI Chatbot

An advanced AI-powered chatbot developed for Universidad María Auxiliadora (UMA) that provides academic support through natural language interactions. This project integrates Natural Language Processing (NLP), Machine Learning (ML), and Speech Recognition to assist students in obtaining accurate responses to their queries. It is designed with a robust backend using Python Flask and offers both text and voice-based communication.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Key Features](#key-features)
- [Architecture and Design](#architecture-and-design)
- [Folder Structure](#folder-structure)
- [API Endpoints](#api-endpoints)
- [Installation and Setup](#installation-and-setup)
- [Usage](#usage)
- [Data and Training](#data-and-training)
- [Speech-to-Text Integration](#speech-to-text-integration)
- [Technologies and Dependencies](#technologies-and-dependencies)
- [Future Enhancements](#future-enhancements)
- [Contributing](#contributing)
- [License](#license)
- [Contact and Support](#contact-and-support)

---

## Project Overview

This chatbot is developed to enhance the student experience by providing real-time responses to academic queries. The project combines:
- **Text-based query understanding** using ML classifiers and FAQ embedding techniques.
- **Spell correction** using the SymSpell algorithm with a Spanish frequency dictionary.
- **Fallback retrieval methods** using TF-IDF vectorization and BM25 document similarity.
- **Voice input processing** leveraging OpenAI's Whisper for speech-to-text conversion.

The system is designed to recognize variations of questions and return structured, accurate answers pulled from a curated FAQ dataset and institutional documents.

---

## Key Features

- **Multimodal Interaction**: Support for both text and voice inputs.
- **Robust NLP Pipeline**:
  - **Spell Correction**: Automatically corrects user input using a Spanish frequency dictionary.
  - **FAQ Matching**: Uses SentenceTransformers for embedding question variations.
  - **Fallback Similarity Search**: Employs TF-IDF and BM25 algorithms if the primary ML classifier confidence is low.
- **ML-Based Classifier**: A custom-trained BERT (or multilingual) model to classify queries and return the best matching FAQ response.
- **Speech Recognition**: Converts live voice input into text using OpenAI's Whisper model.
- **Scalability and Maintainability**: Clear separation of backend logic, data preprocessing scripts, and training utilities.

---

## Architecture and Design

The project follows a modular architecture using Python Flask as the web framework. Key design components include:

- **Flask Backend**: Manages HTTP routes for serving the UI, processing queries, and handling voice input.
- **Data Processing Scripts**: 
  - `data2manual.py` is used to preprocess FAQ data and generate embeddings.
  - JSON files (`data1.json`, `data1withoutcategory.json`, `data2manual_train.json`) store initial questions and training data.
- **Machine Learning Pipeline**:
  - Utilizes **SentenceTransformer** for converting text into embeddings.
  - A **CrossEncoder** refines candidate answers.
  - An ML classifier (fine-tuned on FAQ variations) predicts the correct answer.
- **Fallback Retrieval**:
  - Implements TF-IDF vectorization and BM25 similarity search for cases when ML confidence is low.
- **Speech-to-Text Module**: Uses Whisper to transcribe incoming audio streams.

---

## Folder Structure

```
UMA-AI-Chatbot/
├── .vscode/                         # VS Code configuration files
│   └── settings.json
├── static/                          # Frontend assets (HTML, CSS, JS, images)
│   ├── index.html                   # Main user interface for the chatbot
│   ├── script.js                    # Frontend JavaScript logic
│   ├── style.css                    # UI styling
│   ├── logo.png                     # Project logo
│   └── other assets (e.g., gifs, banners)
├── app1.py                          # Main Flask application handling routing and API endpoints
├── data1.json                       # Initial FAQ dataset (structured Q&A)
├── data1withoutcategory.json        # Raw user queries without pre-assigned categories
├── data2manual_train.json           # Enhanced training data with question variations
├── data2manual.py                   # Script for processing and embedding training data
├── es_50k.txt                       # Spanish word frequency file for spell correction (SymSpell)
├── requirements.txt                 # List of Python dependencies
├── README.md                        # Project documentation (this file)
└── PDF Documents/                   # Institutional documents and references used for FAQ content
    ├── _Activa tu Cuenta UMA ZOOM - 2025.pdf
    ├── alumno-intranet.pdf
    ├── GUIA_NUEVO INGRESO A UMA - ZOOM.pdf
    ├── PAGOS ONLINE.pdf
    ├── SIGU-ALUMNO_INGRESO-2025.pdf
    ├── SIGU-MATRICULA-2025.pdf
    └── TRÁMITES-2025.pdf
```

---

## API Endpoints

The Flask backend exposes several endpoints:

- **GET /**  
  Loads the static UI for user interaction.

- **POST /get_response**  
  Processes a user query and returns:
  - `best_doc`: The best matching FAQ answer.
  - `confidence`: Confidence score from the ML classifier.
  - `model_accuracy`: Overall performance metric of the trained model.
  - `corrected_query`: The user’s query after spell correction.
  - `is_faq`: Boolean indicating if the response is from the FAQ database.
  - `method`: Indicates whether the response was generated via the ML classifier or fallback retrieval.

- **POST /correct_spelling**  
  Accepts a query in JSON format and returns a spell-corrected version of the input text.

- **POST /speech_to_text_stream**  
  Handles streaming audio input and converts it to text in real time using Whisper.

---

## Installation and Setup

### Prerequisites

- Python 3.8 or higher
- [FFmpeg](https://ffmpeg.org/) (required by Whisper)
- Git

### Installation Steps

1. **Clone the Repository**
   ```bash
   git clone https://github.com/your_username/UMA-AI-Chatbot.git
   cd UMA-AI-Chatbot
   ```

2. **Set Up a Virtual Environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scriptsctivate
   ```

3. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Download NLTK Stopwords**
   Run the following Python commands to download necessary NLTK data:
   ```python
   import nltk
   nltk.download('stopwords')
   ```

---

## Usage

### Running the Application

Start the Flask server with:
```bash
python app1.py
```
By default, the server runs on `http://0.0.0.0:10000` (or on port defined by the `PORT` environment variable).

### Interacting with the Chatbot

- **Text Interaction**: Open your web browser and navigate to the URL provided by the Flask server. Type your query and receive real-time responses.
- **Voice Interaction**: Use the integrated speech-to-text feature for hands-free query input.

---

## Data and Training

### Data Files

- **FAQ Datasets**:  
  - `data1.json` contains the initial set of FAQs.
  - `data1withoutcategory.json` holds raw queries without explicit categorization.
  - `data2manual_train.json` provides enriched training examples with multiple variations per question.

- **Data Processing**:  
  The script `data2manual.py` preprocesses and embeds training data using the SentenceTransformer model. It normalizes the text, generates embeddings, and prepares data for training the ML classifier.

### Model Training

The project employs a fine-tuned ML classifier:
- **ML Pipeline**:  
  Uses the `transformers` library with a model like `bert-base-multilingual-cased` for classification.
- **Training and Evaluation**:  
  The training script splits data into training and evaluation sets, tokenizes the text, and fine-tunes the model using the Hugging Face Trainer API. Model accuracy and performance metrics are saved and used during inference.

---

## Speech-to-Text Integration

- **Whisper Model**:  
  OpenAI’s Whisper (tiny or large version) is used to transcribe incoming audio streams. This feature enables the chatbot to convert voice inputs into text seamlessly.
- **Streaming Endpoint**:  
  The `/speech_to_text_stream` endpoint continuously reads audio chunks from the client, processes them, and returns real-time transcription data.

---

## Technologies and Dependencies

- **Backend Framework**: Flask, Flask-CORS
- **NLP and ML**: scikit-learn, SentenceTransformers, transformers, torch, numpy
- **Spell Correction**: symspellpy with a Spanish frequency file (`es_50k.txt`)
- **Web Scraping**: requests, BeautifulSoup
- **Speech Recognition**: OpenAI Whisper, soundfile, ffmpeg-python
- **Data Processing**: nltk, unidecode, regex

Refer to `requirements.txt` for the complete list of dependencies.

---

## Future Enhancements

- **Text-to-Speech (TTS)**:  
  Integrate a TTS module for voice output responses.
- **Dynamic Data Integration**:  
  Connect to UMA’s student intranet for real-time academic information.
- **Enhanced Admin Dashboard**:  
  Develop an interface for managing FAQs and training data.
- **Improved ML Models**:  
  Experiment with larger transformer models for improved accuracy.
- **User Analytics**:  
  Implement logging and analytics to monitor chatbot performance and user satisfaction.

---

## Contributing

Contributions are welcome! To contribute:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature/your-feature`).
3. Commit your changes (`git commit -m 'Add some feature'`).
4. Push to the branch (`git push origin feature/your-feature`).
5. Open a pull request.

Please follow the coding guidelines and ensure tests pass before submitting your pull request.

---



*This documentation is subject to updates as the project evolves. Thank you for supporting UMA’s academic innovation!*
