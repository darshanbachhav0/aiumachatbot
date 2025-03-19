import os
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
    """Serves the index.html file from the 'static' folder at the root URL."""
    return app.send_static_file('index.html')

# ----------------------------------------------------------------
# 1) SPELLING CORRECTION (SymSpell)
# ----------------------------------------------------------------
sym_spell = SymSpell(max_dictionary_edit_distance=2, prefix_length=7)
sym_spell.load_dictionary("es_50k.txt", term_index=0, count_index=1)

@app.route('/correct_spelling', methods=['POST'])
def correct_spelling():
    data = request.get_json()
    user_input = data.get("query", "")
    corrected_words = []
    for word in user_input.split():
        suggestions = sym_spell.lookup(word, Verbosity.CLOSEST, max_edit_distance=2)
        corrected_word = suggestions[0].term if suggestions else word
        corrected_words.append(corrected_word)
    corrected_query = " ".join(corrected_words)
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
    "https://uma.edu.pe/contactos/",
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
# 3) FAQ with SYNONYMS & STRONG EMBEDDING MODEL
# ----------------------------------------------------------------
# We'll embed the question + synonyms as a single string for better matching.
# The user can ask in different ways, but if it matches synonyms, we get a high similarity.

faq_list = [
    # Coordinación Académica
    {
        "question": "¿Cuándo inicia la matrícula para el próximo ciclo?",
        "synonyms": [
            "inicio de matrícula", "fecha de matrícula", "próximo semestre", "fechas de matrícula"
        ],
        "answer": """Las fechas de matrícula varían según el calendario académico. 
Puedes consultar las fechas actualizadas contactando a Coordinación Académica:
📞 (01) 389-1212 Anexo 318
📱 WhatsApp: 933 670 445
📧 coacademica@uma.edu.pe"""
    },
    {
        "question": "¿Cómo solicito un cambio de turno o sección?",
        "synonyms": [
            "cambio de turno", "cambio de sección", "modificar turno", "solicitar cambio de sección"
        ],
        "answer": """Para solicitar un cambio de turno o sección, debes presentar tu solicitud 
a Coordinación Académica dentro de las fechas establecidas. Puedes contactarlos para más detalles."""
    },
    {
        "question": "¿Qué hago si tengo un problema con mi horario de clases?",
        "synonyms": [
            "problema con horario", "inconvenientes con mi horario", "clase solapada", "conflicto de horario"
        ],
        "answer": """Si tienes inconvenientes con tu horario, debes comunicarte con Coordinación Académica 
lo antes posible para revisar tu caso y encontrar una solución."""
    },
    {
        "question": "¿Cómo puedo solicitar un curso adelantado?",
        "synonyms": [
            "curso adelantado", "adelantar curso", "tomar curso antes", "curso anticipado"
        ],
        "answer": """Para adelantar un curso, debes cumplir con los requisitos académicos 
y presentar tu solicitud a Coordinación Académica. Contáctanos para más detalles."""
    },
    {
        "question": "¿Cuántas veces puedo desaprobar un curso antes de ser retirado?",
        "synonyms": [
            "desaprobar curso", "límite de desaprobaciones", "fail a course", "cuántas veces puedo desaprobar"
        ],
        "answer": """Según el reglamento académico, existe un límite de desaprobaciones antes de ser dado de baja en la asignatura. 
Te recomendamos revisar el reglamento o contactar a Coordinación Académica."""
    },
    {
        "question": "¿Cómo puedo solicitar una reubicación en un grupo de clases?",
        "synonyms": [
            "reubicación de grupo", "cambio de grupo", "moverse de sección"
        ],
        "answer": """Debes presentar una solicitud formal indicando el motivo. 
La aprobación dependerá de la disponibilidad de cupos."""
    },
    {
        "question": "¿Cuáles son los requisitos para egresar de mi carrera?",
        "synonyms": [
            "requisitos de egreso", "graduación requisitos", "terminar carrera"
        ],
        "answer": """Debes haber aprobado todos los cursos del plan de estudios, cumplir con el trabajo de titulación 
y no tener deudas pendientes con la universidad."""
    },
    # Oficina de Tesorería
    {
        "question": "¿Cuáles son las opciones de pago de mis pensiones?",
        "synonyms": [
            "formas de pago pensión", "pago de pensiones", "pago de mensualidad", "pago de matrícula"
        ],
        "answer": """Puedes pagar tus pensiones mediante transferencia bancaria, pago en ventanilla 
o a través de la plataforma virtual de la universidad. Para más información:
📞 (01) 389-1212 Anexo 321
📱 WhatsApp: 970 408 211
📧 contactotesoreria@uma.edu.pe"""
    },
    {
        "question": "¿Dónde veo mi estado de cuenta?",
        "synonyms": [
            "ver mi cuenta", "consultar balance", "estado de cuenta pensión"
        ],
        "answer": """Puedes consultar tu estado de cuenta en la plataforma de autoservicio 
de la universidad o comunicándote con Tesorería."""
    },
    {
        "question": "¿Puedo fraccionar el pago de mi pensión?",
        "synonyms": [
            "pago en partes", "fraccionar pensión", "pago fraccionado"
        ],
        "answer": """Sí, la universidad ofrece opciones de fraccionamiento. 
Debes coordinarlo directamente con Tesorería."""
    },
    {
        "question": "¿Qué sucede si no pago mi pensión a tiempo?",
        "synonyms": [
            "pago tardío pensión", "no pagué pensión", "pagar fuera de fecha"
        ],
        "answer": """Si no realizas el pago en la fecha establecida, se generarán intereses moratorios 
y podrías tener restricciones académicas."""
    },
    {
        "question": "¿Puedo pagar mi matrícula con tarjeta de crédito?",
        "synonyms": [
            "pagar con tarjeta", "tarjeta de crédito", "tarjeta de débito", "pago con tarjeta"
        ],
        "answer": """Sí, aceptamos pagos con tarjeta de crédito o débito. 
Puedes realizarlo en línea o en la Tesorería de la universidad."""
    },
    {
        "question": "¿Cuáles son los bancos afiliados para el pago de pensiones?",
        "synonyms": [
            "bancos afiliados", "bancos convenio", "dónde pagar pensiones"
        ],
        "answer": """Puedes realizar pagos en los bancos con los que la universidad tiene convenio. 
Para más detalles, contacta con Tesorería."""
    },
    {
        "question": "¿Cómo solicito un comprobante de pago?",
        "synonyms": [
            "comprobante de pago", "recibo de pago", "proof of payment"
        ],
        "answer": """Puedes solicitarlo directamente en Tesorería o mediante 
el correo electrónico oficial."""
    },
    # Oficina de Servicios Académicos (OSAR)
    {
        "question": "¿Cómo solicito un certificado de estudios?",
        "synonyms": [
            "certificado de estudios", "transcript", "solicitar certificado"
        ],
        "answer": """Debes solicitarlo en la Oficina de Servicios Académicos (OSAR) 
y pagar el derecho correspondiente en tu plataforma SIGU. Más información en:
📞 (01) 389-1212 Anexo 313
📱 WhatsApp: 934 563 160
📧 osar@uma.edu.pe"""
    },
    {
        "question": "¿Cuánto tiempo demora la emisión de una constancia de matrícula?",
        "synonyms": [
            "tiempo constancia de matrícula", "demora constancia matrícula", "issue registration certificate"
        ],
        "answer": """El tiempo de emisión varía, pero generalmente es entre 3 a 5 días hábiles."""
    },
    {
        "question": "¿Cómo solicito la reprogramación de un examen?",
        "synonyms": [
            "reprogramar examen", "examen fuera de fecha", "examen reprogramación"
        ],
        "answer": """Para reprogramar un examen, debes presentar una solicitud justificada 
ante OSAR dentro del plazo establecido."""
    },
    {
        "question": "¿Cómo puedo tramitar mi carné universitario?",
        "synonyms": [
            "carné universitario", "id de estudiante", "tarjeta de estudiante"
        ],
        "answer": """Debes acercarte a OSAR y presentar tu solicitud junto con 
el pago correspondiente."""
    },
    {
        "question": "¿Qué debo hacer si mi nombre aparece con un error en los documentos oficiales?",
        "synonyms": [
            "error en nombre", "nombre incorrecto", "documentos con error"
        ],
        "answer": """Debes presentar una solicitud de corrección junto con una copia de tu documento de identidad."""
    },
    {
        "question": "¿Cómo solicito la reserva de matrícula?",
        "synonyms": [
            "reserva de matrícula", "reservar matrícula", "enrollment reservation"
        ],
        "answer": """Para reservar tu matrícula, debes presentar una solicitud dentro de las fechas establecidas 
y cumplir con los requisitos administrativos."""
    },
    {
        "question": "¿Dónde solicito una constancia de egresado?",
        "synonyms": [
            "constancia de egresado", "certificado de egresado", "egresado certificate"
        ],
        "answer": """En la Oficina de Servicios Académicos, presentando una solicitud 
y pagando el derecho correspondiente dentro de tu plataforma SIGU."""
    },
    # Tecnología de la Información
    {
        "question": "Olvidé mi contraseña del aula virtual, ¿cómo la recupero?",
        "synonyms": [
            "restablecer contraseña aula virtual", "olvidé mi password", "contraseña plataforma"
        ],
        "answer": """Puedes restablecer tu contraseña en la plataforma o comunicarte con el área de TI:
📞 (01) 389-1212 Anexos 334 / 317
📱 WhatsApp: 982 888 601
📧 soporte.online@uma.edu.pe"""
    },
    {
        "question": "¿Qué hago si la plataforma virtual no carga?",
        "synonyms": [
            "problemas plataforma virtual", "no carga el aula", "error al cargar"
        ],
        "answer": """Intenta limpiar la caché de tu navegador o usar otro dispositivo. 
Si el problema persiste, contacta a Tecnología de la Información."""
    },
    {
        "question": "¿Cómo accedo al Wi-Fi de la universidad?",
        "synonyms": [
            "conectarme wifi", "wifi universidad", "acceso wifi", "contraseña wifi"
        ],
        "answer": """Deberas conectarte a la red COMUNIDAD UMA con la contraseña @uMa.2024@"""
    },
    {
        "question": "¿Cómo recupero mi acceso a la plataforma si olvidé mi contraseña?",
        "synonyms": [
            "olvidé mi contraseña", "no puedo entrar plataforma", "reset password"
        ],
        "answer": """Puedes restablecerla en la opción "Olvidé mi contraseña" en la plataforma. 
Si persiste el problema, contáctanos."""
    },
    {
        "question": "¿Qué hago si no puedo acceder a mi correo institucional?",
        "synonyms": [
            "correo institucional inaccesible", "email no funciona", "problema con correo"
        ],
        "answer": """Verifica tu conexión a internet e intenta restablecer la contraseña. 
Si sigues teniendo problemas, contacta a Tecnología de la Información."""
    },
    {
        "question": "¿Dónde reporto problemas con la red Wi-Fi de la universidad?",
        "synonyms": [
            "problemas con wifi", "reportar wifi", "wifi no funciona"
        ],
        "answer": """Puedes reportarlo directamente en el área de Tecnología de la Información 
o a través del correo de soporte."""
    },
    # Mesa de Partes
    {
        "question": "¿Cómo presento una solicitud en Mesa de Partes?",
        "synonyms": [
            "solicitud mesa de partes", "enviar solicitud", "tramitar en mesa de partes"
        ],
        "answer": """Puedes presentar tu solicitud presencialmente o enviarla por correo electrónico a:
📞 (01) 389-1212 Anexo 322
📱 WhatsApp: 982 887 539
📧 mesadepartes@uma.edu.pe"""
    },
    {
        "question": "¿Cuánto tiempo tarda en procesarse mi trámite?",
        "synonyms": [
            "tiempo trámite", "demora trámite", "procesar mi solicitud"
        ],
        "answer": """El tiempo de respuesta varía según el tipo de trámite. 
Puedes hacer seguimiento comunicándote con Mesa de Partes o en tu plataforma SIGU 
en la opción Mis tramites y pagos – Mis tramites."""
    },
    {
        "question": "¿Qué tipo de documentos puedo presentar en Mesa de Partes?",
        "synonyms": [
            "documentos mesa de partes", "qué se presenta en mesa de partes", "solicitudes mesa de partes"
        ],
        "answer": """Puedes presentar solicitudes académicas, administrativas y documentos oficiales 
dirigidos a las diferentes áreas de la universidad."""
    },
    {
        "question": "¿Puedo hacer un trámite de forma virtual?",
        "synonyms": [
            "trámite virtual", "tramite online", "hacer trámite digital"
        ],
        "answer": """Sí, todos los trámites pueden ser generados por tu plataforma SIGU. 
Contacta con Mesa de Partes para conocer los requisitos."""
    },
    {
        "question": "¿Cómo sé si mi trámite ha sido aprobado?",
        "synonyms": [
            "verificar trámite", "estado de mi trámite", "mi solicitud fue aprobada"
        ],
        "answer": """Puedes hacer el seguimiento a través de tu plataforma SIGU en la opción Mis Tramites 
o contactando a Mesa de Partes."""
    },
    {
        "question": "¿Cuál es el horario de atención de Mesa de Partes?",
        "synonyms": [
            "horario mesa de partes", "horas de atención", "cuando abre mesa de partes"
        ],
        "answer": """El horario de atención es de lunes a viernes en horario de oficina."""
    },
    # Educación Virtual
    {
        "question": "¿Cómo accedo a mis clases virtuales?",
        "synonyms": [
            "clases online", "entrar a aula virtual", "acceso clases virtuales"
        ],
        "answer": """Debes ingresar a la plataforma virtual de la universidad con tu usuario y contraseña. 
Si tienes problemas, contacta a Educación Virtual:
📞 (01) 389-1212 Anexo 304
📧 educacion.virtual@uma.edu.pe"""
    },
    {
        "question": "¿Dónde encuentro el material de mis cursos en la plataforma?",
        "synonyms": [
            "material de cursos", "recursos en aula virtual", "documentos de clase"
        ],
        "answer": """Puedes encontrar el material en la sección "Recursos" dentro de cada curso en tu Aula Virtual."""
    },
    {
        "question": "¿Qué hago si mi examen virtual no se envió correctamente?",
        "synonyms": [
            "examen virtual falló", "examen no se envió", "error en examen online"
        ],
        "answer": """Debes reportarlo de inmediato a Educación Virtual con una captura de pantalla del problema."""
    },
    {
        "question": "¿Cómo accedo a mi aula virtual?",
        "synonyms": [
            "acceder a la plataforma", "ingresar al campus virtual", "entrar a la aula"
        ],
        "answer": """Debes ingresar a la plataforma con tu usuario y contraseña institucional."""
    },
    {
        "question": "¿Qué hago si mi videoconferencia no carga correctamente?",
        "synonyms": [
            "videoconferencia error", "fallo en videoconferencia", "no carga la videollamada"
        ],
        "answer": """Verifica tu conexión a internet e intenta ingresar nuevamente. 
Si el problema persiste, contacta a Educación Virtual."""
    },
    {
        "question": "¿Cómo me comunico con mis docentes en la plataforma?",
        "synonyms": [
            "contactar profesores", "mensajería interna", "enviar mensaje a docente"
        ],
        "answer": """Puedes utilizar la mensajería interna del aula virtual 
o el correo institucional del docente."""
    },
    {
        "question": "¿Cómo sé si mi tarea fue enviada correctamente?",
        "synonyms": [
            "enviar tarea", "tarea confirmación", "subir tarea con éxito"
        ],
        "answer": """La plataforma te enviará una confirmación. Si no la recibes, revisa tu conexión y vuelve a intentarlo."""
    }
]

faq_list += [
    {
        "question": "¿Hay examen de admisión en la UMA?",
        "synonyms": [
            "examen", "exam", "próximo examen", "fechas de examen",
            "admision exam", "examen de admisión", "próximo examen de admisión"
        ],
        "answer": """📝 Prepárate para nuestro próximo examen de admisión. Conoce las fechas y requisitos en:
<a href='https://uma.edu.pe/admisionpregrado/'>Examen de Admisión UMA</a>"""
    },
    {
        "question": "¿Qué carreras ofrece la UMA?",
        "synonyms": [
            "carreras", "programas de pregrado", "opciones de carrera",
            "licenciaturas", "qué se estudia en UMA"
        ],
        "answer": """📚 En la UMA ofrecemos diversas carreras de pregrado en Ingeniería, Negocios, Ciencias de la Salud y más.
Consulta nuestra lista completa aquí: <a href='https://uma.edu.pe/'>Carreras UMA</a>"""
    },
    {
        "question": "¿Ofrecen maestrías en la UMA?",
        "synonyms": [
            "maestrías", "estudios de posgrado", "MBA", "salud pública", "maestría"
        ],
        "answer": """🎓 La UMA ofrece maestrías como MBA y Salud Pública. 
Encuentra más información en:
<a href='https://uma.edu.pe/mba/'>Maestría en Administración de Empresas - MBA</a><br>
<a href='https://uma.edu.pe/maestria-en-salud-publica/'>Maestría en Salud Pública UMA</a>"""
    },
    {
        "question": "¿Tienen programas de especialización?",
        "synonyms": [
            "especialización", "programas especializados", "segunda especialidad",
            "posgrado enfermería", "posgrado farmacia"
        ],
        "answer": """🏥 Contamos con programas de Segunda Especialización Profesional en Enfermería, Farmacia y más. 
Revisa nuestros programas aquí: <a href='https://uma.edu.pe/psee/'>Especializaciones UMA</a>"""
    },
    {
        "question": "¿Ofrecen diplomados en la UMA?",
        "synonyms": [
            "diplomado", "diplomados", "estudios cortos posgrado",
            "especialización corta"
        ],
        "answer": """📜 Explora nuestros diplomados en:
- Toxicología Ambiental y Seguridad Alimentaria
- Seguridad Alimentaria
- Asuntos Regulatorios del Sector Farmacéutico
- Enfermedades crónicas no transmisibles
- Salud Mental Comunitaria."""
    },
    {
        "question": "¿Cómo es la admisión en la UMA?",
        "synonyms": [
            "admisión", "admision", "ingreso a la UMA", "requisitos de admisión"
        ],
        "answer": """📄 ¿Quieres estudiar en la UMA? Conoce nuestros requisitos y procesos de admisión en:
<a href='https://uma.edu.pe/admisionpregrado/'>Admisión UMA</a>"""
    },
    {
        "question": "¿Qué carreras de ingeniería tienen?",
        "synonyms": [
            "ingeniería", "facultad de ingeniería", "ingeniería de sistemas", "industrial",
            "inteligencia artificial"
        ],
        "answer": """🖥️ Nuestra Facultad de Ingeniería y Negocios ofrece carreras como:
- Ingeniería de Inteligencia Artificial
- Ingeniería de Sistemas (Nuevo)
- Ingeniería Industrial (Nuevo)
📌"""
    },
    {
        "question": "¿Ofrecen la carrera de Derecho?",
        "synonyms": [
            "derecho", "facultad de derecho", "leyes", "carrera legal"
        ],
        "answer": """⚖️ La carrera de Derecho ahora está disponible en la UMA. 
Consulta más información aquí: <a href='https://uma.edu.pe/derecho/'>Derecho UMA</a>"""
    },
    {
        "question": "¿Tienen programas de administración?",
        "synonyms": [
            "administración", "negocios", "marketing", "contabilidad y finanzas",
            "administración de empresas"
        ],
        "answer": """📊 La Facultad de Ingeniería y Negocios ofrece Administración en:
- Empresas (Nuevo)
- Negocios Internacionales
- Marketing
- Contabilidad y Finanzas
📌"""
    },
    {
        "question": "¿Ofrecen la carrera de Farmacia?",
        "synonyms": [
            "farmacia", "bioquímica", "facultad de farmacia", "farmacéutico"
        ],
        "answer": """💊 Nuestra Facultad de Farmacia y Bioquímica ofrece la carrera de Farmacia y Bioquímica.
Consulta más información aquí: <a href='https://uma.edu.pe/'>Farmacia UMA</a>"""
    },
    {
        "question": "¿Qué carreras de salud ofrece la UMA?",
        "synonyms": [
            "salud", "ciencias de la salud", "carrera de enfermería", "nutrición y dietética",
            "psicología"
        ],
        "answer": """🏥 La Facultad de Ciencias de la Salud de la UMA incluye programas como:
- Tecnología Médica en Laboratorio Clínico
- Tecnología Médica en Terapia Física y Rehabilitación
- Enfermería
- Nutrición y Dietética
- Psicología
📌"""
    },
    {
        "question": "¿Hay un MBA en la UMA?",
        "synonyms": [
            "mba", "maestría en administración", "posgrado administración"
        ],
        "answer": """🎓 La UMA ofrece la Maestría en Administración de Empresas (MBA) (Nuevo). 
📌 Más información: <a href='https://uma.edu.pe/mba/'>UMA MBA</a>"""
    },
    {
        "question": "¿Tienen la carrera de Psicología?",
        "synonyms": [
            "psicología", "facultad de psicología", "carrera de psicología"
        ],
        "answer": """🧠 La carrera de Psicología en la UMA prepara profesionales para trabajar en hospitales, 
empresas y centros educativos. Más información aquí: <a href='https://uma.edu.pe/psicologia/'>Psicología UMA</a>"""
    },
    {
        "question": "¿Ofrecen especializaciones en Enfermería?",
        "synonyms": [
            "enfermería", "especialización en enfermería", "cuidados intensivos",
            "centro quirúrgico"
        ],
        "answer": """🏥 La UMA ofrece especializaciones en Enfermería, incluyendo:
- Cuidados Intensivos
- Salud Familiar y Comunitaria
- Emergencias y Desastres
- Centro Quirúrgico
📌 Más información aquí: <a href='https://uma.edu.pe/psee/'>Especialización en Enfermería</a>"""
    },
    {
        "question": "¿Qué hay sobre Urología?",
        "synonyms": [
            "urología", "especialidad urología", "cirugía urológica"
        ],
        "answer": """🩺 La UMA ahora ofrece la especialización en Urología (Nuevo). 
📌 Más información aquí: <a href='https://uma.edu.pe/see-en-urologia/'>Especialización en Urología</a>"""
    },
    {
        "question": "¿Tienen especialidad en Farmacia?",
        "synonyms": [
            "farmacia especialidad", "asuntos regulatorios farmacia",
            "segunda especialidad farmacia"
        ],
        "answer": """💊 Segunda Especialidad en Farmacia:
- Asuntos Regulatorios del Sector Farmacéutico (Nuevo)
📌 Más información: <a href='https://uma.edu.pe/asuntos-regulatorios-en-el-sector-farmaceutico/'>Especialización en Farmacia</a>"""
    },
    {
        "question": "¿Cómo puedo contact a la UMA?",
        "synonyms": [
            "contactor", "teléfono admisión", "oficina de admisión", "ayuda"
        ],
        "answer": """📞 ¿Necesitas ayuda? Puedes contactar con nuestra oficina de admisión:<br><br>
- Ms. Katya Aponte: <a href="#" class="phone-link" data-phone="51982887246">982 887 246</a> | <a href="mailto:katia.aponte@uma.edu.pe">katia.aponte@uma.edu.pe</a><br>
- Ms. Sandy León: <a href="#" class="phone-link" data-phone="51923032722">923 032 722</a> | <a href="mailto:sandy.leon@uma.edu.pe">sandy.leon@uma.edu.pe</a><br>
- Ms. Esperanza Pérez: <a href="#" class="phone-link" data-phone="51923319253">923 319 253</a> | <a href="mailto:esperanza.perez@uma.edu.pe">esperanza.perez@uma.edu.pe</a><br>
- Ms. Antuanette Fernández: <a href="#" class="phone-link" data-phone="51922821832">922 821 832</a> | <a href="mailto:jahaira.fernandez@uma.edu.pe">jahaira.fernandez@uma.edu.pe</a><br>
- Ms. Karol Padilla: <a href="#" class="phone-link" data-phone="51914569310">914 569 310</a> | <a href="mailto:karol.padilla@uma.edu.pe">karol.padilla@uma.edu.pe</a><br>"""
    }
]


# We combine question + synonyms into a single text for each entry
def create_faq_embedding_text(faq):
    # E.g. "¿Cuándo inicia la matrícula...? sin synonyms + synonyms joined with space"
    synonyms_text = " ".join(faq["synonyms"])
    return faq["question"] + " " + synonyms_text

# 4) LOAD STRONG EMBEDDING MODEL
faq_model = SentenceTransformer("sentence-transformers/multi-qa-mpnet-base-dot-v1")

# Precompute embeddings for each FAQ (question + synonyms)
faq_texts = [create_faq_embedding_text(faq) for faq in faq_list]
faq_embeddings = faq_model.encode(faq_texts, convert_to_tensor=True)

@app.route('/get_response', methods=['POST'])
def get_response():
    data = request.get_json()
    query = data.get("query", "")
    corrected_query = correct_spelling_internal(query)

    # 1) Try matching with the FAQ list (embedding-based)
    query_embedding = faq_model.encode(corrected_query, convert_to_tensor=True)
    scores = util.pytorch_cos_sim(query_embedding, faq_embeddings).cpu().numpy().flatten()
    best_index = int(np.argmax(scores))
    best_score = float(scores[best_index])

    # If above threshold, return EXACT FAQ answer
    THRESHOLD_FAQ = 0.75
    if best_score >= THRESHOLD_FAQ:
        return jsonify({
            "best_doc": faq_list[best_index]["answer"],
            "best_score": best_score,
            "corrected_query": corrected_query,
            "is_faq": True
        })

    # 2) Otherwise, fallback to TF-IDF
    best_doc, best_score_tfidf = get_best_doc_and_score(corrected_query)
    return jsonify({
        "best_doc": best_doc,
        "best_score": float(best_score_tfidf),
        "corrected_query": corrected_query,
        "is_faq": False
    })

# ----------------------------------------------------------------
# 5) WHISPER FOR SPEECH-TO-TEXT
# ----------------------------------------------------------------
device = "cuda" if torch.cuda.is_available() else "cpu"
# If "large" fails due to memory, use "medium" or "small"
whisper_model = whisper.load_model("medium").to(device)

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
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
