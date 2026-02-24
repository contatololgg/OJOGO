// script.js
const socket = io({
  reconnection: true,
  reconnectionAttempts: 10,        // Tenta reconectar 10 vezes
  reconnectionDelay: 1000,          // 1 segundo entre tentativas
  reconnectionDelayMax: 5000,        // Máximo de 5 segundos
  timeout: 10000                     // Timeout de 10 segundos
});

// UI elements
const screenRegister = document.getElementById("screen-register");
const playerForm = document.getElementById("player-form");
const masterForm = document.getElementById("master-form");

const playerNameInput = document.getElementById("player-name");
const playerPasswordInput = document.getElementById("player-password");
const avatarOptions = document.querySelectorAll("#avatar-options .avatar-option");

const masterPassInput = document.getElementById("master-pass");
const masterAvatarOptions = document.querySelectorAll("#master-avatar-options .avatar-option");
const enterPlayerBtn = document.getElementById("enter-player");
const enterMasterBtn = document.getElementById("enter-master");

const screenChat = document.getElementById("screen-chat");
const chatList = document.getElementById("chat");
const msgInput = document.getElementById("msg");
const sendBtn = document.getElementById("send");

const adminPanel = document.getElementById("admin-panel");
const btnClear = document.getElementById("btn-clear");
const btnGlobalMute = document.getElementById("btn-global-mute");
const muteTarget = document.getElementById("mute-target");
const btnMute = document.getElementById("btn-mute");
const btnUnmute = document.getElementById("btn-unmute");
const setNameInput = document.getElementById("set-name-input");
const btnSetName = document.getElementById("btn-set-name");
const usersList = document.getElementById("users-list");

// Avatares do admin
const adminAvatarOptions = document.querySelectorAll("#admin-avatar-options .avatar-option");

let selectedAvatar = null;
let selectedMasterAvatar = null;
let myName = null;
let myRole = null;
let myUserId = null; 
let serverState = { globalMuted: false };
let isConnected = true; // Estado de conexão

// Cache para timestamps
const mensagensCache = new Map();

// Elemento de status de conexão
const connectionStatus = document.createElement("div");
connectionStatus.id = "connection-status";
connectionStatus.className = "connection-status connected";
connectionStatus.textContent = "Conectado";
document.body.appendChild(connectionStatus);

// Overlay de desconexão
const disconnectOverlay = document.createElement("div");
disconnectOverlay.id = "disconnect-overlay";
disconnectOverlay.className = "disconnect-overlay hidden";
disconnectOverlay.innerHTML = `
  <div class="disconnect-message">
    <h3>🔌 Conexão perdida</h3>
    <p>Tentando reconectar automaticamente...</p>
    <button id="force-reconnect">Tentar agora</button>
  </div>
`;
document.body.appendChild(disconnectOverlay);

// Criação do elemento de "Digitando..."
const typingIndicator = document.createElement("div");
typingIndicator.id = "typing-msg";
document.getElementById("chat-container").insertBefore(typingIndicator, msgInput.parentElement);

// Dicionário para controlar múltiplos usuários digitando
let typingUsers = {};

// ===== FUNÇÕES DE CONTROLE DE CONEXÃO =====
function atualizarEstadoConexao(conectado) {
  isConnected = conectado;
  
  // Atualiza status visual
  const statusEl = document.getElementById("connection-status");
  const overlayEl = document.getElementById("disconnect-overlay");
  
  if (conectado) {
    statusEl.textContent = "Conectado";
    statusEl.className = "connection-status connected";
    overlayEl.classList.add("hidden");
    
    // Reabilitar inputs
    msgInput.disabled = false;
    sendBtn.disabled = false;
    if (myRole === "master") {
      document.querySelectorAll('#admin-panel button, #admin-panel select, #admin-panel input').forEach(el => {
        el.disabled = false;
      });
    }
  } else {
    statusEl.textContent = "Desconectado";
    statusEl.className = "connection-status disconnected";
    overlayEl.classList.remove("hidden");
    
    // Desabilitar inputs
    msgInput.disabled = true;
    sendBtn.disabled = true;
    if (myRole === "master") {
      document.querySelectorAll('#admin-panel button, #admin-panel select, #admin-panel input').forEach(el => {
        el.disabled = true;
      });
    }
  }
}

// Forçar reconexão manual
document.getElementById("force-reconnect")?.addEventListener("click", () => {
  socket.connect();
  mostrarAviso("Tentando reconectar...");
});

// mostrar aviso (toast)
function mostrarAviso(texto) {
  const aviso = document.createElement("div");
  aviso.className = "toast-warning";
  aviso.textContent = texto;
  document.body.appendChild(aviso);
  setTimeout(() => aviso.remove(), 3000);
}

// tentar resume com token salvo
const savedToken = localStorage.getItem("chatAuth");
if (savedToken) socket.emit("resume", savedToken);

// ===== EVENTOS DE CONEXÃO DO SOCKET =====
socket.on("connect", () => {
  console.log("Conectado ao servidor");
  atualizarEstadoConexao(true);
  mostrarAviso("✅ Conectado ao servidor");
  
  // Se já estava logado, pedir histórico e estado novamente
  if (myName) {
    socket.emit("resume", localStorage.getItem("chatAuth"));
  }
});

socket.on("disconnect", (reason) => {
  console.log("Desconectado:", reason);
  atualizarEstadoConexao(false);
  
  if (reason === "io server disconnect") {
    // Desconexão iniciada pelo servidor
    mostrarAviso("❌ Desconectado pelo servidor");
  } else {
    mostrarAviso("⚠️ Conexão perdida. Reconectando...");
  }
});

socket.on("reconnect", (attemptNumber) => {
  console.log("Reconectado após", attemptNumber, "tentativas");
  mostrarAviso("✅ Reconectado com sucesso!");
  
  // Restaurar sessão
  const token = localStorage.getItem("chatAuth");
  if (token) {
    socket.emit("resume", token);
  }
});

socket.on("reconnect_attempt", (attemptNumber) => {
  console.log("Tentativa de reconexão", attemptNumber);
  // Opcional: atualizar status
  document.getElementById("connection-status").textContent = `Reconectando (${attemptNumber}/10)...`;
});

socket.on("reconnect_error", (error) => {
  console.error("Erro na reconexão:", error);
  mostrarAviso("❌ Erro ao reconectar. Verifique sua internet.");
});

socket.on("reconnect_failed", () => {
  console.log("Falha na reconexão");
  mostrarAviso("❌ Não foi possível reconectar. Recarregue a página.");
  
  // Mostrar botão de recarregar
  const overlay = document.getElementById("disconnect-overlay");
  overlay.querySelector('h3').textContent = "❌ Falha na conexão";
  overlay.querySelector('p').textContent = "Clique no botão para recarregar";
  overlay.querySelector('button').textContent = "Recarregar página";
  overlay.querySelector('button').onclick = () => window.location.reload();
});

// ===== AVATAR SELECTION =====
avatarOptions.forEach(img => img.addEventListener("click", () => {
  avatarOptions.forEach(i => i.classList.remove("selected"));
  img.classList.add("selected");
  selectedAvatar = img.dataset.avatar;
  atualizarBotaoPlayer();
}));

if (masterAvatarOptions) {
  masterAvatarOptions.forEach(img => img.addEventListener("click", () => {
    masterAvatarOptions.forEach(i => i.classList.remove("selected"));
    img.classList.add("selected");
    selectedMasterAvatar = img.dataset.avatar;
  }));
}

if (adminAvatarOptions) {
  adminAvatarOptions.forEach(img => img.addEventListener("click", () => {
    if (!isConnected) {
      mostrarAviso("Sem conexão. Aguarde reconectar.");
      return;
    }
    adminAvatarOptions.forEach(i => i.classList.remove("selected"));
    img.classList.add("selected");
    const novoAvatar = img.dataset.avatar;
    socket.emit("setMyAvatar", novoAvatar);
    mostrarAviso("Avatar alterado!");
  }));
}

// toggle forms
document.querySelectorAll('input[name="role"]').forEach(r => {
  r.addEventListener("change", () => {
    if (r.value === "player" && r.checked) {
      playerForm.style.display = "";
      masterForm.style.display = "none";
    } else if (r.value === "master" && r.checked) {
      playerForm.style.display = "none";
      masterForm.style.display = "";
    }
  });
});

enterPlayerBtn.disabled = true;
function atualizarBotaoPlayer() {
  const nome = playerNameInput.value.trim();
  const senha = playerPasswordInput ? playerPasswordInput.value.trim() : "";
  enterPlayerBtn.disabled = !(nome && selectedAvatar && senha);
}
playerNameInput.addEventListener("input", atualizarBotaoPlayer);
if (playerPasswordInput) playerPasswordInput.addEventListener("input", atualizarBotaoPlayer);

// entrar como player
enterPlayerBtn.addEventListener("click", () => {
  if (!isConnected) {
    mostrarAviso("Sem conexão com o servidor. Aguarde...");
    return;
  }
  const nome = playerNameInput.value.trim();
  const senha = playerPasswordInput.value.trim();
  if (!nome || !selectedAvatar || !senha) return mostrarAviso("Escolha avatar, nome e senha.");
  socket.emit("register", { role: "player", nome, avatar: selectedAvatar, senha });
});

// entrar como master
enterMasterBtn.addEventListener("click", () => {
  if (!isConnected) {
    mostrarAviso("Sem conexão com o servidor. Aguarde...");
    return;
  }
  const senha = masterPassInput.value;
  if (!senha) return mostrarAviso("Senha necessária.");
  socket.emit("register", { role: "master", senha, avatar: selectedMasterAvatar });
});

// receber token de sessão
socket.on("authToken", (token) => {
  if (!token) return;
  localStorage.setItem("chatAuth", token);
});

// confirmação de registro
socket.on("registered", (dados) => {
  myName = dados.nome;
  myRole = dados.role || "player";
  myUserId = dados._id || null;
  if (screenRegister) screenRegister.style.display = "none";
  if (screenChat) screenChat.style.display = "";
  if (myRole === "master") adminPanel.style.display = "";
  else adminPanel.style.display = "none";
});

// erros de registro
socket.on("registerError", (msg) => mostrarAviso(msg));

// evento kicked
socket.on("kicked", (msg) => {
  mostrarAviso(msg || "Você foi desconectado por outro mestre.");
  setTimeout(() => {
    window.location.reload();
  }, 2000);
});

// histórico
socket.on("historico", (msgs) => {
  chatList.innerHTML = "";
  msgs.forEach(renderMsg);
});

// nova mensagem
socket.on("mensagem", (m) => renderMsg(m));

// apagado / limpo
socket.on("messageDeleted", (id) => {
  mensagensCache.delete(id);
  const li = document.querySelector(`li[data-id="${id}"]`);
  if (li) li.remove();
});

socket.on("cleared", () => { 
  chatList.innerHTML = "";
  mensagensCache.clear();
});

socket.on("serverState", (st) => {
  serverState = st || { globalMuted: false };
  btnGlobalMute.textContent = serverState.globalMuted ? "Desilenciar todos" : "Silenciar todos";
});

socket.on("mutedWarning", (msg) => mostrarAviso(msg || "Você está silenciado."));

socket.on("onlineUsers", (users) => {
  if (muteTarget) {
    muteTarget.innerHTML = '<option value="">Selecione um jogador</option>';
    users.forEach(u => {
      if (u.role !== "master") {
        const opt = document.createElement("option");
        opt.value = u.userId || "";
        opt.textContent = u.nome + (u.muted ? " (silenciado)" : "");
        muteTarget.appendChild(opt);
      }
    });
  }

  if (usersList) {
    usersList.innerHTML = "";
    users.forEach(u => {
      const li = document.createElement("li");
      li.textContent = u.nome;
      if (u.role === "master") li.classList.add("user-master");
      if (u.muted) {
        const badge = document.createElement("span");
        badge.className = "badge-muted";
        badge.textContent = " Silenciado";
        li.appendChild(badge);
      }
      usersList.appendChild(li);
    });
  }
});

// ===== Lógica de envio com verificação de conexão =====
function enviarMensagem() {
  if (!isConnected) {
    mostrarAviso("Sem conexão. Aguarde reconectar.");
    return;
  }
  if (!myName) return mostrarAviso("Defina seu perfil primeiro.");
  
  const texto = msgInput.value.trim();
  
  if (!texto) return;
  if (texto.length > 500) return mostrarAviso("Mensagem muito longa (máx 500 chars).");
  
  socket.emit("mensagem", { texto });
  msgInput.value = "";
  msgInput.style.height = 'auto';
  socket.emit("stopTyping");
}

sendBtn.addEventListener("click", enviarMensagem);

msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    enviarMensagem();
  }
});

// Auto-resize do textarea
function autoResizeTextarea() {
  msgInput.style.height = 'auto';
  msgInput.style.height = (msgInput.scrollHeight) + 'px';
}
msgInput.addEventListener('input', autoResizeTextarea);

// ===== Lógica de Digitando =====
let typingTimer;
msgInput.addEventListener("input", () => {
  if (!isConnected) return;
  socket.emit("typing");
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit("stopTyping");
  }, 2000);
});

function atualizarTypingIndicator() {
  const nomes = Object.keys(typingUsers);
  if (nomes.length === 0) {
    typingIndicator.textContent = "";
    typingIndicator.classList.remove('active');
  } else if (nomes.length === 1) {
    typingIndicator.textContent = `${nomes[0]} está digitando`;
    typingIndicator.classList.add('active');
  } else {
    const ultimo = nomes.pop();
    typingIndicator.textContent = `${nomes.join(', ')} e ${ultimo} estão digitando`;
    nomes.push(ultimo);
    typingIndicator.classList.add('active');
  }
}

socket.on("userTyping", (dados) => {
  const nome = dados.nome;
  if (typingUsers[nome]) {
    clearTimeout(typingUsers[nome]);
  }
  typingUsers[nome] = setTimeout(() => {
    delete typingUsers[nome];
    atualizarTypingIndicator();
  }, 3000);
  atualizarTypingIndicator();
});

socket.on("userStopTyping", (dados) => {
  const nome = dados.nome;
  if (typingUsers[nome]) {
    clearTimeout(typingUsers[nome]);
    delete typingUsers[nome];
    atualizarTypingIndicator();
  }
});

// ===== Timestamps =====
function formatarData(data) {
  const dataMsg = new Date(data);
  const agora = new Date();
  const diferencaMs = agora - dataMsg;
  const diferencaMinutos = Math.floor(diferencaMs / (1000 * 60));
  const diferencaHoras = Math.floor(diferencaMs / (1000 * 60 * 60));
  const diferencaDias = Math.floor(diferencaMs / (1000 * 60 * 60 * 24));
  
  const horario = dataMsg.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  if (diferencaMinutos < 1) {
    return "Agora mesmo";
  } else if (diferencaMinutos < 60) {
    return `${diferencaMinutos} min atrás`;
  } else if (diferencaHoras < 24) {
    return `Hoje às ${horario}`;
  } else if (diferencaHoras < 48) {
    return `Ontem às ${horario}`;
  } else if (diferencaDias < 7) {
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return `${dias[dataMsg.getDay()]} às ${horario}`;
  } else {
    return `${dataMsg.toLocaleDateString()} às ${horario}`;
  }
}

function renderMsg(m) {
  mensagensCache.set(m._id, m);
  
  const li = document.createElement("li");
  li.dataset.id = m._id;

  const isMaster = m.role === "master";
  const isMine = (m.autorId && myUserId && m.autorId.toString() === myUserId);

  if (isMaster) li.classList.add("master");
  if (isMine) li.classList.add("mine");

  const img = document.createElement("img");
  img.src = m.avatar || "avatars/default.png";
  img.className = "msg-avatar";

  const box = document.createElement("div");
  box.className = "msg-box";

  const nome = document.createElement("div");
  nome.className = "msg-name";
  nome.textContent = m.nome;

  const texto = document.createElement("div");
  texto.className = "msg-text";
  texto.textContent = m.texto;

  const hora = document.createElement("div");
  hora.className = "msg-time";
  hora.textContent = formatarData(m.data);

  box.appendChild(nome);
  box.appendChild(texto);
  box.appendChild(hora);

  li.appendChild(img);
  li.appendChild(box);

  if (myRole === "master") {
    const btnDel = document.createElement("button");
    btnDel.textContent = "Apagar";
    btnDel.addEventListener("click", () => {
      if (!isConnected) {
        mostrarAviso("Sem conexão. Aguarde.");
        return;
      }
      socket.emit("deleteMessage", m._id);
    });
    li.appendChild(btnDel);
  }

  chatList.appendChild(li);
  chatList.scrollTop = chatList.scrollHeight;
}

// ===== Admin actions com verificação de conexão =====
btnClear.addEventListener("click", () => {
  if (!isConnected) {
    mostrarAviso("Sem conexão. Aguarde.");
    return;
  }
  if (!confirm("Apagar todas as mensagens?")) return;
  socket.emit("clearAll");
});

btnGlobalMute.addEventListener("click", () => {
  if (!isConnected) {
    mostrarAviso("Sem conexão. Aguarde.");
    return;
  }
  socket.emit("setGlobalMute", { value: !serverState.globalMuted });
});

btnMute.addEventListener("click", () => {
  if (!isConnected) {
    mostrarAviso("Sem conexão. Aguarde.");
    return;
  }
  const targetUserId = muteTarget.value;
  if (!targetUserId) {
    mostrarAviso("Selecione um jogador para silenciar.");
    return;
  }
  socket.emit("muteUser", { userId: targetUserId, mute: true });
});

btnUnmute.addEventListener("click", () => {
  if (!isConnected) {
    mostrarAviso("Sem conexão. Aguarde.");
    return;
  }
  const targetUserId = muteTarget.value;
  if (!targetUserId) {
    mostrarAviso("Selecione um jogador para dessilenciar.");
    return;
  }
  socket.emit("muteUser", { userId: targetUserId, mute: false });
});

btnSetName.addEventListener("click", () => {
  if (!isConnected) {
    mostrarAviso("Sem conexão. Aguarde.");
    return;
  }
  const novo = setNameInput.value.trim();
  if (!novo) return;
  socket.emit("setMyName", novo);
  setNameInput.value = "";
});

// ===== Atualização automática de timestamps =====
function atualizarTimestamps() {
  document.querySelectorAll('#chat li').forEach(li => {
    const msgId = li.dataset.id;
    const dados = mensagensCache.get(msgId);
    if (dados) {
      const timeElement = li.querySelector('.msg-time');
      if (timeElement) {
        timeElement.textContent = formatarData(new Date(dados.data));
      }
    }
  });
}

setInterval(atualizarTimestamps, 60000);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    atualizarTimestamps();
  }
});

// Inicializar como conectado
atualizarEstadoConexao(true);