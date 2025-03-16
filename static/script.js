// DOM Selections
const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const sendMessageButton = document.querySelector("#send-message");
const recordVoiceButton = document.querySelector("#record-voice");
const chatbotToggler = document.querySelector("#chatbot-toggler");
const closeChatbot = document.querySelector("#close-chatbot");
const chatFooter = document.querySelector(".chat-footer");

// Gemini API Keys (preserved)
const API_KEYS = [
  "AIzaSyDArqnsWAtexq94vTi-fbMt3FtvgEYcPeg",
  "AIzaSyB1Ex3LXaO32GaxIpLxTaCH4q0HJE4iASA",
  "AIzaSyBv4cWgsoeiPqkrAvrZTxwezoD7JLh8BBI",
  "AIzaSyD6gi_wcgD3kXmk_QXNcxHeMCMGGxph8Hc"
];
let currentKeyIndex = 0;

// Predefined fallback responses
const universityResponses = {
  "examen": "📝 Prepárate para nuestro próximo examen de admisión. Conoce las fechas y requisitos en: <a href='https://uma.edu.pe/admisionpregrado/'>Examen de Admisión UMA</a>",
  
  "carreras": "📚 En la UMA ofrecemos diversas carreras de pregrado en Ingeniería, Negocios, Ciencias de la Salud y más. Consulta nuestra lista completa aquí: <a href='https://uma.edu.pe/'>Carreras UMA</a>",

  "maestrías": "🎓 La UMA ofrece maestrías como MBA y Salud Pública. Encuentra más información en: <a href='https://uma.edu.pe/mba/'>Maestría en Administraciónde Empresas - MBA</a><br><a href='https://uma.edu.pe/maestria-en-salud-publica/'>Maestría en Salud Pública UMA</a>",

  "especialización": "🏥 Contamos con programas de Segunda Especialización Profesional en Enfermería, Farmacia y más. Revisa nuestros programas aquí: <a href='https://uma.edu.pe/psee/'>Especializaciones UMA</a>",

  "diplomado": "📜 Explora nuestros diplomados en Especialización en Toxicología Ambiental y Seguridad Alimentaria, Seguridad Alimentaria,Asuntos Regulatorios del Sector Farmacéutico,enfermedades crónicas no transmisibles y Salud Mental Comunitaria.",

  "admisión": "📄 ¿Quieres estudiar en la UMA? Conoce nuestros requisitos y procesos de admisión en: <a href='https://uma.edu.pe/admisionpregrado/'>Admisión UMA</a>",



  "ingeniería": "🖥️ Nuestra Facultad de Ingeniería y Negocios ofrece carreras como:\n- Ingeniería de Inteligencia Artificial\n- Ingeniería de Sistemas (Nuevo)\n- Ingeniería Industrial (Nuevo)\n📌",

  "derecho": "⚖️ La carrera de Derecho ahora está disponible en la UMA. Consulta más información aquí: <a href='https://uma.edu.pe/derecho/'>Derecho UMA</a>",

  "administración": "📊 La Facultad de Ingeniería y Negocios ofrece Administración en:\n- Empresas (Nuevo)\n- Negocios Internacionales\n- Marketing\n- Contabilidad y Finanzas\n📌",

  "farmacia": "💊 Nuestra Facultad de Farmacia y Bioquímica ofrece la carrera de Farmacia y Bioquímica. Consulta más información aquí: <a href='https://uma.edu.pe/'>Farmacia UMA</a>",

  "salud": "🏥 La Facultad de Ciencias de la Salud de la UMA incluye programas como:\n- Tecnología Médica en Laboratorio Clínico\n- Tecnología Médica en Terapia Física y Rehabilitación\n- Enfermería\n- Nutrición y Dietética\n- Psicología\n📌",

  "mba": "🎓 La UMA ofrece la Maestría en Administración de Empresas (MBA) (Nuevo). 📌 Más información: <a href='https://uma.edu.pe/mba/'>UMA MBA</a>",

  "psicología": "🧠 La carrera de Psicología en la UMA prepara profesionales para trabajar en hospitales, empresas y centros educativos. Más información aquí: <a href='https://uma.edu.pe/psicologia/'>Psicología UMA</a>",

  "enfermería": "🏥 La UMA ofrece especializaciones en Enfermería, incluyendo:\n- Cuidados Intensivos\n- Salud Familiar y Comunitaria\n- Emergencias y Desastres\n- Centro Quirúrgico\n📌 Más información aquí: <a href='https://uma.edu.pe/psee/'>Especialización en Enfermería</a>",

  "urología": "🩺 La UMA ahora ofrece la especialización en Urología (Nuevo). 📌 Más información aquí: <a href='https://uma.edu.pe/see-en-urologia/'>Especialización en Urología</a>",

  "farmacia especialidad": "💊 Segunda Especialidad en Farmacia:\n- Asuntos Regulatorios del Sector Farmacéutico (Nuevo)\n📌 Más información: <a href='https://uma.edu.pe/asuntos-regulatorios-en-el-sector-farmaceutico/'>Especialización en Farmacia</a>",

  

  "contacto": `
  📞 ¿Necesitas ayuda? Puedes contactar con nuestra oficina de admisión:<br><br>
  - Ms. Katya Aponte: <a href="#" class="phone-link" data-phone="51982887246">982 887 246</a> | <a href="mailto:katia.aponte@uma.edu.pe">katia.aponte@uma.edu.pe</a><br>
  - Ms. Sandy León: <a href="#" class="phone-link" data-phone="51923032722">923 032 722</a> | <a href="mailto:sandy.leon@uma.edu.pe">sandy.leon@uma.edu.pe</a><br>
  - Ms. Esperanza Pérez: <a href="#" class="phone-link" data-phone="51923319253">923 319 253</a> | <a href="mailto:esperanza.perez@uma.edu.pe">esperanza.perez@uma.edu.pe</a><br>
  - Ms. Antuanette Fernández: <a href="#" class="phone-link" data-phone="51922821832">922 821 832</a> | <a href="mailto:jahaira.fernandez@uma.edu.pe">jahaira.fernandez@uma.edu.pe</a><br>
  - Ms. Karol Padilla: <a href="#" class="phone-link" data-phone="51914569310">914 569 310</a> | <a href="mailto:karol.padilla@uma.edu.pe">karol.padilla@uma.edu.pe</a><br>
  `
 
};


document.addEventListener("DOMContentLoaded", function () {
  // Attach event listener to all phone number links
  document.body.addEventListener("click", function (event) {
    if (event.target.classList.contains("phone-link")) {
      event.preventDefault(); // Prevent default link behavior
      const phoneNumber = event.target.getAttribute("data-phone");
      openPhoneOptions(phoneNumber);
    }
  });
});

function openPhoneOptions(phoneNumber) {
  document.getElementById("phoneOverlay").style.display = "block";
  document.getElementById("phoneOptions").style.display = "block";

  // Set actions for Call and WhatsApp buttons
  document.getElementById("callButton").onclick = function () {
    window.location.href = `tel:${phoneNumber}`;
  };

  document.getElementById("whatsappButton").onclick = function () {
    window.location.href = `https://wa.me/${phoneNumber}`;
  };
}

function closePhoneOptions() {
  document.getElementById("phoneOverlay").style.display = "none";
  document.getElementById("phoneOptions").style.display = "none";
}

async function correctSpelling(userInput) {
  try {
      const response = await fetch('/correct_spelling', {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: userInput })
      });

      const data = await response.json();
      return data.corrected_query; // Return corrected query
  } catch (error) {
      console.error("Spelling Correction Error:", error);
      return userInput; // If API fails, return original input
  }
}


// Toggle chatbot popup
chatbotToggler.addEventListener("click", () => {
  document.body.classList.toggle("show-chatbot");
});
closeChatbot.addEventListener("click", () => {
  document.body.classList.remove("show-chatbot");
});

// Handle sending messages
const handleSendMessage = (e) => {
  e.preventDefault();
  const userMessage = messageInput.value.trim();
  if (!userMessage) return;

  displayUserMessage(userMessage);
  messageInput.value = "";
  generateBotResponse(userMessage);
};

sendMessageButton.addEventListener("click", handleSendMessage);
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage(e);
  }
});

// Display user message
const displayUserMessage = (message) => {
  const userMessageContainer = document.createElement("div");
  userMessageContainer.classList.add("user-message-container");
  userMessageContainer.innerHTML = `
    <div class="user-message-card">
      <div class="message-text">${message}</div>
    </div>
  `;
  chatBody.appendChild(userMessageContainer);
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
};

// Generate bot response
const generateBotResponse = async (userMessage) => {
  const botMessageContainer = document.createElement("div");
  botMessageContainer.classList.add("bot-message-container");
  botMessageContainer.innerHTML = `
      <div class="logo-container">
          <img src="girltalk.gif" alt="Chatbot Avatar" class="bot-gif">
      </div>
      <div class="bot-message-card">
          <div class="message-text">🤔</div>
      </div>
  `;
  chatBody.appendChild(botMessageContainer);
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });

  // Replace GIF with static image after 4 seconds
  const botGif = botMessageContainer.querySelector(".bot-gif");
  setTimeout(() => {
    botGif.src = "girltalks.png";
  }, 4000);

  // First, check for predefined keywords
  let responseText = null;
  const lowerCaseMessage = userMessage.toLowerCase();

// Correct spelling before searching for predefined responses
const correctedMessage = await correctSpelling(lowerCaseMessage);


for (const key in universityResponses) {
    if (correctedMessage.includes(key)) {
        responseText = universityResponses[key];
        break;
    }
}

  for (const key in universityResponses) {
    if (lowerCaseMessage.includes(key)) {
      responseText = universityResponses[key];
      break;
    }
  }
  if (responseText) {
    // Convert predefined response text into bullet points if applicable
    const formattedResponse = convertDoubleAsteriskToBullets(responseText);

    setTimeout(() => {
        botMessageContainer.querySelector(".message-text").innerHTML = formattedResponse;
    }, 4000);
    return;
}


  try {
    // 1) Call your Flask endpoint
    const mlRes = await fetch("/get_response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: userMessage }),
    });
    const mlData = await mlRes.json();
    const bestDoc = mlData.best_doc;
    const bestScore = mlData.best_score;

    // 2) Decide if the doc is relevant
    const THRESHOLD = 0.2; // tweak as needed
    let promptText;

    if (bestScore > THRESHOLD) {
      // If relevant, include the website text in the prompt
      promptText = `
        Utiliza la siguiente información de la Universidad María Auxiliadora si te resulta útil:
        ${bestDoc}
        Ahora responde la pregunta del usuario: ${userMessage}
      `;
    } else {
      // If not relevant, skip the doc
      promptText = userMessage;
    }

    // 3) Prepare the Gemini API request
    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: promptText,
            },
          ],
        },
      ],
    };

    // 4) Try each Gemini API key
    let response, data, success = false;
    while (!success && currentKeyIndex < API_KEYS.length) {
      const currentKey = API_KEYS[currentKeyIndex];
      const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${currentKey}`;
      response = await fetch(GEMINI_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      data = await response.json();
      if (response.ok) {
        success = true;
      } else {
        console.error(
          `Key ${currentKey} failed: ${
            data.error ? data.error.message : "Unknown error"
          }`
        );
        currentKeyIndex++;
      }
    }

    if (!success) {
      throw new Error("All API keys have been exhausted or are invalid.");
    }

    // 5) Extract the final Gemini response
    const botResponse = data.candidates[0].content.parts[0].text.trim();

    // Convert the raw text with asterisks into bullet points (only if >= 4 lines)
    const formattedResponse = convertDoubleAsteriskToBullets(botResponse);

    // Render as HTML
    botMessageContainer.querySelector(".message-text").innerHTML = formattedResponse;

  } catch (error) {
    console.error("Chatbot API Error:", error);
    botMessageContainer.querySelector(".message-text").textContent =
      "⚠️ Error: No se pudo obtener una respuesta.";
  }
};

/**
 * Converts lines starting with **Some Title** into bullet points,
 * BUT only if the text has >= 4 non-empty lines.
 * Uses list-style-position: inside to ensure the bullet is fully visible.
 */
function convertDoubleAsteriskToBullets(rawText) {
  // Split text by newlines
  const lines = rawText.split('\n');
  // Filter out empty lines
  const nonEmptyLines = lines.filter(line => line.trim());

  // If message has fewer than 4 lines, just replace newlines with <br>
  if (nonEmptyLines.length < 4) {
    return rawText.replace(/\n/g, '<br>');
  }

  // Convert to bullet points
  const listItems = [];
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Try to match the pattern **Title**: rest
    const match = line.match(/\*\*(.*?)\*\*(.*)/);
    if (match) {
      const boldPart = match[1].trim();
      const rest = match[2].trim();
      listItems.push(
        `<li><strong>${boldPart}</strong>${rest ? ': ' + rest : ''}</li>`
      );
    } else {
      listItems.push(`<li>${line}</li>`);
    }
  }

  // Return a <ul> with bullet points fully visible
  return `
    <ul style="list-style-type: disc; list-style-position: inside; margin-left: 0; padding-left: 0;">
      ${listItems.join('')}
    </ul>
  `;
}










// Voice recognition functions
const startVoiceRecognition = () => {
  if (!("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
    alert("Your browser does not support voice recognition.");
    return;
  }
  recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = "es-ES";
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  recognition.start();

  const listeningIndicator = document.createElement("div");
  listeningIndicator.classList.add("listening-indicator");
  listeningIndicator.innerHTML = `<div class="wave-container">
      <span class="wave"></span>
      <span class="wave"></span>
      <span class="wave"></span>
      <span class="wave"></span>
      <span class="wave"></span>
  </div><p>Escucha...</p>`;
  document.body.appendChild(listeningIndicator);

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript + " ";
    }
    messageInput.value = transcript.trim();
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
  };

  recognition.onend = () => {
    listeningIndicator.remove();
  };
};

const stopVoiceRecognition = () => {
  if (recognition) {
    recognition.stop();
  }
};

recordVoiceButton.addEventListener("touchstart", () => {
  startVoiceRecognition();
  recordVoiceButton.classList.add("recording");
});
recordVoiceButton.addEventListener("touchend", () => {
  stopVoiceRecognition();
  recordVoiceButton.classList.remove("recording");
});
recordVoiceButton.addEventListener("mousedown", () => {
  startVoiceRecognition();
  recordVoiceButton.classList.add("recording");
});
recordVoiceButton.addEventListener("mouseup", () => {
  stopVoiceRecognition();
  recordVoiceButton.classList.remove("recording");
});



let mediaRecorder;
let audioStream;

async function startLiveWhisper() {
    try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(audioStream);

        mediaRecorder.ondataavailable = async (event) => {
            if (event.data.size > 0) {
                sendAudioToBackend(event.data);
            }
        };

        mediaRecorder.start(200); // Send chunks every 200ms
    } catch (error) {
        console.error("Microphone access error:", error);
    }
}

async function sendAudioToBackend(audioBlob) {
  const reader = new FileReader();
  reader.readAsArrayBuffer(audioBlob);
  reader.onloadend = async () => {
      const audioData = reader.result;
      try {
          const response = await fetch("/speech_to_text_stream", {
              method: "POST",
              body: audioData,
              headers: { "Content-Type": "application/octet-stream" }
          });

          const reader = response.body.getReader();
          reader.read().then(function processText({ done, value }) {
              if (done) return;
              let text = new TextDecoder("utf-8").decode(value);
              messageInput.value = text.trim(); // Update chat input in real-time
              reader.read().then(processText);
          });
      } catch (error) {
          console.error("Streaming error:", error);
      }
  };
}
function stopLiveWhisper() {
  if (mediaRecorder) {
      mediaRecorder.stop();
  }
  if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
  }
}


// Ensure we only detect Spanish voice
function startWebSpeechRecognition() {
  if (!("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
      alert("Your browser does not support live speech recognition.");
      return;
  }

  let recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = "es-ES"; // **Force Spanish-only speech recognition**
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript + " ";
      }
      messageInput.value = transcript.trim();
  };

  recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
  };

  recognition.start();
}

// Attach listeners for Whisper AI (Live speech-to-text in Spanish)
recordVoiceButton.addEventListener("mousedown", startLiveWhisper);
recordVoiceButton.addEventListener("mouseup", stopLiveWhisper);

// Attach fallback Web Speech API for Spanish recognition
recordVoiceButton.addEventListener("dblclick", startWebSpeechRecognition);


// Stop initial GIF after 4 seconds
document.addEventListener("DOMContentLoaded", () => {
  const initialBotGif = document.querySelector("#initial-bot-gif");
  if (initialBotGif) {
    setTimeout(() => {
      initialBotGif.src = "girltalks.png";
    }, 4000);
  }
});

// Canvas Animation (Stars) for Background
const canvas = document.getElementById("starsCanvas");
const ctx = canvas.getContext("2d");

let stars = [];
const numStars = 200;

// Resize canvas to match the window size
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// Create Star Object
class Star {
  constructor(x, y, size, speed) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.speed = speed;
    this.opacity = Math.random(); // For twinkle effect
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
    ctx.fill();
  }

  update() {
    this.y += this.speed;
    if (this.y > canvas.height) {
      this.y = 0; // Reset star to the top
      this.x = Math.random() * canvas.width;
    }
    this.opacity = Math.random(); // Twinkle effect
  }
}

// Initialize Stars
function createStars() {
  stars = [];
  for (let i = 0; i < numStars; i++) {
    let x = Math.random() * canvas.width;
    let y = Math.random() * canvas.height;
    let size = Math.random() * 2;
    let speed = Math.random() * 0.5;
    stars.push(new Star(x, y, size, speed));
  }
}
createStars();

// Animate Stars
function animateStars() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  stars.forEach(star => {
    star.update();
    star.draw();
  });
  requestAnimationFrame(animateStars);
}
animateStars();

// Click Effect - Generate Burst of Stars
function createBurst(x, y) {
  let burstStars = [];
  for (let i = 0; i < 20; i++) {
    burstStars.push({
      x, y,
      size: Math.random() * 3 + 1,
      speedX: (Math.random() - 0.5) * 4,
      speedY: (Math.random() - 0.5) * 4,
      opacity: 1
    });
  }

  function animateBurst() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(star => {
      star.update();
      star.draw();
    });

    burstStars.forEach((star, index) => {
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
      ctx.fill();
      star.x += star.speedX;
      star.y += star.speedY;
      star.opacity -= 0.02;
      if (star.opacity <= 0) burstStars.splice(index, 1);
    });

    if (burstStars.length > 0) {
      requestAnimationFrame(animateBurst);
    }
  }
  animateBurst();
}

// Add Event Listener for Click Effects on the Canvas
canvas.addEventListener("click", (event) => {
  createBurst(event.clientX, event.clientY);
});

// Chatbot Canvas Animation (Optional)
const chatbotCanvas = document.getElementById("chatbotStarsCanvas");
const chatbotCtx = chatbotCanvas.getContext("2d");

function resizeChatbotCanvas() {
  chatbotCanvas.width = chatbotCanvas.clientWidth;
  chatbotCanvas.height = chatbotCanvas.clientHeight;
}
resizeChatbotCanvas();
window.addEventListener("resize", resizeChatbotCanvas);

class ChatbotStar {
  constructor(x, y, size, speed) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.speed = speed;
    this.opacity = Math.random() * 0.3 + 0.1; // Lower opacity for faded effect
  }

  draw() {
    chatbotCtx.beginPath();
    chatbotCtx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    chatbotCtx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
    chatbotCtx.fill();
  }

  update() {
    this.y += this.speed;
    if (this.y > chatbotCanvas.height) {
      this.y = 0;
      this.x = Math.random() * chatbotCanvas.width;
    }
    this.opacity = Math.random() * 0.3 + 0.1; // Ensures dim glow effect
  }
}

let chatbotStars = [];
const numChatbotStars = 80; // Keep the number lower for smooth effect

function createChatbotStars() {
  chatbotStars = [];
  for (let i = 0; i < numChatbotStars; i++) {
    let x = Math.random() * chatbotCanvas.width;
    let y = Math.random() * chatbotCanvas.height;
    let size = Math.random() * 1.5;
    let speed = Math.random() * 0.3;
    chatbotStars.push(new ChatbotStar(x, y, size, speed));
  }
}
createChatbotStars();

function animateChatbotStars() {
  chatbotCtx.clearRect(0, 0, chatbotCanvas.width, chatbotCanvas.height);
  chatbotStars.forEach(star => {
    star.update();
    star.draw();
  });
  requestAnimationFrame(animateChatbotStars);
}
animateChatbotStars();
