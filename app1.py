import os, time, datetime as dt
from typing import Any, Dict, List, Tuple
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests

# -------------------- Flask basic --------------------
app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

@app.route("/")
def index():
    return app.send_static_file("index.html")

# -------------------- UMA base -----------------------
BASE_URL = "http://37.60.229.241:8085/service-uma"
TIMEOUT  = 6  # seconds

def uma_post(token: str, path: str, body: Dict) -> Tuple[int, Dict]:
    url = f"{BASE_URL}{path}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        r = requests.post(url, headers=headers, json=body, timeout=TIMEOUT)
        try:
            data = r.json()
        except Exception:
            data = {"message": r.text}
        data.setdefault("status", r.status_code)
        return r.status_code, data
    except Exception as e:
        return 599, {"status": 599, "message": str(e)}

# -------------------- tiny cache (Render-safe) -------
TTL = 300  # 5 min
_cache: Dict[Tuple[str, str], Dict[str, Any]] = {}  # key=(code,period)

def cache_get(code: str, period: str):
    key = (code or "", period or "")
    val = _cache.get(key)
    if not val: return None
    if time.time() - val.get("ts", 0) > TTL:
        _cache.pop(key, None); return None
    return val

def cache_upsert(code: str, period: str, **parts):
    key = (code or "", period or "")
    cur = _cache.get(key, {"ts": time.time()})
    cur.update(parts)
    cur["ts"] = time.time()
    _cache[key] = cur
    return cur

# -------------------- sync + summary -----------------
@app.route("/uma/sync", methods=["POST"])
def uma_sync():
    """
    Body: { token, code, period }
    Pulls student + schedules once, caches both.
    """
    data   = request.get_json(force=True) or {}
    token  = (data.get("token") or "").strip()
    code   = (data.get("code")  or "").strip()
    period = (data.get("period") or "").strip()

    if not token or not code:
        return jsonify({"ok": False, "message": "token y/o code faltante"}), 400

    # student (detailed profile)
    sc, student = uma_post(token, "/student/student", {"code": code})
    # schedules (period based)
    cc, sched   = uma_post(token, "/student/course-schedules", {"code": code, "period": period})

    cache_upsert(code, period, student=student, schedules=sched)
    # try to extract a simple summary for client
    stu = student.get("data") or {}
    summary = {
        "fullName": stu.get("fullName") or stu.get("names") or stu.get("nombreCompleto"),
        "cycle": stu.get("cycle") or stu.get("ciclo") or stu.get("cycleCode"),
        "program": stu.get("program") or stu.get("school") or stu.get("escuela")
    }

    return jsonify({"ok": True, "student_status": sc, "schedules_status": cc,
                    "student": student, "schedules": sched, "summary": summary})

@app.route("/uma/summary", methods=["POST"])
def uma_summary():
    data   = request.get_json(force=True) or {}
    token  = (data.get("token") or "").strip()
    code   = (data.get("code")  or "").strip()
    period = (data.get("period") or "").strip()

    cached = cache_get(code, period)
    if not cached:
        _ = uma_sync()  # try to warm cache (uses request body)

    cached = cache_get(code, period) or {}
    stu = (cached.get("student") or {}).get("data") or {}
    return jsonify({
        "ok": True,
        "name": stu.get("fullName") or stu.get("names") or stu.get("nombreCompleto"),
        "cycle": stu.get("cycle") or stu.get("ciclo") or stu.get("cycleCode"),
        "dni": stu.get("dni") or stu.get("c_dni")
    })

# -------------------- schedules helpers ---------------
def parse_next_from(sched_payload: Dict) -> Dict:
    data = sched_payload.get("data") or []
    now = dt.datetime.now()
    best = None
    for it in data:
        name = it.get("course_name") or it.get("course") or it.get("asignatura") or it.get("name") or "Curso"
        room = it.get("classroom") or it.get("aula") or it.get("room") or ""
        start = it.get("start_time") or it.get("start") or it.get("horaInicio") or it.get("inicio") or it.get("datetime")
        datev = it.get("date") or it.get("class_date") or it.get("fecha")

        # robust parse
        sdt = None
        if isinstance(start, str) and ("T" in start or "-" in start):
            try:
                sdt = dt.datetime.fromisoformat(start.replace("T", " ").replace("Z", ""))
            except Exception:
                sdt = None
        if not sdt and datev and start:
            try:
                sdt = dt.datetime.fromisoformat(f"{datev} {start}".replace("T", " "))
            except Exception:
                sdt = None

        if sdt and sdt > now:
            if not best or sdt < best["sdt"]:
                best = {"sdt": sdt, "name": name, "room": room}
    return best or {}

@app.route("/uma/next_class", methods=["POST"])
def uma_next_class():
    data   = request.get_json(force=True) or {}
    token  = (data.get("token") or "").strip()
    code   = (data.get("code")  or "").strip()
    period = (data.get("period") or "").strip()

    cached = cache_get(code, period)
    if not cached:
        if not token: return jsonify({"ok": False, "message": "sin cache y sin token"}), 400
        _ = uma_sync()

    cached = cache_get(code, period) or {}
    sched  = cached.get("schedules") or {}
    nxt = parse_next_from(sched)
    if not nxt: return jsonify({"ok": True, "has_next": False})
    return jsonify({
        "ok": True,
        "has_next": True,
        "next": {
            "course": nxt["name"],
            "room": nxt.get("room"),
            "start": nxt["sdt"].strftime("%d/%m %H:%M")
        }
    })

@app.route("/uma/schedule_today", methods=["POST"])
def uma_schedule_today():
    data   = request.get_json(force=True) or {}
    token  = (data.get("token") or "").strip()
    code   = (data.get("code")  or "").strip()
    period = (data.get("period") or "").strip()

    cached = cache_get(code, period)
    if not cached:
        if not token: return jsonify({"ok": False, "message": "sin cache y sin token"}), 400
        _ = uma_sync()
    cached = cache_get(code, period) or {}
    sched  = (cached.get("schedules") or {}).get("data") or []

    today = dt.date.today().isoformat()
    out = []
    for it in sched:
        datev = it.get("date") or it.get("class_date") or it.get("fecha") or ""
        start = it.get("start_time") or it.get("start") or it.get("horaInicio") or it.get("inicio") or ""
        end   = it.get("end_time")   or it.get("end")   or it.get("horaFin")   or it.get("fin")    or ""
        if datev and datev.startswith(today):
            out.append({
                "course": it.get("course_name") or it.get("course") or it.get("asignatura") or it.get("name") or "Curso",
                "start": start, "end": end,
                "room": it.get("classroom") or it.get("aula") or it.get("room") or ""
            })
    return jsonify({"ok": True, "classes": out})

# -------------------- academics/payments --------------
@app.route("/uma/grades_recent", methods=["POST"])
def uma_grades_recent():
    data   = request.get_json(force=True) or {}
    token  = (data.get("token") or "").strip()
    code   = (data.get("code")  or "").strip()
    period = (data.get("period") or "").strip()

    status, payload = uma_post(token, "/student/course-qualifications", {"code": code, "period": period})
    items = (payload.get("data") or [])[:5]
    out = [{"course": i.get("course") or i.get("asignatura") or i.get("name"),
            "grade": i.get("grade") or i.get("nota") or i.get("final"),
            "date":  i.get("date")  or i.get("fecha")} for i in items]
    return jsonify({"ok": status==200, "status": status, "grades": out})

@app.route("/uma/attendance", methods=["POST"])
def uma_attendance():
    data   = request.get_json(force=True) or {}
    token  = (data.get("token") or "").strip()
    code   = (data.get("code")  or "").strip()
    period = (data.get("period") or "").strip()

    status, payload = uma_post(token, "/student/attendance", {"code": code, "period": period})
    items = payload.get("data") or []
    # simple aggregate
    try:
        present = sum(int(i.get("present", 0)) for i in items)
        total   = sum(int(i.get("total", 0)) for i in items) or 0
        pct = round(100*present/total, 1) if total else None
    except Exception:
        pct = None
    return jsonify({"ok": status==200, "status": status, "summary": {"percent": pct}, "raw": items})

@app.route("/uma/payments_status", methods=["POST"])
def uma_payments_status():
    data   = request.get_json(force=True) or {}
    token  = (data.get("token") or "").strip()
    code   = (data.get("code")  or "").strip()

    s1, p1 = uma_post(token, "/student/payment", {"code": code})
    s2, p2 = uma_post(token, "/student/payment-monthly", {"code": code})
    items  = (p1.get("data") or []) + (p2.get("data") or [])
    due = [i for i in items if str(i.get("status","")).lower() in ("pending","pendiente","due","por pagar")]
    paid= [i for i in items if str(i.get("status","")).lower() in ("paid","pagado","ok","cancelado")]
    return jsonify({"ok": True, "due": due, "paid": paid})

@app.route("/uma/enrollment_rooms", methods=["POST"])
def uma_enrollment_rooms():
    data   = request.get_json(force=True) or {}
    token  = (data.get("token") or "").strip()
    code   = (data.get("code")  or "").strip()
    status, payload = uma_post(token, "/student/enrollment-uma", {"code": code})
    # be liberal extracting rooms
    rooms = []
    for it in payload.get("data") or []:
        r = it.get("room") or it.get("aula") or it.get("classroom")
        if r: rooms.append(r)
    rooms = sorted(list({r for r in rooms}))
    return jsonify({"ok": status==200, "rooms": rooms, "count": len(rooms)})

# -------------------- static passthrough --------------
@app.route("/static/<path:filename>")
def static_files(filename):
    return send_from_directory("static", filename)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "10000"))
    app.run(host="0.0.0.0", port=port)
