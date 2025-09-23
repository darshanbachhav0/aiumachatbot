import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

# ---- Serve UI ---------------------------------------------------------------
@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/<path:path>')
def static_proxy(path):
    return send_from_directory('static', path)

# ---- Health ----------------------------------------------------------------
@app.route('/health')
def health():
    return jsonify({"ok": True})

# ---- Tiny spelling endpoint kept for compatibility (no heavy libs) ---------
@app.route('/correct_spelling', methods=['POST'])
def correct_spelling():
    data = request.get_json(force=True) or {}
    return jsonify({"corrected_query": (data.get("query") or "").strip()})

# ---- UMA proxy (super light; no SDKs) --------------------------------------
BASE = "http://37.60.229.241:8085/service-uma"

def _proxy_post(path):
    """
    Forwards JSON and Authorization Bearer to UMA microservice.
    """
    try:
        body = request.get_json(force=True) or {}
        token = request.headers.get("Authorization", "")
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = token

        r = requests.post(f"{BASE}{path}", json=body, headers=headers, timeout=15)
        # Pass through HTTP code + JSON (or text) for clarity
        try:
            payload = r.json()
        except Exception:
            payload = {"raw": r.text}

        return jsonify(payload), r.status_code
    except requests.exceptions.RequestException as e:
        return jsonify({"message": f"proxy_error: {e}"}), 502

@app.route('/uma/student', methods=['POST'])
def uma_student():
    # body: {"code": "..."}
    return _proxy_post("/student/student")

@app.route('/uma/course-schedules', methods=['POST'])
def uma_course_schedules():
    # body: {"code": "...", "period": "..."}
    return _proxy_post("/student/course-schedules")

# ---- Minimal fallback chatbot endpoint kept for debugging -------------------
@app.route('/echo', methods=['POST'])
def echo():
    data = request.get_json(force=True) or {}
    return jsonify({"you_said": data.get("query", "")})

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port, debug=True)
