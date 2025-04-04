
# UMA AI Chatbot

An advanced AI-powered chatbot developed for Universidad María Auxiliadora (UMA) that provides academic support through natural language interactions. This project integrates Gemini AI,  Natural Language Processing (NLP), Machine Learning (ML), and Speech Recognition to assist students in obtaining accurate responses to their queries. It is designed with a robust backend using Python Flask and offers both text and voice-based communication.

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
- [Gemini Integration](#gemini-integration)





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
├── .vscode/
│   └── settings.json
├── static/
│   ├── index.html
│   ├── script.js
│   ├── style.css
│   ├── logo.png
│   └── other assets
├── app1.py
├── data1.json
├── data1withoutcategory.json
├── data2manual_train.json
├── data2manual.py
├── es_50k.txt
├── requirements.txt
├── README.md
└── PDF Documents/
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

- **GET /**  
  Loads the static UI for user interaction.

- **POST /get_response**  
  Returns:
  - `best_doc`, `confidence`, `model_accuracy`, `corrected_query`, `is_faq`, `method`

- **POST /correct_spelling**  
  Corrects and normalizes user input.

- **POST /speech_to_text_stream**  
  Streams audio and converts it to text using Whisper.

---

## Installation and Setup

### Prerequisites

- Python 3.8+
- [FFmpeg](https://ffmpeg.org/)
- Git

### Steps

```bash
git clone https://github.com/your_username/UMA-AI-Chatbot.git
cd UMA-AI-Chatbot
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

```python
import nltk
nltk.download('stopwords')
```

---

## Usage

```bash
python app1.py
```
Navigate to `http://0.0.0.0:10000`

---

## Data and Training

- `data1.json`, `data1withoutcategory.json`, `data2manual_train.json`
- Training uses transformers and SentenceTransformer for embeddings.
- Evaluation metrics saved and logged.

---

## Speech-to-Text Integration

- OpenAI Whisper used for Spanish audio.
- Real-time transcription via `/speech_to_text_stream`.

---


---


## Gemini Integration

To further enhance the chatbot’s intelligence and language understanding capabilities, a **Gemini AI** module is integrated as a core feature of the chatbot.

### 🔷 Overview

Gemini is used as an auxiliary engine when:
- The local model confidence is extremely low.
- The FAQ database has no semantically relevant match.
- A query appears open-ended or conversational in nature.

### 🔧 Technical Workflow

1. **Precheck Layer**:
   - If both ML and BM25 return low confidence, Gemini API is triggered.
2. **Prompting**:
   - The user query is sent to Gemini with contextual instructions based on the institution’s FAQ data.
3. **Postprocessing**:
   - Gemini's answer is validated against university policy filters.
   - The result is merged with source links or suggestions if applicable.

> **Note:** Gemini is currently used only when absolutely necessary to avoid latency and cost implications.

---







*This README evolves as the project matures.*
