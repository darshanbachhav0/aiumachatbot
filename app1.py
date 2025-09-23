# Minimal chatbot backend for Render
# - Keeps only Gemini-side generation (done in the browser)
# - Adds personalization: builds "personal_context" from your UMA APIs using the same Bearer token
# - No heavy ML packages; fast cold start

import os, re, json
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app, resources={r"/*": {"origins": "*"}})

# ---- UMA API base used by your mobile app ----
APP_BASE = "http://37.60.229.241:8085/service-uma"


# -------------------- Static UI --------------------
@app.route("/")
def index():
    return app.send_static_file("index.html")


# -------------------- Helpers --------------------
def normalize_text(text: str) -> str:
    text = (text or "").lower()
    text = re.sub(r"[^\w\sáéíóúüñ]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def bearer_header() -> str:
    """Read Authorization header from the WebView-injected token."""
    auth = request.headers.get("Authorization", "")
    return auth if auth.startswith("Bearer ") else ""


def call_app(path: str, payload: dict | None = None, timeout: int = 10):
    """POST to UMA app APIs with the same Bearer token."""
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
        print(f"[call_app] {path} -> {r.status_code} {r.text[:180]}")
    except Exception as e:
        print(f"[call_app] {path} error: {e}")
    return None


def intent_of(q: str) -> str:
    t = normalize_text(q)
    if any(k in t for k in ["horario", "horarios", "clase", "aula", "salon", "salón"]):
        return "schedule"
    if any(k in t for k in ["pago", "pagos", "cuota", "boleta", "saldo", "deuda"]):
        return "payments"
    if any(k in t for k in ["nota", "notas", "calificacion", "calificación", "curso", "credito", "crédito", "matricula", "matrícula"]):
        return "academics"
    if any(k in t for k in ["servicio", "servicios", "biblioteca", "laboratorio", "tramite", "trámite"]):
        return "services"
    if any(k in t for k in ["regla", "reglas", "reglamento", "norma"]):
        return "rules"
    if any(k in t for k in ["evento", "eventos", "actividad"]):
        return "events"
    return "general"


# -------------------- Small summarizers --------------------
def summarize_profile(j):
    if not j:
        return ""
    name = j.get("name") or j.get("nombre") or j.get("full_name") or ""
    program = j.get("program") or j.get("programa") or ""
    ciclo = j.get("ciclo") or j.get("semester") or ""
    sede = j.get("campus") or j.get("sede") or ""
    parts = []
    if name:
        parts.append(f"Nombre: {name}")
    if program:
        parts.append(f"Programa: {program}")
    if ciclo:
        parts.append(f"Ciclo: {ciclo}")
    if sede:
        parts.append(f"Sede: {sede}")
    return "; ".join(parts)


def summarize_schedule(j):
    if not j:
        return ""
    today = datetime.now().strftime("%d/%m")
    classes = j.get("classes") or j.get("data") or j.get("horario") or []
    if isinstance(classes, dict):
        classes = [classes]
    if not classes:
        return ""
    top = []
    for c in classes[:4]:
        course = c.get("course") or c.get("nombre") or c.get("curso") or "Curso"
        start = c.get("start") or c.get("hora_inicio") or c.get("inicio") or "—"
        end = c.get("end") or c.get("hora_fin") or c.get("fin") or "—"
        room = c.get("room") or c.get("aula") or "—"
        day = c.get("day") or c.get("dia") or ""
        top.append(f"{course}: {day+' ' if day else ''}{start}-{end} (Aula {room})")
    return f"Horario {today}: " + "; ".join(top)


def summarize_payments(j):
    if not j:
        return ""
    items = j.get("items") or j.get("pagos") or j.get("data") or []
    if isinstance(items, dict):
        items = [items]
    if not items:
        return "Pagos: sin deudas registradas."
    pending = [x for x in items if str(x.get("status") or x.get("estado") or "").lower() in ("pendiente", "pending")]
    if pending:
        top = []
        for p in pending[:3]:
            concept = p.get("concept") or p.get("concepto") or "Pago"
            due = p.get("due_date") or p.get("vencimiento") or "—"
            amount = p.get("amount") or p.get("monto") or "-"
            top.append(f"{concept}: vence {due}, monto {amount}")
        return "Pagos pendientes: " + "; ".join(top)
    return "No tienes pagos pendientes."


def summarize_qualifications(j):
    if not j:
        return ""
    items = j.get("grades") or j.get("notas") or j.get("data") or []
    if isinstance(items, dict):
        items = [items]
    if not items:
        return ""
    top = []
    for g in items[:5]:
        course = g.get("course") or g.get("curso") or "Curso"
        grade = g.get("grade") or g.get("nota") or "—"
        top.append(f"{course}: {grade}")
    return "Notas: " + "; ".join(top)


def build_personal_context(query: str) -> str:
    """Fetch only what the intent needs; degrade gracefully."""
    ctx = []

    # profile useful always
    profile = call_app("/student/student", {})
    sprof = summarize_profile(profile)
    if sprof:
        ctx.append(sprof)

    intent = intent_of(query)

    try:
        if intent in ("schedule", "general"):
            sch = call_app("/student/course-schedule", {"date": "today"})
            ssch = summarize_schedule(sch)
            if ssch:
                ctx.append(ssch)

        if intent in ("payments", "general"):
            pay = call_app("/student/payment", {"range": "current"})
            spay = summarize_payments(pay)
            if spay:
                ctx.append(spay)

        if intent in ("academics", "general"):
            q = call_app("/student/course-qualifications", {})
            sq = summarize_qualifications(q)
            if sq:
                ctx.append(sq)

        # services/rules/events can be added later in the same style
    except Exception as e:
        print("personal_context error:", e)

    return " | ".join([c for c in ctx if c])


# -------------------- Public endpoints used by the UI --------------------
@app.post("/correct_spelling")
def correct_spelling_route():
    # Lightweight: just return input (no heavy spell-check on Render)
    data = request.get_json() or {}
    return jsonify({"corrected_query": data.get("query", "")})


@app.post("/get_response")
def get_response():
    """Return only the personalized context. The front-end will call Gemini."""
    data = request.get_json() or {}
    user_query = data.get("query", "")
    personal_context = build_personal_context(user_query)
    return jsonify({
        "ok": True,
        "personal_context": personal_context
    })


# -------------------- Run (Render uses Gunicorn via Procfile) --------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port, debug=True)
