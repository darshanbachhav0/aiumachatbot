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
  "examen": "📝 Prepárate para nuestro próximo examen de admisión. Conoce las fechas y requisitos en: <a href='https://uma.edu.pe/admision/'>Examen de Admisión UMA</a>",
  "investigación": "🔬 Fomentamos la investigación en diversas áreas del conocimiento. Descubre nuestros proyectos y publicaciones en: <a href='https://uma.edu.pe/proyectos-de-investigacion/'>Investigación UMA</a>",
  "responsabilidad": "🤝 Comprometidos con la sociedad, desarrollamos programas de responsabilidad social. Conoce nuestras iniciativas en: <a href='https://uma.edu.pe/uma-barrio/'>Responsabilidad Social UMA</a>",
  "alumni": "🎓 Mantente conectado con la comunidad UMA a través de nuestra red de egresados. Visita: <a href='https://uma.edu.pe/alumni/'>Alumni UMA</a>"
};

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
  for (const key in universityResponses) {
    if (lowerCaseMessage.includes(key)) {
      responseText = universityResponses[key];
      break;
    }
  }
  if (responseText) {
    setTimeout(() => {
      botMessageContainer.querySelector(".message-text").innerHTML = responseText;
    }, 4000);
    return;
  }

  try {
    // 1) Call your Flask endpoint
    const mlRes = await fetch("http://localhost:5000/get_response", {
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
    botMessageContainer.querySelector(".message-text").textContent = botResponse;

  } catch (error) {
    console.error("Chatbot API Error:", error);
    botMessageContainer.querySelector(".message-text").textContent =
      "⚠️ Error: No se pudo obtener una respuesta.";
  }
};

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

// Stop initial GIF after 4 seconds
document.addEventListener("DOMContentLoaded", () => {
  const initialBotGif = document.querySelector("#initial-bot-gif");
  if (initialBotGif) {
    setTimeout(() => {
      initialBotGif.src = "girltalks.png";
    }, 4000);
  }
});

// (Include your canvas animation code below if needed)






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

// Add Event Listener for Click Effects
canvas.addEventListener("click", (event) => {
  createBurst(event.clientX, event.clientY);
});








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


























