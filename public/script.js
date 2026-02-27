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

// Avatares do admin
const adminAvatarOptions = document.querySelectorAll("#admin-avatar-options .avatar-option");

let selectedAvatar = null;
let selectedMasterAvatar = null;
let myName = null;
let myRole = null;
let myUserId = null; 
let serverState = { globalMuted: false };
let historicoPendente = null;

// ===== Cache  =====
const mensagensCache = new Map(); // id -> dados da mensagem

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

// Feedback de conexão
socket.on("connect", () => {
  console.log("Conectado ao servidor");
  const token = localStorage.getItem("chatAuth");
  if (token) {
    socket.emit("resume", token);
  }
});

socket.on("resumeFailed", () => {
  console.log("Falha na retomada da sessão");
  localStorage.removeItem("chatAuth");
  // Volta para a tela de login
  screenRegister.style.display = "";
  screenChat.style.display = "none";
  myName = null;
  myRole = null;
  myUserId = null;
  mostrarAviso("Sessão expirada. Faça login novamente.");
});

socket.on("disconnect", () => {
  mostrarAviso("Conexão perdida. Tentando reconectar...");
});

socket.on("reconnect", () => {
  mostrarAviso("Reconectado com sucesso!");
});

socket.on("reconnect_attempt", () => {
  // Opcional: mostrar tentativa
});

socket.on("reconnect_error", () => {
  mostrarAviso("Erro ao reconectar. Verifique sua internet.");
});

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

// avatar selection (admin panel)
if (adminAvatarOptions) {
  adminAvatarOptions.forEach(img => img.addEventListener("click", () => {
    adminAvatarOptions.forEach(i => i.classList.remove("selected"));
    img.classList.add("selected");
    const novoAvatar = img.dataset.avatar;
    socket.emit("setMyAvatar", novoAvatar);
    mostrarAviso("Avatar alterado!"); // Feedback visual
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

socket.on("historico", (msgs) => {
  historicoPendente = msgs;
  mensagensCache.clear(); // opcional
  msgs.forEach(m => mensagensCache.set(m._id, m));
  if (myUserId) {
    renderizarHistorico();
  }
});

function renderizarHistorico() {
  chatList.innerHTML = "";
  historicoPendente.forEach(m => renderMsg(m));
}

// confirmação de registro
socket.on("registered", (dados) => {
  myName = dados.nome;
  myRole = dados.role || "player";
  myUserId = dados._id || null;
  if (screenRegister) screenRegister.style.display = "none";
  if (screenChat) screenChat.style.display = "";
  if (myRole === "master") adminPanel.style.display = "";
  else adminPanel.style.display = "none";
  if (historicoPendente) {
    renderizarHistorico();
  }
});

// erros de registro
socket.on("registerError", (msg) => mostrarAviso(msg));

// evento kicked (quando um novo mestre se conecta)
socket.on("kicked", (msg) => {
  mostrarAviso(msg || "Você foi desconectado por outro mestre.");
  setTimeout(() => {
    window.location.reload();
  }, 2000);
});

// histórico
socket.on("historico", (msgs) => {
  chatList.innerHTML = "";
  msgs.forEach(m => {
    mensagensCache.set(m._id, m);
    renderMsg(m);
  });
});

// nova mensagem
socket.on("mensagem", (m) => {
  mensagensCache.set(m._id, m);
  renderMsg(m);
});

// apagado / limpo
socket.on("messageDeleted", (id) => {
  mensagensCache.delete(id); // <-- ADICIONE ESTA LINHA
  const li = document.querySelector(`li[data-id="${id}"]`);
  if (li) li.remove();
});
socket.on("cleared", () => { 
  chatList.innerHTML = "";
  mensagensCache.clear(); // <-- ADICIONE ESTA LINHA
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
      
      // Criar elemento de imagem para o avatar
      const img = document.createElement("img");
      img.src = u.avatar || "avatars/default.png";
      img.className = "user-avatar";
      img.alt = u.nome;
      img.onerror = () => { img.src = "avatars/default.png"; }; // Fallback
      
      // Criar span com o nome
      const span = document.createElement("span");
      span.textContent = u.nome;
      
      // Adicionar elementos ao li
      li.appendChild(img);
      li.appendChild(span);
      
      // Se for mestre, adicionar classe especial
      if (u.role === "master") li.classList.add("user-master");
      
      // Se estiver silenciado, adicionar badge
      if (u.muted) {
        const badge = document.createElement("span");
        badge.className = "badge-muted";
        badge.textContent = "🔇";
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
  
  socket.emit("stopTyping");
  
  // Reset altura do textarea
  msgInput.style.height = 'auto';
}

sendBtn.addEventListener("click", enviarMensagem);

msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    enviarMensagem();
  }
});

// Auto-resize do textarea (melhoria adicional)
function autoResizeTextarea() {
  msgInput.style.height = 'auto';
  msgInput.style.height = (msgInput.scrollHeight) + 'px';
}
msgInput.addEventListener('input', autoResizeTextarea);

// ===== Lógica de Digitando Melhorada com animação =====
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

// MELHORIA 8: render mensagens com timestamps relativos
function formatarData(data) {
  const dataMsg = new Date(data);
  const hoje = new Date();
  const diferencaDias = Math.floor((hoje - dataMsg) / (1000 * 60 * 60 * 24));
  
  // Ajustar para considerar apenas datas (ignorar horário)
  const dataMsgSemHorario = new Date(dataMsg.getFullYear(), dataMsg.getMonth(), dataMsg.getDate());
  const hojeSemHorario = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const diffDias = Math.floor((hojeSemHorario - dataMsgSemHorario) / (1000 * 60 * 60 * 24));
  
  const horario = dataMsg.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  if (diffDias === 0) {
    return `Hoje às ${horario}`;
  } else if (diffDias === 1) {
    return `Ontem às ${horario}`;
  } else if (diffDias < 7) {
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return `${dias[dataMsg.getDay()]} às ${horario}`;
  } else {
    return `${dataMsg.toLocaleDateString()} às ${horario}`;
  }
}

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
  hora.textContent = formatarData(m.data); // MELHORIA 8

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
  setNameInput.value = "";
});

// ===== ATUALIZAÇÃO AUTOMÁTICA DE TIMESTAMPS =====
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

// Atualizar timestamps a cada minuto
setInterval(atualizarTimestamps, 60000); // 60 segundos

// Atualizar quando o usuário voltar à aba
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    atualizarTimestamps();
  }
});






  
