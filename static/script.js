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

document.addEventListener("DOMContentLoaded", function () {
  document.body.addEventListener("click", function (event) {
    if (event.target.classList.contains("phone-link")) {
      event.preventDefault();
      const phoneNumber = event.target.getAttribute("data-phone");
      openPhoneOptions(phoneNumber);
    }
  });
});

function openPhoneOptions(phoneNumber) {
  document.getElementById("phoneOverlay").style.display = "block";
  document.getElementById("phoneOptions").style.display = "block";
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
    return data.corrected_query;
  } catch (error) {
    console.error("Spelling Correction Error:", error);
    return userInput;
  }
}

chatbotToggler.addEventListener("click", () => {
  document.body.classList.toggle("show-chatbot");
});
closeChatbot.addEventListener("click", () => {
  document.body.classList.remove("show-chatbot");
});

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

  const botGif = botMessageContainer.querySelector(".bot-gif");
  setTimeout(() => {
    botGif.src = "girltalks.png";
  }, 4000);

  const correctedMessage = await correctSpelling(userMessage);

  try {
    const mlRes = await fetch("/get_response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: correctedMessage }),
    });
    const mlData = await mlRes.json();
    const bestDoc = mlData.best_doc;
    const bestScore = mlData.best_score;

    if (mlData.is_faq) {
      setTimeout(() => {
        botMessageContainer.querySelector(".message-text").innerHTML = bestDoc;
      }, 4000);
      return;
    }

    const THRESHOLD = 0.3;
    if (bestScore > THRESHOLD) {
      const formattedResponse = formatResponse(bestDoc);
      setTimeout(() => {
        botMessageContainer.querySelector(".message-text").innerHTML =
          `<strong>📌 Información relevante encontrada:</strong><br>${formattedResponse}`;
      }, 4000);
      return;
    }

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `
              Responde exclusivamente en español. 
              - NO uses expresiones como “la información proporcionada no indica...” o “no se encuentra información”.
              - Si es sobre la Universidad María Auxiliadora, usa la siguiente información de referencia:
              ${bestDoc}
    
              Si no está en la información, usa tu conocimiento general para crear una respuesta lo más útil y directa posible. 
              Evita oraciones de desconocimiento o falta de datos.
    
              Pregunta del usuario: ${correctedMessage}
              `
            },
          ],
        },
      ],
    };
    
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
        console.error(`Key ${currentKey} failed: ${data.error ? data.error.message : "Unknown error"}`);
        currentKeyIndex++;
      }
    }

    if (!success) {
      throw new Error("All API keys are exhausted or invalid.");
    }

    const botResponse = formatResponse(data.candidates[0].content.parts[0].text.trim());
    botMessageContainer.querySelector(".message-text").innerHTML = botResponse;

  } catch (error) {
    console.error("Chatbot API Error:", error);
    botMessageContainer.querySelector(".message-text").textContent =
      "⚠️ Error: No se pudo obtener una respuesta.";
  }
};

function formatResponse(text) {
  const lines = text.split('\n');
  const formattedLines = [];
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    const match = line.match(/\*\*(.*?)\*\*(.*)/);
    if (match) {
      formattedLines.push(`<li><strong>${match[1]}</strong>${match[2] ? ": " + match[2] : ""}</li>`);
    } else if (line.startsWith("-") || line.startsWith("*")) {
      formattedLines.push(`<li>${line.replace(/^[-*]\s*/, '')}</li>`);
    } else {
      formattedLines.push(`<p>${line}</p>`);
    }
  }
  if (formattedLines.length > 3) {
    return `<ul style="list-style-type: disc; margin-left: 15px;">${formattedLines.join('')}</ul>`;
  } else {
    return formattedLines.join('<br>');
  }
}

// ----------------- VOICE RECOGNITION -----------------
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

// ----------------- WHISPER STREAMING -----------------
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
    mediaRecorder.start(200);
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
        messageInput.value = text.trim();
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

function startWebSpeechRecognition() {
  if (!("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
    alert("Your browser does not support live speech recognition.");
    return;
  }
  let recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = "es-ES";
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

recordVoiceButton.addEventListener("mousedown", startLiveWhisper);
recordVoiceButton.addEventListener("mouseup", stopLiveWhisper);
recordVoiceButton.addEventListener("dblclick", startWebSpeechRecognition);

document.addEventListener("DOMContentLoaded", () => {
  const initialBotGif = document.querySelector("#initial-bot-gif");
  if (initialBotGif) {
    setTimeout(() => {
      initialBotGif.src = "girltalks.png";
    }, 4000);
  }
});

// ----------------- CANVAS ANIMATIONS -----------------
const canvas = document.getElementById("starsCanvas");
const ctx = canvas.getContext("2d");
let stars = [];
const numStars = 200;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

class Star {
  constructor(x, y, size, speed) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.speed = speed;
    this.opacity = Math.random();
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
      this.y = 0;
      this.x = Math.random() * canvas.width;
    }
    this.opacity = Math.random();
  }
}

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

function animateStars() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  stars.forEach(star => {
    star.update();
    star.draw();
  });
  requestAnimationFrame(animateStars);
}
animateStars();

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
    this.opacity = Math.random() * 0.3 + 0.1;
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
    this.opacity = Math.random() * 0.3 + 0.1;
  }
}

let chatbotStars = [];
const numChatbotStars = 80;

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
