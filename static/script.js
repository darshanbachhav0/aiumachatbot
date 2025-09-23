// ===== DOM =====
const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const sendMessageButton = document.querySelector("#send-message");
const recordVoiceButton = document.querySelector("#record-voice");

// ===== Config =====
const THINKING_SWAP_MS = 600;       // was 2000 — faster
const GEMINI_KEYS = ["YOUR_GEMINI_KEY"]; // keep if you still call Gemini from web
let isBotResponding = false;

// ===== Pick credentials coming from Android WebView =====
const q = new URLSearchParams(location.search);
const CP = {
  token: q.get("cpToken") || localStorage.getItem("cpToken") || "",
  code:  q.get("code")    || localStorage.getItem("cpCode")   || "",
  period:q.get("period")  || localStorage.getItem("cpPeriod") || ""
};
if (q.get("cpToken"))  localStorage.setItem("cpToken", CP.token);
if (q.get("code"))     localStorage.setItem("cpCode", CP.code);
if (q.get("period"))   localStorage.setItem("cpPeriod", CP.period);

// ===== In-memory cache (keeps the bot snappy) =====
const cache = {
  student: null,
  schedules: null,
  when: { student: 0, schedules: 0 }
};
const TTL_MS = 1000 * 60; // 1 minute

// ===== Helpers =====
const authHeader = () => (CP.token ? { "Authorization": `Bearer ${CP.token}` } : {});

async function umaPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(body || {})
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}

async function getStudent() {
  if (cache.student && Date.now() - cache.when.student < TTL_MS) return cache.student;
  if (!CP.code) throw new Error("missing_code");
  const { ok, status, data } = await umaPost("/uma/student", { code: CP.code });
  if (!ok) {
    const msg404 = status === 404 ? "No se encontró tu ficha con ese código." : "No pudimos traer tus datos ahora.";
    throw new Error(`student_${status}:${msg404}`);
  }
  cache.student = data;
  cache.when.student = Date.now();
  return cache.student;
}

async function getCourseSchedules() {
  if (cache.schedules && Date.now() - cache.when.schedules < TTL_MS) return cache.schedules;
  if (!CP.code || !CP.period) throw new Error("missing_params");
  const { ok, status, data } = await umaPost("/uma/course-schedules", { code: CP.code, period: CP.period });
  if (!ok) {
    const msg404 = status === 404 ? "No hay horarios para el periodo actual." : "No pudimos sincronizar tu horario.";
    throw new Error(`sched_${status}:${msg404}`);
  }
  cache.schedules = data;
  cache.when.schedules = Date.now();
  return cache.schedules;
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0,10); // YYYY-MM-DD
}

function swiftReply(html) {
  const wrap = document.createElement("div");
  wrap.classList.add("bot-message-container");
  wrap.innerHTML = `
    <div class="logo-container"><img src="girltalk.gif" alt="Bot" class="bot-gif"></div>
    <div class="bot-message-card"><div class="message-text">🤔</div></div>`;
  chatBody.appendChild(wrap);
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
  const botGif = wrap.querySelector(".bot-gif");
  setTimeout(() => { botGif.src = "girltalks.png"; }, THINKING_SWAP_MS);
  setTimeout(() => { wrap.querySelector(".message-text").innerHTML = html; }, THINKING_SWAP_MS);
}

function displayUserMessage(message) {
  const wrap = document.createElement("div");
  wrap.classList.add("user-message-container");
  wrap.innerHTML = `<div class="user-message-card"><div class="message-text">${message}</div></div>`;
  chatBody.appendChild(wrap);
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
}

// ===== Simple NLU (fast intent matcher) =====
const intents = [
  { key: "saludo",  re: /(hola|buen[oa]s|saludo)/i },
  { key: "quien_soy", re: /(quien soy|mi nombre)/i },
  { key: "horario_hoy", re: /(horario|pr[oó]xima? clase|clases? hoy|siguiente clase)/i },
  { key: "pagos", re: /(pagos?|mensualidad|deuda|pendiente)/i }
];

async function handleIntent(text) {
  const match = intents.find(i => i.re.test(text));
  switch (match?.key) {
    case "saludo": {
      try {
        const st = await getStudent();
        const name = (st?.data?.fullName || st?.data?.names || "").trim();
        const ciclo = (st?.data?.cycle || st?.data?.periodCode || CP.period || "").toString();
        return `Hola ${name ? `<strong>${name}</strong>` : "👋"}. ¿En qué te puedo ayudar hoy? ${
          ciclo ? `Recuerda que tu ciclo es <strong>${ciclo}</strong>.` : ""}`;
      } catch (e) {
        return "Hola 👋. ¿En qué te ayudo hoy?";
      }
    }
    case "quien_soy": {
      try {
        const st = await getStudent();
        const name = (st?.data?.fullName || st?.data?.names || "").trim();
        return name ? `Eres <strong>${name}</strong>.` : "No pude leer tu nombre ahora.";
      } catch {
        return "Necesito tu sesión UMA para decirte tu nombre.";
      }
    }
    case "horario_hoy": {
      try {
        const sc = await getCourseSchedules();
        const items = (sc?.data || []);
        const today = todayISO();
        // Try several common field spellings:
        const todayClasses = items.filter(it => {
          const date = (it.date || it.class_date || it.fecha || "").slice(0,10);
          return date === today;
        });
        if (todayClasses.length === 0) {
          return "Hoy no tienes clases registradas para este periodo.";
        }
        const rows = todayClasses.map(c => {
          const start = c.start_time || c.start || c.horaInicio || "";
          const end   = c.end_time   || c.end   || c.horaFin    || "";
          const name  = c.course_name || c.course || c.asignatura || "Curso";
          const room  = c.classroom   || c.aula   || "";
          return `<li><strong>${name}</strong> ${start ? `(${start}–${end})` : ""} ${room ? `· Aula ${room}` : ""}</li>`;
        });
        return `<strong>Clases de hoy:</strong><ul style="margin-left:16px;list-style:disc">${rows.join("")}</ul>`;
      } catch (e) {
        const msg = (e.message || "");
        if (msg.startsWith("sched_404")) return "No hay horarios para hoy en tu periodo.";
        if (msg.includes("missing")) return "Faltan credenciales. Abre el chatbot desde la app UMA.";
        return "No pude sincronizar tu horario ahora. Inténtalo más tarde.";
      }
    }
    case "pagos": {
      return "Para pagos y deudas, entra a la sección Pagos de la app UMA. Si quieres, puedo guiarte paso a paso aquí.";
    }
    default:
      return null; // fall back to LLM
  }
}

// ===== LLM fallback (kept simple, still fast) =====
async function askGemini(prompt) {
  const key = GEMINI_KEYS[0];
  if (!key) return "No tengo acceso al modelo en este momento.";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const body = {
    contents: [{
      role: "user",
      parts: [{ text: `Responde en español, breve y directo.\nUsuario: ${prompt}` }]
    }]
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  return (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim() || "No tengo una respuesta clara ahora.";
}

// ===== Send flow =====
document.getElementById("chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isBotResponding) return;

  const userMessage = messageInput.value.trim();
  if (!userMessage) return;

  isBotResponding = true;
  messageInput.disabled = true; sendMessageButton.disabled = true;

  displayUserMessage(userMessage);
  messageInput.value = ""; messageInput.style.height = "auto";

  // try intent first (instant)
  let reply = await handleIntent(userMessage);
  if (!reply) reply = await askGemini(userMessage);

  swiftReply(reply);

  isBotResponding = false;
  messageInput.disabled = false; sendMessageButton.disabled = false;
  messageInput.focus();
});

// ===== Voice (unchanged) =====
let recognition;
const startVoiceRecognition = () => {
  if (!("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
    alert("Tu navegador no soporta reconocimiento de voz."); return;
  }
  recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = "es-ES"; recognition.interimResults = true; recognition.continuous = true; recognition.maxAlternatives = 1; recognition.start();
  recognition.onresult = (e) => {
    let transcript = "";
    for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript + " ";
    messageInput.value = transcript.trim();
    messageInput.dispatchEvent(new Event("input"));
  };
};
const stopVoiceRecognition = () => { if (recognition) recognition.stop(); };
recordVoiceButton.addEventListener("mousedown", startVoiceRecognition);
recordVoiceButton.addEventListener("mouseup", stopVoiceRecognition);
recordVoiceButton.addEventListener("touchstart", startVoiceRecognition);
recordVoiceButton.addEventListener("touchend", stopVoiceRecognition);

// ===== Startup: if we have CP data, prefetch cache (asynchronously) =====
(async () => {
  if (CP.code) { try { getStudent(); } catch {} }
  if (CP.code && CP.period) { try { getCourseSchedules(); } catch {} }
})();
