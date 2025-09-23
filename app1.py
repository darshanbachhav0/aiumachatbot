import os, re, json
from datetime import datetime
from typing import Tuple, Optional, Dict, Any, List, Union
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app, resources={r"/*": {"origins": "*"}})

APP_BASE = "http://37.60.229.241:8085/service-uma"   # same base URL your app uses

# -------------------- Static UI --------------------
@app.route("/")
def index():
    return app.send_static_file("index.html")

# -------------------- Utils --------------------
def normalize_text(text: str) -> str:
    text = (text or "").lower()
    text = re.sub(r"[^\w\sáéíóúüñ]", " ", text)
    return re.sub(r"\s+", " ", text).strip()

def bearer_header() -> str:
    auth = request.headers.get("Authorization", "")
    return auth if auth.startswith("Bearer ") else ""

def http_post(path: str, payload: dict, timeout: int = 10) -> Tuple[Optional[Dict[str, Any]], int, str]:
    bh = bearer_header()
    if not bh:
        return None, 0, "no_bearer"
    try:
        r = requests.post(
            APP_BASE + path,
            json=payload,
            headers={"Authorization": bh, "Content-Type": "application/json"},
            timeout=timeout,
        )
        if r.status_code == 200:
            try:
                return r.json(), r.status_code, ""
            except Exception:
                return None, r.status_code, "bad_json"
        return None, r.status_code, r.text[:200]
    except Exception as e:
        return None, -1, str(e)

def call_with_variants(path: str, variants: List[dict]) -> Tuple[Optional[Dict[str, Any]], int, str, int]:
    """Try multiple payload variants until one succeeds. Returns json/status/err/variant_index."""
    last_err, last_status = "", 0
    for i, p in enumerate(variants):
        j, sc, err = http_post(path, p)
        if j is not None and sc == 200:
            return j, sc, "", i
        last_err, last_status = err, sc
    return None, last_status, last_err, -1

# -------------------- Intent detection --------------------
def intent_of(q: str) -> str:
    t = normalize_text(q)
    if any(k in t for k in ["horario","horarios","clase","aula","salon","salón"]): return "schedule"
    if any(k in t for k in ["pago","pagos","cuota","boleta","saldo","deuda"]): return "payments"
    if any(k in t for k in ["nota","notas","calificacion","calificación","curso","credito","crédito","matricula","matrícula"]): return "academics"
    if any(k in t for k in ["servicio","servicios","biblioteca","laboratorio","tramite","trámite"]): return "services"
    if any(k in t for k in ["regla","reglas","reglamento","norma"]): return "rules"
    if any(k in t for k in ["evento","eventos","actividad"]): return "events"
    return "general"

# -------------------- Resilient extractors --------------------
def deep_get(obj: Union[dict, list], keys: List[str]) -> Optional[str]:
    """Search recursively any of the keys; return first string-like match."""
    if isinstance(obj, dict):
        for k,v in obj.items():
            if k in keys and isinstance(v, (str, int, float)):
                return str(v)
            got = deep_get(v, keys)
            if got: return got
    elif isinstance(obj, list):
        for it in obj:
            got = deep_get(it, keys)
            if got: return got
    return None

def extract_student_code(profile: dict) -> Optional[str]:
    # common keys found in your LoginActivity JSON: user.c_codalu
    return deep_get(profile, ["c_codalu","codigo","code","studentCode","student_code","codalu"])

def extract_period(profile: dict) -> Optional[str]:
    # common keys: periodCode
    return deep_get(profile, ["periodCode","period","ciclo","semester"])

# -------------------- Summaries (tolerant to shapes) --------------------
def summarize_profile(j):
    if not j: return ""
    name = deep_get(j, ["name","nombre","full_name"])
    program = deep_get(j, ["program","programa"])
    ciclo = deep_get(j, ["ciclo","semester","periodCode","period"])
    sede = deep_get(j, ["campus","sede"])
    parts = []
    if name: parts.append(f"Nombre: {name}")
    if program: parts.append(f"Programa: {program}")
    if ciclo: parts.append(f"Ciclo: {ciclo}")
    if sede: parts.append(f"Sede: {sede}")
    return "; ".join(parts)

def summarize_schedule(j):
    if not j: return ""
    today = datetime.now().strftime("%d/%m")
    classes = j.get("classes") or j.get("data") or j.get("horario") or j.get("items") or []
    if isinstance(classes, dict): classes = [classes]
    if not classes: return ""
    top = []
    for c in classes[:4]:
        course = c.get("course") or c.get("nombre") or c.get("curso") or "Curso"
        start = c.get("start") or c.get("hora_inicio") or c.get("inicio") or "—"
        end   = c.get("end")   or c.get("hora_fin")    or c.get("fin")    or "—"
        room  = c.get("room")  or c.get("aula")        or "—"
        day   = c.get("day")   or c.get("dia")         or ""
        top.append(f"{course}: {day+' ' if day else ''}{start}-{end} (Aula {room})")
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

# -------------------- Build personal context with variant payloads --------------------
def build_personal_context(query: str):
    diag = {"has_bearer": bool(bearer_header()), "endpoints": {}, "used_variants": {}}
    ctx_parts = []

    # 1) Profile (usually free of extra payload)
    profile, sc, err = http_post("/student/student", {})
    diag["endpoints"]["/student/student"] = {"ok": profile is not None, "status": sc, "err": err[:140]}
    sprof = summarize_profile(profile)
    if sprof: ctx_parts.append(sprof)

    # Extract keys to feed other endpoints
    code = extract_student_code(profile or {})
    period = extract_period(profile or {})

    # 2) Intent
    intent = intent_of(query)

    # 3) Schedule
    if intent in ("schedule","general"):
        variants = [
            {},  # some APIs resolve from token only
            {"date": "today"},
            {"codigo": code or ""},
            {"c_codalu": code or ""},
            {"code": code or ""},
            {"codigo": code or "", "periodCode": period or ""},
            {"c_codalu": code or "", "periodCode": period or ""},
            {"code": code or "", "period": period or ""},
        ]
        sch, sc, err, used = call_with_variants("/student/course-schedule", variants)
        diag["endpoints"]["/student/course-schedule"] = {"ok": sch is not None, "status": sc, "err": err[:140]}
        diag["used_variants"]["/student/course-schedule"] = used
        ssch = summarize_schedule(sch)
        if ssch: ctx_parts.append(ssch)

    # 4) Payments
    if intent in ("payments","general"):
        variants = [
            {},
            {"codigo": code or ""},
            {"c_codalu": code or ""},
            {"code": code or ""},
            {"range": "current"}
        ]
        pay, sc, err, used = call_with_variants("/student/payment", variants)
        diag["endpoints"]["/student/payment"] = {"ok": pay is not None, "status": sc, "err": err[:140]}
        diag["used_variants"]["/student/payment"] = used
        spay = summarize_payments(pay)
        if spay: ctx_parts.append(spay)

    # 5) Qualifications
    if intent in ("academics","general"):
        variants = [
            {},
            {"codigo": code or ""},
            {"c_codalu": code or ""},
            {"code": code or ""},
            {"codigo": code or "", "periodCode": period or ""},
            {"c_codalu": code or "", "periodCode": period or ""},
            {"code": code or "", "period": period or ""},
        ]
        q, sc, err, used = call_with_variants("/student/course-qualifications", variants)
        diag["endpoints"]["/student/course-qualifications"] = {"ok": q is not None, "status": sc, "err": err[:140]}
        diag["used_variants"]["/student/course-qualifications"] = used
        sq = summarize_qualifications(q)
        if sq: ctx_parts.append(sq)

    return " | ".join([c for c in ctx_parts if c]), diag

# -------------------- API used by the UI --------------------
@app.post("/correct_spelling")
def correct_spelling_route():
    data = request.get_json() or {}
    return jsonify({"corrected_query": data.get("query", "")})

@app.post("/get_response")
def get_response():
    data = request.get_json() or {}
    user_query = data.get("query", "")
    personal_context, diag = build_personal_context(user_query)
    return jsonify({"ok": True, "personal_context": personal_context.strip(), "diag": diag})

# -------------------- Local run --------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port, debug=True)
