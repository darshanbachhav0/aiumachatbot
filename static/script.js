// DOM
const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const sendMessageButton = document.querySelector("#send-message");
const recordVoiceButton = document.querySelector("#record-voice");

// Gemini
const API_KEYS = ["AIzaSyBGm1yQQbEptvJqQfxi7d2Byn0Sc9MrMjQ"];
let currentKeyIndex = 0;
let isBotResponding = false;

/* ===== Token helpers ===== */
function getAuthToken() {
  let t = localStorage.getItem("uma_token");
  if (!t) {
    const u = new URLSearchParams(location.search);
    t = u.get("token");
    if (t) localStorage.setItem("uma_token", t);
  }
  return t;
}
function authHeaders() {
  const token = getAuthToken();
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ===== Tiny banner when personalization is off ===== */
function showBanner(text, tone = "warn") {
  const el = document.createElement("div");
  el.className = `mini-banner ${tone}`;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* ===== Send flow ===== */
document.getElementById("chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isBotResponding) return;
  const msg = messageInput.value.trim();
  if (!msg) return;

  isBotResponding = true;
  messageInput.disabled = true;
  sendMessageButton.disabled = true;

  addUser(msg);
  messageInput.value = "";
  messageInput.style.height = "auto";

  await respond(msg);

  isBotResponding = false;
  messageInput.disabled = false;
  sendMessageButton.disabled = false;
  messageInput.focus();
});

/* ===== UI helpers ===== */
function addUser(text) {
  const wrap = document.createElement("div");
  wrap.className = "user-message-container";
  wrap.innerHTML = `<div class="user-message-card"><div class="message-text">${text}</div></div>`;
  chatBody.appendChild(wrap);
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
}
function addBotThinking() {
  const wrap = document.createElement("div");
  wrap.className = "bot-message-container";
  wrap.innerHTML = `
    <div class="logo-container"><img src="girltalk.gif" alt="Bot" class="bot-gif"></div>
    <div class="bot-message-card"><div class="message-text">🤔</div></div>`;
  chatBody.appendChild(wrap);
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
  setTimeout(() => { wrap.querySelector(".bot-gif").src = "girltalks.png"; }, 2000);
  return wrap;
}
function setBotHtml(wrap, html) {
  wrap.querySelector(".message-text").innerHTML = html;
}

/* ===== Main responder ===== */
async function respond(userMessage) {
  const wrap = addBotThinking();

  const corrected = await correctSpelling(userMessage);

  // 1) ask backend for personal context + diagnostics
  let personalContext = "";
  let diag = {};
  try {
    const res = await fetch("/get_response", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ query: corrected }),
    });
    const data = await res.json();
    personalContext = (data.personal_context || "").trim();
    diag = data.diag || {};
    // console.info("diag:", diag); // open DevTools > Network to inspect
    if (!diag.has_bearer) showBanner("No estás autenticado: abre el chatbot desde la app UMA.", "warn");
    if (diag.has_bearer && personalContext === "") showBanner("No pudimos traer tus datos ahora. Inténtalo de nuevo.", "info");
  } catch (e) {
    showBanner("Servidor no disponible.", "warn");
  }

  // 2) craft prompt (handles missing context gracefully)
  const instructions = `
Responde en español.
- Si recibes "personal_context" utilízalo para personalizar (horario, pagos, cursos). 
- Si "personal_context" está vacío:
  • Si "has_bearer" es false: explica brevemente que el chat no está conectado a la cuenta y que debe abrirse desde la app UMA para ver datos personales.
  • Si "has_bearer" es true pero no hay datos: indica que en este momento no se pudo sincronizar y sugiere reintentar.
- Sé útil y directo. No pidas documentos ni des disclaimers largos.`;

  const hasBearer = !!diag.has_bearer;
  const prompt = `
${instructions.trim()}

personal_context:
${personalContext || "—"}

has_bearer: ${hasBearer}

pregunta:
${corrected}`.trim();

  try {
    const body = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
    let ok = false, data;
    while (!ok && currentKeyIndex < API_KEYS.length) {
      const key = API_KEYS[currentKeyIndex];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      data = await r.json();
      ok = r.ok;
      if (!ok) currentKeyIndex++;
    }
    if (!ok) throw new Error("Gemini failed");

    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    setBotHtml(wrap, format(text));

  } catch (err) {
    console.error(err);
    setBotHtml(wrap, "⚠️ Error: No se pudo obtener una respuesta.");
  }
}

/* ===== helpers ===== */
async function correctSpelling(userInput) {
  try {
    const res = await fetch("/correct_spelling", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ query: userInput }),
    });
    const data = await res.json();
    return data.corrected_query || userInput;
  } catch { return userInput; }
}
function format(text) {
  const lines = text.split('\n');
  const out = [];
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    const m = line.match(/\*\*(.*?)\*\*(.*)/);
    if (m) out.push(`<li><strong>${m[1]}</strong>${m[2] ? ": " + m[2] : ""}</li>`);
    else if (/^[-*]\s*/.test(line)) out.push(`<li>${line.replace(/^[-*]\s*/, "")}</li>`);
    else out.push(`<p>${line}</p>`);
  }
  return out.length > 2 ? `<ul style="list-style:disc;margin-left:16px">${out.join("")}</ul>` : out.join("<br>");
}

/* ===== small UX bits ===== */
messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 140) + "px";
});

// optional mini styles for banner (put in your CSS if you prefer)
const style = document.createElement("style");
style.textContent = `
.mini-banner{position:fixed;left:50%;bottom:95px;transform:translateX(-50%);padding:8px 12px;border-radius:10px;font-size:.9rem;color:#fff;z-index:9999;opacity:.95}
.mini-banner.warn{background:#e11d48}
.mini-banner.info{background:#2563eb}
`;
document.head.appendChild(style);
