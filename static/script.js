// DOM
const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const sendMessageButton = document.querySelector("#send-message");
const recordVoiceButton = document.querySelector("#record-voice");

// Gemini API Keys (kept)
const API_KEYS = ["AIzaSyBGm1yQQbEptvJqQfxi7d2Byn0Sc9MrMjQ"];
let currentKeyIndex = 0;
let isBotResponding = false;

/* ===== Auth token helpers (Android injects localStorage.uma_token) ===== */
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
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/* ===== Mobile viewport fix ===== */
function setVh() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
}
setVh();
addEventListener("resize", setVh);
if (window.visualViewport) {
  visualViewport.addEventListener("resize", setVh);
  visualViewport.addEventListener("scroll", setVh);
}

/* ===== Spelling (lightweight server echo) ===== */
async function correctSpelling(userInput) {
  try {
    const res = await fetch("/correct_spelling", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ query: userInput }),
    });
    const data = await res.json();
    return data.corrected_query || userInput;
  } catch {
    return userInput;
  }
}

/* ===== autoresize textarea ===== */
messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 140) + "px";
});

/* ===== send ===== */
const handleSendMessage = async (e) => {
  e.preventDefault();
  if (isBotResponding) return;

  const userMessage = messageInput.value.trim();
  if (!userMessage) return;

  isBotResponding = true;
  messageInput.disabled = true;
  sendMessageButton.disabled = true;

  displayUserMessage(userMessage);
  messageInput.value = "";
  messageInput.style.height = "auto";

  await generateBotResponse(userMessage);

  isBotResponding = false;
  messageInput.disabled = false;
  sendMessageButton.disabled = false;
  messageInput.focus();
};
document.getElementById("chatForm").addEventListener("submit", handleSendMessage);

/* ===== renderers ===== */
const displayUserMessage = (message) => {
  const wrap = document.createElement("div");
  wrap.classList.add("user-message-container");
  wrap.innerHTML = `<div class="user-message-card"><div class="message-text">${message}</div></div>`;
  chatBody.appendChild(wrap);
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
};

const generateBotResponse = async (userMessage) => {
  const wrap = document.createElement("div");
  wrap.classList.add("bot-message-container");
  wrap.innerHTML = `
    <div class="logo-container"><img src="girltalk.gif" alt="Bot" class="bot-gif"></div>
    <div class="bot-message-card"><div class="message-text">🤔</div></div>`;
  chatBody.appendChild(wrap);
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });

  const botGif = wrap.querySelector(".bot-gif");
  setTimeout(() => { botGif.src = "girltalks.png"; }, 2000);

  const corrected = await correctSpelling(userMessage);

  try {
    // 1) get personalized context from backend (uses Authorization header)
    const ctxRes = await fetch("/get_response", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ query: corrected }),
    });
    const ctxData = await ctxRes.json();
    const personalContext = (ctxData.personal_context || "").trim();

    // 2) ask Gemini using ONLY personalContext + the user's question
    const preamble = `
Responde exclusivamente en español.
- Personaliza la respuesta con los datos del estudiante si son relevantes.
- NO inventes montos, fechas ni calificaciones. Si falta información, indica cómo obtenerla.
- Sé claro y breve.`;

    const requestBody = {
      contents: [{
        role: "user",
        parts: [{
          text: `
${preamble.trim()}

Contexto personal del estudiante (úsalo para contextualizar, no lo reveles completo):
${personalContext || "—"}

Pregunta del usuario:
${corrected}`.trim()
        }]
      }]
    };

    let response, data, success = false;
    while (!success && currentKeyIndex < API_KEYS.length) {
      const key = API_KEYS[currentKeyIndex];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      data = await response.json();
      if (response.ok) success = true; else currentKeyIndex++;
    }
    if (!success) throw new Error("Gemini error");

    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    wrap.querySelector(".message-text").innerHTML = formatResponse(text);

  } catch (err) {
    console.error(err);
    wrap.querySelector(".message-text").textContent = "⚠️ Error: No se pudo obtener una respuesta.";
  }
};

function formatResponse(text) {
  const lines = text.split('\n');
  const out = [];
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    const match = line.match(/\*\*(.*?)\*\*(.*)/);
    if (match) out.push(`<li><strong>${match[1]}</strong>${match[2] ? ": " + match[2] : ""}</li>`);
    else if (line.startsWith("-") || line.startsWith("*")) out.push(`<li>${line.replace(/^[-*]\s*/, '')}</li>`);
    else out.push(`<p>${line}</p>`);
  }
  return out.length > 3 ? `<ul style="list-style:disc;margin-left:16px">${out.join('')}</ul>` : out.join('<br>');
}

/* ===== Voice (WebSpeech) – client-side only ===== */
let recognition;
const startVoiceRecognition = () => {
  if (!("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
    alert("Tu navegador no soporta reconocimiento de voz."); return;
  }
  recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = "es-ES";
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;
  recognition.start();

  const indicator = document.createElement("div");
  indicator.classList.add("listening-indicator");
  indicator.innerHTML = `<div class="wave-container"><span class="wave"></span><span class="wave"></span><span class="wave"></span><span class="wave"></span><span class="wave"></span></div><p>Escucha...</p>`;
  document.body.appendChild(indicator);

  recognition.onresult = (e) => {
    let transcript = "";
    for (let i=0;i<e.results.length;i++) transcript += e.results[i][0].transcript + " ";
    messageInput.value = transcript.trim();
    messageInput.dispatchEvent(new Event("input"));
  };
  recognition.onerror = (e) => console.error("Speech recognition error:", e.error);
  recognition.onend = () => indicator.remove();
};
const stopVoiceRecognition = () => { if (recognition) recognition.stop(); };

// Mic events
recordVoiceButton.addEventListener("touchstart", () => { startVoiceRecognition(); recordVoiceButton.classList.add("recording"); });
recordVoiceButton.addEventListener("touchend", () => { stopVoiceRecognition(); recordVoiceButton.classList.remove("recording"); });
recordVoiceButton.addEventListener("mousedown", () => { startVoiceRecognition(); recordVoiceButton.classList.add("recording"); });
recordVoiceButton.addEventListener("mouseup", () => { stopVoiceRecognition(); recordVoiceButton.classList.remove("recording"); });

/* ===== Simple starfields (unchanged visuals) ===== */
const canvas = document.getElementById("starsCanvas");
const ctx = canvas.getContext("2d");
let stars = []; const numStars = 200;
function resizeCanvas(){ canvas.width = innerWidth; canvas.height = innerHeight; }
resizeCanvas(); addEventListener("resize", resizeCanvas);
class Star{ constructor(x,y,s,speed){ this.x=x; this.y=y; this.size=s; this.speed=speed; this.opacity=Math.random(); }
  draw(){ ctx.beginPath(); ctx.arc(this.x,this.y,this.size,0,Math.PI*2); ctx.fillStyle=`rgba(255,255,255,${this.opacity})`; ctx.fill(); }
  update(){ this.y+=this.speed; if(this.y>canvas.height){ this.y=0; this.x=Math.random()*canvas.width; } this.opacity=Math.random(); }
}
function createStars(){ stars=[]; for(let i=0;i<numStars;i++){ stars.push(new Star(Math.random()*canvas.width,Math.random()*canvas.height,Math.random()*2,Math.random()*0.5)); } }
createStars();
(function anim(){ ctx.clearRect(0,0,canvas.width,canvas.height); stars.forEach(s=>{ s.update(); s.draw(); }); requestAnimationFrame(anim); })();

const chatbotCanvas = document.getElementById("chatbotStarsCanvas");
const chatbotCtx = chatbotCanvas.getContext("2d");
function resizeChatbotCanvas(){ chatbotCanvas.width = chatbotCanvas.clientWidth; chatbotCanvas.height = chatbotCanvas.clientHeight; }
resizeChatbotCanvas(); addEventListener("resize", resizeChatbotCanvas);
class ChatbotStar{ constructor(x,y,s,speed){ this.x=x; this.y=y; this.size=s; this.speed=speed; this.opacity=Math.random()*0.3+0.1; }
  draw(){ chatbotCtx.beginPath(); chatbotCtx.arc(this.x,this.y,this.size,0,Math.PI*2); chatbotCtx.fillStyle=`rgba(255,255,255,${this.opacity})`; chatbotCtx.fill(); }
  update(){ this.y+=this.speed; if(this.y>chatbotCanvas.height){ this.y=0; this.x=Math.random()*chatbotCanvas.width; } this.opacity=Math.random()*0.3+0.1; }
}
let chatbotStars=[]; const numChatbotStars=80;
function createChatbotStars(){ chatbotStars=[]; for(let i=0;i<numChatbotStars;i++){ chatbotStars.push(new ChatbotStar(Math.random()*chatbotCanvas.width,Math.random()*chatbotCanvas.height,Math.random()*1.5,Math.random()*0.3)); } }
createChatbotStars();
(function anim2(){ chatbotCtx.clearRect(0,0,chatbotCanvas.width,chatbotCanvas.height); chatbotStars.forEach(s=>{ s.update(); s.draw(); }); requestAnimationFrame(anim2); })();

// Avatar swap
document.addEventListener("DOMContentLoaded", () => {
  const initialBotGif = document.querySelector("#initial-bot-gif");
  if (initialBotGif) setTimeout(() => { initialBotGif.src = "girltalks.png"; }, 4000);
});
