// ===== DOM =====
const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const sendMessageButton = document.querySelector("#send-message");
const recordVoiceButton = document.querySelector("#record-voice");

// ===== Params from WebView (accept both legacy and new names) =====
const q = new URLSearchParams(location.search);
const UMA = {
  token:  q.get("t") || q.get("cpToken") || localStorage.getItem("cpToken") || "",
  code:   q.get("code")  || localStorage.getItem("cpCode")   || "",
  period: q.get("period")|| localStorage.getItem("cpPeriod") || "",
  name:   q.get("name")  || ""
};
if (q.get("t") || q.get("cpToken")) localStorage.setItem("cpToken", UMA.token);
if (q.get("code"))   localStorage.setItem("cpCode", UMA.code);
if (q.get("period")) localStorage.setItem("cpPeriod", UMA.period);

// ===== Speed settings =====
const THINK_MS = 900;   // shorter “thinking”
const TTL_MS   = 60_000; // 1 min cache

// ===== Cache =====
const cache = {
  student: null,
  schedules: null,
  ts: { student: 0, schedules: 0 }
};

// ===== Helpers =====
const authHeader = () => (UMA.token ? { "Authorization": `Bearer ${UMA.token}` } : {});
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const todayISO = () => new Date().toISOString().slice(0,10);

function addUser(msg){
  const el = document.createElement("div");
  el.className = "user-message-container";
  el.innerHTML = `<div class="user-message-card"><div class="message-text">${msg}</div></div>`;
  chatBody.appendChild(el); chatBody.scrollTop = chatBody.scrollHeight;
}
function addBot(thinking=true){
  const el = document.createElement("div");
  el.className = "bot-message-container";
  el.innerHTML = `
    <div class="logo-container"><img src="girltalk.gif" class="bot-gif"></div>
    <div class="bot-message-card"><div class="message-text">${thinking?"🤔":""}</div></div>`;
  chatBody.appendChild(el); chatBody.scrollTop = chatBody.scrollHeight;
  const gif = el.querySelector(".bot-gif"); setTimeout(()=>gif.src="girltalks.png", THINK_MS);
  return el.querySelector(".message-text");
}

// ===== UMA sync & accessors =====
async function umaSync() {
  if (!UMA.token || !UMA.code) return { ok:false, message:"missing-credentials" };
  try {
    const r = await fetch("/uma/sync", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ token: UMA.token, code: UMA.code, period: UMA.period })
    });
    const j = await r.json();

    // pull name if available
    const st = j.student?.data || {};
    UMA.name = UMA.name || st.fullName || st.names || st.nombreCompleto || "";

    if (j.student)   { cache.student   = j.student;   cache.ts.student   = Date.now(); }
    if (j.schedules) { cache.schedules = j.schedules; cache.ts.schedules = Date.now(); }
    return j;
  } catch (e) {
    return { ok:false, message:e.message };
  }
}

function haveFresh(what){ return (Date.now() - cache.ts[what]) < TTL_MS; }

async function getStudent(){
  if (!haveFresh("student")) await umaSync();
  if (cache.student?.status === 404) throw new Error("student404");
  return cache.student;
}
async function getSchedules(){
  if (!haveFresh("schedules")) await umaSync();
  if (cache.schedules?.status === 404) throw new Error("sched404");
  return cache.schedules;
}

// ===== Next-class resolver =====
function nextClassFrom(payload){
  const data = payload?.data || [];
  const now  = new Date();

  let best = null;
  for (const it of data){
    const name = it.course_name || it.course || it.asignatura || it.name || "Curso";
    const room = it.classroom   || it.aula   || it.room || "";
    const start = it.start_time || it.start || it.horaInicio || it.inicio || it.datetime || it.fechaHora || "";
    let sdt = null;

    // ISO or “YYYY-MM-DD HH:mm”
    if (typeof start === "string" && (start.includes("T") || start.includes("-"))){
      const s = start.replace("T"," ").replace("Z","");
      const d = new Date(s);
      if (!isNaN(d)) sdt = d;
    }
    // If only “date” + “start”
    if (!sdt){
      const d = it.date || it.class_date || it.fecha;
      const t = it.start || it.start_time || it.horaInicio || it.inicio;
      if (d && t){
        const dts = `${d} ${t}`.trim().replace("T"," ");
        const d2 = new Date(dts);
        if (!isNaN(d2)) sdt = d2;
      }
    }
    if (sdt && sdt > now){
      if (!best || sdt < best.sdt) best = { sdt, name, room };
    }
  }
  return best;
}

// ===== NLU (Spanish + English) =====
function detectIntent(text){
  const s = text.toLowerCase();
  if (/(qu[ií]en soy|mi nombre|who am i|what.*my.*name)/i.test(s)) return "whoami";
  if (/(horario|pr[oó]xima? clase|siguiente clase|ahora|today|next class)/i.test(s)) return "schedule";
  return "llm";
}

// ===== Intent handlers (fast) =====
async function handleWhoAmI(node){
  try {
    await getStudent();
    if (UMA.name) { node.innerHTML = `Eres <strong>${UMA.name}</strong>.`; return; }
    node.textContent = "No pude leer tu nombre ahora.";
  } catch {
    node.textContent = "Necesito tu sesión UMA para decirte tu nombre.";
  }
}

async function handleSchedule(node){
  try {
    const sc = await getSchedules();
    const nxt = nextClassFrom(sc);
    if (!nxt){
      node.textContent = "No veo clases próximas en tu periodo.";
      return;
    }
    const hh = nxt.sdt.toLocaleString("es-PE", { hour:"2-digit", minute:"2-digit", day:"2-digit", month:"2-digit" });
    node.innerHTML = `Tu próxima clase es <b>${nxt.name}</b> el <b>${hh}</b>${nxt.room?` en aula <b>${nxt.room}</b>`:""}.`;
  } catch (e){
    if ((e.message||"").includes("sched404")) node.textContent = "No hay horarios publicados para tu periodo.";
    else node.textContent = "No pude sincronizar tu horario ahora. Inténtalo más tarde.";
  }
}

// ===== Gemini fallback (only if needed) =====
const GEMINI_KEYS = ["YOUR_GEMINI_KEY"];
async function askGemini(prompt){
  const body = {
    contents: [{ role:"user", parts:[{ text:
`Responde en español, directo y breve para estudiantes UMA.
Si conoces el nombre del estudiante úsalo: ${UMA.name||"estudiante"}.
Pregunta: ${prompt}` }]}],
    generationConfig: { maxOutputTokens: 200, temperature: 0.6 }
  };
  for (const k of GEMINI_KEYS){
    if (!k) continue;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${k}`;
    try{
      const r = await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      if (!r.ok) continue;
      const j = await r.json();
      return (j?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    }catch{}
  }
  return "No tengo una respuesta clara ahora.";
}

// ===== Send flow =====
async function sendMessage(e){
  e?.preventDefault?.();
  const msg = messageInput.value.trim();
  if (!msg) return;

  addUser(msg);
  messageInput.value = "";

  const node = addBot(true);
  await sleep(THINK_MS);

  if (!UMA.token || !UMA.code){
    node.textContent = "No estás autenticado: abre el chatbot desde la app UMA.";
    return;
  }

  const intent = detectIntent(msg);
  if (intent === "whoami")   { await handleWhoAmI(node); return; }
  if (intent === "schedule") { await handleSchedule(node); return; }

  // fallback → Gemini
  node.innerHTML = (await askGemini(msg)).replace(/\n/g,"<br>");
}

// wire
document.getElementById("chatForm")?.addEventListener("submit", sendMessage);
sendMessageButton?.addEventListener("click", sendMessage);
messageInput?.addEventListener("keydown", (e)=>{ if (e.key==="Enter" && !e.shiftKey) sendMessage(e); });

// prefetch UMA on load to warm cache + pull name
umaSync();
