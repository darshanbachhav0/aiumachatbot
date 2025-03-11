const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const sendMessageButton = document.querySelector("#send-message");
const recordVoiceButton = document.querySelector("#record-voice");
const chatbotToggler = document.querySelector("#chatbot-toggler");
const closeChatbot = document.querySelector("#close-chatbot");

const chatFooter = document.querySelector(".chat-footer");

let recognition;
let isRecording = false;


const GEMINI_API_KEY = "AIzaSyDArqnsWAtexq94vTi-fbMt3FtvgEYcPeg";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

chatbotToggler.addEventListener("click", () => {
  document.body.classList.toggle("show-chatbot");
});

closeChatbot.addEventListener("click", () => {
  document.body.classList.remove("show-chatbot");
});



// Function to handle message sending
const handleSendMessage = (e) => {
  e.preventDefault();
  const userMessage = messageInput.value.trim();
  if (!userMessage) return;

  displayUserMessage(userMessage);
  messageInput.value = "";

  generateBotResponse(userMessage);
};

// Click event for send button
sendMessageButton.addEventListener("click", handleSendMessage);

// Keypress event for Enter key
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { // Send message only if Shift is NOT pressed
      e.preventDefault(); // Prevents new line in textarea
      handleSendMessage(e);
  }
});

// Mic button press & hold effect
recordVoiceButton.addEventListener("mousedown", () => {
  startVoiceRecognition();
  recordVoiceButton.classList.add("recording");
});

recordVoiceButton.addEventListener("mouseup", () => {
  stopVoiceRecognition();
  recordVoiceButton.classList.remove("recording");
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

const universityResponses = {
  "admisión": "📝 Para información sobre el proceso de admisión, visita: <a href='https://uma.edu.pe/admision/'>Proceso de Admisión UMA</a>",
  "biblioteca": "📚 Accede a nuestra biblioteca virtual para recursos académicos: <a href='https://bibliovirtual.uma.edu.pe/'>Biblioteca Virtual UMA</a>",
  "pregrado": "📚 Ofrecemos una variedad de programas de pregrado en diversas facultades. Descubre más aquí: <a href='https://uma.edu.pe/pregrado/'>Programas de Pregrado UMA</a>",
  "posgrado": "🎓 Nuestros programas de posgrado incluyen maestrías y especializaciones profesionales. Más información en: <a href='https://uma.edu.pe/posgrado/'>Programas de Posgrado UMA</a>",
  "aula": "💻 Ingresa al Aula Virtual para tus cursos en línea: <a href='https://aulavirtual.uma.edu.pe/'>Aula Virtual UMA</a>",
  "sigu": "🔗 Accede al Sistema de Información para Gestión Universitaria (SIGU): <a href='https://sigu.uma.edu.pe/'>SIGU UMA</a>",
  "contacto": "📞 Puedes comunicarte con nosotros al (01) 389-1212 o al WhatsApp 914 569 313. Más información en: <a href='https://uma.edu.pe/contactos-oficinas/'>Contactos UMA</a>",
  "ubicación": "📍 Nuestra dirección es Av. Canto Bello 431, San Juan de Lurigancho, Lima 15408. Ver mapa: <a href='https://uma.edu.pe/contactos-oficinas/'>Ubicación UMA</a>",
  "noticias": "📰 Mantente al día con las últimas noticias y eventos: <a href='https://uma.edu.pe/noticias/'>Noticias UMA</a>",
  "bienestar": "😊 Conoce los servicios de bienestar universitario que ofrecemos: <a href='https://uma.edu.pe/bienestar-universitario/'>Bienestar Universitario UMA</a>",
  "convenios": "🤝 Descubre nuestros convenios nacionales e internacionales: <a href='https://uma.edu.pe/convenios/'>Convenios UMA</a>",
  "transparencia": "🔍 Accede a nuestro portal de transparencia: <a href='https://uma.edu.pe/portal-transparencia/'>Portal de Transparencia UMA</a>",
  "voluntariado": "🙌 Participa en nuestros programas de voluntariado: <a href='https://uma.edu.pe/voluntariado/'>Voluntariado UMA</a>",
  "defensoría": "🛡️ Conoce la Defensoría Universitaria y sus servicios: <a href='https://uma.edu.pe/defensoria-universitaria/'>Defensoría Universitaria UMA</a>",
  "tarifas": "💵 Consulta las tarifas de trámites y servicios: <a href='https://uma.edu.pe/tarifas-de-tramites/'>Tarifas UMA</a>",
  "licenciamiento": "🏛️ La Universidad María Auxiliadora obtuvo su licenciamiento en 2018, garantizando una educación de calidad. Más detalles aquí: <a href='https://uma.edu.pe/'>Licenciamiento UMA</a>",
  "movilidad": "🌍 Participa en nuestros programas de movilidad estudiantil y enriquece tu experiencia académica en el extranjero. Infórmate en: <a href='https://uma.edu.pe/movilidad-estudiantil/'>Movilidad Estudiantil UMA</a>",
  "educación": "📘 Ofrecemos cursos y diplomados para complementar tu formación profesional. Consulta nuestra oferta en: <a href='https://uma.edu.pe/educacion-continua2/'>Educación Continua UMA</a>",
  "examen": "📝 Prepárate para nuestro próximo examen de admisión. Conoce las fechas y requisitos en: <a href='https://uma.edu.pe/admision/'>Examen de Admisión UMA</a>",
  "investigación": "🔬 Fomentamos la investigación en diversas áreas del conocimiento. Descubre nuestros proyectos y publicaciones en: <a href='https://uma.edu.pe/proyectos-de-investigacion/'>Investigación UMA</a>",
  "responsabilidad": "🤝 Comprometidos con la sociedad, desarrollamos programas de responsabilidad social. Conoce nuestras iniciativas en: <a href='https://uma.edu.pe/uma-barrio/'>Responsabilidad Social UMA</a>",
  "alumni": "🎓 Mantente conectado con la comunidad UMA a través de nuestra red de egresados. Visita: <a href='https://uma.edu.pe/alumni/'>Alumni UMA</a>",
  "hola": "👋 ¡Hola! ¿Cómo puedo ayudarte hoy? 😊",
  "hello": "👋 ¡Hola! ¿En qué puedo ayudarte? 🤗",
  "cómo estás": "😊 Soy solo un bot, pero estoy aquí para ayudarte. 🤖",
  "gracias": "🙏 ¡De nada! Si necesitas más ayuda, aquí estaré. 🌟",
  "muchas gracias": "🙏 ¡De nada! Siempre listo para ayudar. 🌟",
  "adiós": "👋 ¡Hasta luego! ¡Que tengas un buen día! 🌈"
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

  // Replace GIF with static image after 4 seconds
  const botGif = botMessageContainer.querySelector(".bot-gif");
  setTimeout(() => {
      botGif.src = "girltalks.png";
  }, 4000);

  // **Check for predefined responses**
  let responseText = null;
  const lowerCaseMessage = userMessage.toLowerCase();
  for (const key in universityResponses) {
      if (lowerCaseMessage.includes(key)) {
          responseText = universityResponses[key];
          break;
      }
  }

  if (responseText) {
      botMessageContainer.querySelector(".message-text").innerHTML = responseText;
      return;
  }

  // **If no predefined response, call Gemini API**
  try {
      const requestBody = {
          contents: [{ role: "user", parts: [{ text: userMessage }] }]
      };

      const response = await fetch(GEMINI_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error.message);

      const botResponse = data.candidates[0].content.parts[0].text.trim();
      botMessageContainer.querySelector(".message-text").textContent = botResponse;

  } catch (error) {
      console.error("Chatbot API Error:", error);
      botMessageContainer.querySelector(".message-text").textContent = "⚠️ Error: No se pudo obtener una respuesta.";
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
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  recognition.start();

  recognition.onstart = () => {
      console.log("Voice recognition started...");
  };

  recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      displayUserMessage(transcript);
      generateBotResponse(transcript);
  };

  recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      displayUserMessage("⚠️ Could not transcribe audio.");
  };
};

const stopVoiceRecognition = () => {
  if (recognition) {
      recognition.stop();
  }
};

// Stop first response GIF after playing once
document.addEventListener("DOMContentLoaded", () => {
  const initialBotGif = document.querySelector("#initial-bot-gif");

  if (initialBotGif) {
      setTimeout(() => {
          initialBotGif.src = "girltalks.png"; // Replace with your static image
      }, 4000); // Adjust this duration to match the GIF length
  }
});






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
