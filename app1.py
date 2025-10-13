# app1.py
# Minimal Flask app that only serves a "chatbot is in production" page.

import os
from flask import Flask, Response
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

HTML = """
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Chatbot UMA — En producción</title>
  <style>
    :root { color-scheme: light dark; }
    html,body { height: 100%; }
    body {
      margin: 0;
      display: grid;
      place-items: center;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", Arial, sans-serif;
      background: canvas;
      color: canvastext;
    }
    .card {
      text-align: center;
      padding: 2rem 2.5rem;
      border-radius: 16px;
      border: 1px solid rgba(128,128,128,0.25);
      box-shadow: 0 10px 30px rgba(0,0,0,0.08);
      max-width: 640px;
    }
    h1 { margin: 0 0 .5rem; font-size: clamp(1.5rem, 2.5vw + 1rem, 2.25rem); }
    p  { margin: .25rem 0; opacity: .85; }
    code { padding: .15rem .35rem; border-radius: 6px; background: rgba(128,128,128,0.12); }
    small { display:block; margin-top: .75rem; opacity: .6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🤖 Chatbot en producción</h1>
    <p>Esta API está desplegada y funcionando.</p>
    <p>Página de estado: <code>/</code></p>
    <small>© UMA</small>
  </div>
</body>
</html>
"""

@app.route("/")
def index():
  return Response(HTML, mimetype="text/html")

if __name__ == "__main__":
  port = int(os.environ.get("PORT", 10000))
  app.run(host="0.0.0.0", port=port, debug=False)
