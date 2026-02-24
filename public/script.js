// script.js
const socket = io();

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

// Avatares do admin (para trocar)
const adminAvatarOptions = document.querySelectorAll("#admin-avatar-options .avatar-option");

let selectedAvatar = null;
let selectedMasterAvatar = null;
let myName = null;
let myRole = null;
let myUserId = null; 
let serverState = { globalMuted: false };

// Criação do elemento de "Digitando..." na tela
const typingIndicator = document.createElement("div");
typingIndicator.id = "typing-msg";
document.getElementById("chat-container").insertBefore(typingIndicator, msgInput.parentElement);

// Dicionário para controlar múltiplos usuários digitando
let typingUsers = {};

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

// avatar selection (player)
avatarOptions.forEach(img => img.addEventListener("click", () => {
  avatarOptions.forEach(i => i.classList.remove("selected"));
  img.classList.add("selected");
  selectedAvatar = img.dataset.avatar;
  atualizarBotaoPlayer();
}));

// avatar selection (master na tela de login)
if (masterAvatarOptions) {
  masterAvatarOptions.forEach(img => img.addEventListener("click", () => {
    masterAvatarOptions.forEach(i => i.classList.remove("selected"));
    img.classList.add("selected");
    selectedMasterAvatar = img.dataset.avatar;
  }));
}

// avatar selection (admin panel) - NOVO
if (adminAvatarOptions) {
  adminAvatarOptions.forEach(img => img.addEventListener("click", () => {
    adminAvatarOptions.forEach(i => i.classList.remove("selected"));
    img.classList.add("selected");
    const novoAvatar = img.dataset.avatar;
    socket.emit("setMyAvatar", novoAvatar);
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
  const nome = playerNameInput.value.trim();
  const senha = playerPasswordInput.value.trim();
  if (!nome || !selectedAvatar || !senha) return mostrarAviso("Escolha avatar, nome e senha.");
  socket.emit("register", { role: "player", nome, avatar: selectedAvatar, senha });
});

// entrar como master
enterMasterBtn.addEventListener("click", () => {
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

// evento kicked (quando um novo mestre se conecta)
socket.on("kicked", (msg) => {
  mostrarAviso(msg || "Você foi desconectado por outro mestre.");
  // Opcional: redirecionar para tela de login
  setTimeout(() => {
    window.location.reload(); // ou voltar para tela de registro
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
  const li = document.querySelector(`li[data-id="${id}"]`);
  if (li) li.remove();
});
socket.on("cleared", () => { chatList.innerHTML = ""; });

socket.on("serverState", (st) => {
  serverState = st || { globalMuted: false };
  btnGlobalMute.textContent = serverState.globalMuted ? "Desilenciar todos" : "Silenciar todos";
});

socket.on("mutedWarning", (msg) => mostrarAviso(msg || "Você está silenciado."));

socket.on("onlineUsers", (users) => {
  if (muteTarget) {
    muteTarget.innerHTML = '<option value="">Selecione um jogador</option>'; // opção vazia
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

// ===== Lógica de envio =====
function enviarMensagem() {
  if (!myName) return mostrarAviso("Defina seu perfil primeiro.");
  
  const texto = msgInput.value.trim();
  
  if (!texto) return;
  if (texto.length > 500) return mostrarAviso("Mensagem muito longa (máx 500 chars).");
  
  socket.emit("mensagem", { texto });
  msgInput.value = "";
  
  socket.emit("stopTyping"); // Para o aviso de digitando na hora
}

sendBtn.addEventListener("click", enviarMensagem);

msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    enviarMensagem();
  }
});

// ===== Lógica de Digitando Melhorada =====
let typingTimer;
msgInput.addEventListener("input", () => {
  socket.emit("typing");
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit("stopTyping");
  }, 2000);
});

// Função para atualizar o texto do indicador de digitação
function atualizarTypingIndicator() {
  const nomes = Object.keys(typingUsers);
  if (nomes.length === 0) {
    typingIndicator.textContent = "";
  } else if (nomes.length === 1) {
    typingIndicator.textContent = `${nomes[0]} está digitando...`;
  } else {
    // Junta os nomes com vírgula e o último com "e"
    const ultimo = nomes.pop();
    typingIndicator.textContent = `${nomes.join(', ')} e ${ultimo} estão digitando...`;
    // recoloca o último para manter o objeto íntegro (não necessário, mas seguro)
    nomes.push(ultimo);
  }
}

socket.on("userTyping", (dados) => {
  const nome = dados.nome;
  // Se já existe um timer para este usuário, limpa para reiniciar
  if (typingUsers[nome]) {
    clearTimeout(typingUsers[nome]);
  }
  // Cria um novo timeout para remover após 3 segundos sem novo evento
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

// render mensagens
function renderMsg(m) {
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
  const data = new Date(m.data);
  hora.textContent = data.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  box.appendChild(nome);
  box.appendChild(texto);
  box.appendChild(hora);

  li.appendChild(img);
  li.appendChild(box);

  if (myRole === "master") {
    const btnDel = document.createElement("button");
    btnDel.textContent = "Apagar";
    btnDel.addEventListener("click", () => socket.emit("deleteMessage", m._id));
    li.appendChild(btnDel);
  }

  chatList.appendChild(li);
  chatList.scrollTop = chatList.scrollHeight;
}

/* ===== admin actions ===== */
btnClear.addEventListener("click", () => {
  if (!confirm("Apagar todas as mensagens?")) return;
  socket.emit("clearAll");
});

btnGlobalMute.addEventListener("click", () => {
  socket.emit("setGlobalMute", { value: !serverState.globalMuted });
});

btnMute.addEventListener("click", () => {
  const targetUserId = muteTarget.value;
  if (!targetUserId) {
    mostrarAviso("Selecione um jogador para silenciar.");
    return;
  }
  socket.emit("muteUser", { userId: targetUserId, mute: true });
});

btnUnmute.addEventListener("click", () => {
  const targetUserId = muteTarget.value;
  if (!targetUserId) {
    mostrarAviso("Selecione um jogador para dessilenciar.");
    return;
  }
  socket.emit("muteUser", { userId: targetUserId, mute: false });
});

btnSetName.addEventListener("click", () => {
  const novo = setNameInput.value.trim();
  if (!novo) return;
  socket.emit("setMyName", novo);
  setNameInput.value = ""; // limpa o campo após trocar
});