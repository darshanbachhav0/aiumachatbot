// ===== DOM =====
const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const sendBtn = document.querySelector("#send-message");
const micBtn  = document.querySelector("#record-voice");

// ===== UMA params from Android WebView =====
const qs = new URLSearchParams(location.search);
const UMA = {
  token:  qs.get("t")      || localStorage.getItem("cpToken")  || "",
  code:   qs.get("code")   || localStorage.getItem("cpCode")    || "",
  period: qs.get("period") || localStorage.getItem("cpPeriod")  || "",
  name:   qs.get("name")   || ""
};
if (qs.get("t"))      localStorage.setItem("cpToken", UMA.token);
if (qs.get("code"))   localStorage.setItem("cpCode", UMA.code);
if (qs.get("period")) localStorage.setItem("cpPeriod", UMA.period);

// ===== speed tweaks =====
const THINK_MS = 900;

// ===== rendering =====
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
  setTimeout(()=> el.querySelector(".bot-gif").src = "girltalks.png", THINK_MS);
  return el.querySelector(".message-text");
}
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

// ===== prefetch UMA summary (name/cycle) =====
async function warm() {
  if (!UMA.token || !UMA.code) return;
  try {
    const r = await fetch("/uma/sync", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ token: UMA.token, code: UMA.code, period: UMA.period })
    });
    const j = await r.json();
    UMA.name = UMA.name || j?.summary?.fullName || "";
  } catch {}
}
warm();

// ===== small NLU =====
function intentOf(t){
  const s = t.trim().toLowerCase();
  if (/(qu[ií]en soy|mi nombre|what.*my.*name|who am i)/i.test(s)) return "whoami";
  if (/(horario|clase|pr[oó]xima|siguiente|today|ahora|mañana|next)/i.test(s)) return "schedule";
  if (/(pago|mensualidad|deuda|recibo|cu[oó]to|pagos)/i.test(s)) return "payments";
  if (/(nota|calificaci[oó]n|promedio|grades)/i.test(s)) return "grades";
  if (/(asistencia|attendance)/i.test(s)) return "attendance";
  if (/(aula|sal[oó]n|room)/i.test(s)) return "rooms";
  return "llm";
}

// ===== handlers (API-first) =====
async function handleWhoAmI(node){
  try{
    const r = await fetch("/uma/summary", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ token: UMA.token, code: UMA.code, period: UMA.period })
    });
    const j = await r.json();
    const nm = j.name || UMA.name || "estudiante";
    node.innerHTML = `Eres <b>${nm}</b>${j.cycle?`, ciclo <b>${j.cycle}</b>`:""}.`;
  }catch{ node.textContent = "No pude leer tu nombre ahora."; }
}
async function handleSchedule(node){
  try{
    // try today first
    const r = await fetch("/uma/schedule_today", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ token: UMA.token, code: UMA.code, period: UMA.period })
    });
    const j = await r.json();
    if (j.classes?.length){
      const lines = j.classes.map(c=>`• ${c.course}: ${c.start}${c.end?`–${c.end}`:""}${c.room?` (aula ${c.room})`:""}`).join("<br>");
      node.innerHTML = `Tus clases de hoy:<br>${lines}`;
      return;
    }
    // else: next class
    const r2 = await fetch("/uma/next_class", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ token: UMA.token, code: UMA.code, period: UMA.period })
    });
    const j2 = await r2.json();
    if (j2.ok && j2.has_next){
      const n = j2.next;
      node.innerHTML = `Próxima clase: <b>${n.course}</b>, el <b>${n.start}</b>${n.room?` en aula <b>${n.room}</b>`:""}.`;
    } else {
      node.textContent = "No veo clases próximas en tu periodo.";
    }
  }catch{ node.textContent = "No pude consultar tu horario."; }
}
async function handlePayments(node){
  try{
    const r = await fetch("/uma/payments_status", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ token: UMA.token, code: UMA.code })
    });
    const j = await r.json();
    if ((j.due||[]).length){
      const lines = j.due.slice(0,5).map(x=>`• ${x.concept || x.item || "Pago"}: ${x.amount || x.importe || ""} (pendiente)`).join("<br>");
      node.innerHTML = `Pagos pendientes:<br>${lines}`;
    } else {
      node.textContent = "No tienes pagos pendientes registrados.";
    }
  }catch{ node.textContent = "No pude consultar tus pagos."; }
}
async function handleGrades(node){
  try{
    const r = await fetch("/uma/grades_recent", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ token: UMA.token, code: UMA.code, period: UMA.period })
    });
    const j = await r.json();
    if ((j.grades||[]).length){
      const lines = j.grades.map(g=>`• ${g.course || "Curso"}: ${g.grade ?? "-"}`).join("<br>");
      node.innerHTML = `Tus calificaciones más recientes:<br>${lines}`;
    } else { node.textContent = "No encontré calificaciones recientes."; }
  }catch{ node.textContent = "No pude consultar tus calificaciones."; }
}
async function handleAttendance(node){
  try{
    const r = await fetch("/uma/attendance", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ token: UMA.token, code: UMA.code, period: UMA.period })
    });
    const j = await r.json();
    if (j.summary?.percent != null){
      node.innerHTML = `Tu asistencia general es <b>${j.summary.percent}%</b>.`;
    } else { node.textContent = "No pude calcular tu asistencia."; }
  }catch{ node.textContent = "No pude consultar tu asistencia."; }
}
async function handleRooms(node){
  try{
    const r = await fetch("/uma/enrollment_rooms", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ token: UMA.token, code: UMA.code })
    });
    const j = await r.json();
    if ((j.rooms||[]).length){
      node.innerHTML = `Aulas registradas: ${j.rooms.join(", ")}`;
    } else { node.textContent = "No encontré aulas registradas para tu matrícula."; }
  }catch{ node.textContent = "No pude consultar tus aulas."; }
}

// ===== Gemini fallback (only if nothing matched) =====
const GEMINI_KEYS = ["YOUR_GEMINI_KEY"];  // replace/rotate as you prefer
async function askGemini(prompt){
  const body = {
    contents: [{role:"user", parts:[{text:
`Responde en español, breve y útil para estudiantes UMA.
Si conoces el nombre del estudiante, úsalo: ${UMA.name || "estudiante"}.
Pregunta: ${prompt}`}]}],
    generationConfig: { maxOutputTokens: 220, temperature: 0.6 }
  };
  for (const k of GEMINI_KEYS){
    if (!k) continue;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${k}`;
    try{
      const r = await fetch(url, {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body)});
      if (!r.ok) continue;
      const j = await r.json();
      return (j?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    }catch{}
  }
  return "No tengo una respuesta clara ahora.";
}

// ===== main send flow =====
async function sendMessage(e){
  e?.preventDefault?.();
  const msg = messageInput.value.trim();
  if (!msg) return;
  addUser(msg); messageInput.value = "";

  const node = addBot(true);
  await sleep(THINK_MS);

  if (!UMA.token || !UMA.code){
    node.textContent = "No estás autenticado: abre el chatbot desde la app UMA.";
    return;
  }

  const intent = intentOf(msg);
  try {
    if      (intent === "whoami")     return handleWhoAmI(node);
    else if (intent === "schedule")   return handleSchedule(node);
    else if (intent === "payments")   return handlePayments(node);
    else if (intent === "grades")     return handleGrades(node);
    else if (intent === "attendance") return handleAttendance(node);
    else if (intent === "rooms")      return handleRooms(node);

    // fallback to Gemini
    node.innerHTML = (await askGemini(msg)).replace(/\n/g,"<br>");
  } catch (e) {
    node.textContent = "Ups, algo falló al procesar tu consulta.";
  }
}

// wire
document.getElementById("chatForm")?.addEventListener("submit", sendMessage);
sendBtn?.addEventListener("click", sendMessage);
messageInput?.addEventListener("keydown", e => { if (e.key==="Enter" && !e.shiftKey) sendMessage(e); });
