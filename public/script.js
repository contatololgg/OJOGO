// script.js
const socket = io();

// Elementos da UI
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

const replyBar = document.getElementById('reply-bar');
const replyAuthor = document.getElementById('reply-author');
const replyText = document.getElementById('reply-text');
const cancelReply = document.getElementById('cancel-reply');
let replyingTo = null; // { id, nome, texto }

const adminPanel = document.getElementById("admin-panel");
const btnClear = document.getElementById("btn-clear");
const btnGlobalMute = document.getElementById("btn-global-mute");
const muteTarget = document.getElementById("mute-target");
const btnMute = document.getElementById("btn-mute");
const btnUnmute = document.getElementById("btn-unmute");
const setNameInput = document.getElementById("set-name-input");
const btnSetName = document.getElementById("btn-set-name");
const usersList = document.getElementById("users-list");
const globalMuteWarning = document.getElementById("global-mute-warning");

// Elementos mobile
const fabMaster = document.getElementById('fab-master');
const masterDrawer = document.getElementById('master-drawer');
const closeDrawer = document.getElementById('close-drawer');
const adminAvatarOptionsMobile = document.querySelectorAll("#admin-avatar-options-mobile .avatar-option");
const setNameInputMobile = document.getElementById("set-name-input-mobile");
const btnSetNameMobile = document.getElementById("btn-set-name-mobile");

// Avatares do admin desktop
const adminAvatarOptions = document.querySelectorAll("#admin-avatar-options .avatar-option");

let selectedAvatar = null;
let selectedMasterAvatar = null;
let myName = null;
let myRole = null;
let myUserId = null;
let serverState = { globalMuted: false };
let historicoPendente = null;

// Cache de mensagens
const mensagensCache = new Map();

// Menu de contexto
const contextMenu = document.getElementById('context-menu');
const contextReply = document.getElementById('context-reply');
const contextDelete = document.getElementById('context-delete');
let currentMessageId = null;
let currentMessageAuthorId = null;
let longPressTimer = null;

const typingIndicator = document.getElementById("typing-msg");
let typingUsers = {};

// Painel do mestre colapsável (desktop)
const toggleAdminBtn = document.getElementById('toggle-admin-panel');
if (toggleAdminBtn) {
  const isCollapsed = localStorage.getItem('adminPanelCollapsed') === 'true';
  if (isCollapsed) {
    adminPanel.classList.add('collapsed');
    toggleAdminBtn.textContent = '▲';
  }
  toggleAdminBtn.addEventListener('click', () => {
    adminPanel.classList.toggle('collapsed');
    const collapsed = adminPanel.classList.contains('collapsed');
    toggleAdminBtn.textContent = collapsed ? '▲' : '▼';
    localStorage.setItem('adminPanelCollapsed', collapsed);
  });
}

// Mostrar aviso (toast)
function mostrarAviso(texto) {
  const aviso = document.createElement("div");
  aviso.className = "toast-warning";
  aviso.textContent = texto;
  document.body.appendChild(aviso);
  setTimeout(() => aviso.remove(), 3000);
}

// Conexão
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
  screenRegister.style.display = "";
  screenChat.style.display = "none";
  myName = null; myRole = null; myUserId = null;
  mostrarAviso("Sessão expirada. Faça login novamente.");
});

socket.on("disconnect", () => mostrarAviso("Conexão perdida. Tentando reconectar..."));
socket.on("reconnect", () => mostrarAviso("Reconectado com sucesso!"));
socket.on("reconnect_error", () => mostrarAviso("Erro ao reconectar. Verifique sua internet."));

// Seleção de avatar (player)
avatarOptions.forEach(img => img.addEventListener("click", () => {
  avatarOptions.forEach(i => i.classList.remove("selected"));
  img.classList.add("selected");
  selectedAvatar = img.dataset.avatar;
  atualizarBotaoPlayer();
}));

// Seleção de avatar (master na tela de login)
if (masterAvatarOptions) {
  masterAvatarOptions.forEach(img => img.addEventListener("click", () => {
    masterAvatarOptions.forEach(i => i.classList.remove("selected"));
    img.classList.add("selected");
    selectedMasterAvatar = img.dataset.avatar;
  }));
}

// Seleção de avatar (admin desktop)
if (adminAvatarOptions) {
  adminAvatarOptions.forEach(img => img.addEventListener("click", () => {
    adminAvatarOptions.forEach(i => i.classList.remove("selected"));
    img.classList.add("selected");
    socket.emit("setMyAvatar", img.dataset.avatar);
    mostrarAviso("Avatar alterado!");
  }));
}

// Seleção de avatar (admin mobile)
if (adminAvatarOptionsMobile) {
  adminAvatarOptionsMobile.forEach(img => img.addEventListener("click", () => {
    adminAvatarOptionsMobile.forEach(i => i.classList.remove("selected"));
    img.classList.add("selected");
    socket.emit("setMyAvatar", img.dataset.avatar);
    mostrarAviso("Avatar alterado!");
  }));
}

// Toggle forms
document.querySelectorAll('input[name="role"]').forEach(r => {
  r.addEventListener("change", () => {
    if (r.value === "player" && r.checked) {
      playerForm.style.display = "";
      masterForm.style.display = "none";
    } else {
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

// Entrar como player
enterPlayerBtn.addEventListener("click", () => {
  const nome = playerNameInput.value.trim();
  const senha = playerPasswordInput.value.trim();
  if (!nome || !selectedAvatar || !senha) return mostrarAviso("Escolha avatar, nome e senha.");
  socket.emit("register", { role: "player", nome, avatar: selectedAvatar, senha });
});

// Entrar como master
enterMasterBtn.addEventListener("click", () => {
  const senha = masterPassInput.value;
  if (!senha) return mostrarAviso("Senha necessária.");
  socket.emit("register", { role: "master", senha, avatar: selectedMasterAvatar });
});

// Receber token
socket.on("authToken", (token) => {
  localStorage.setItem("chatAuth", token);
});

// Histórico
socket.on("historico", (msgs) => {
  historicoPendente = msgs;
  mensagensCache.clear();
  msgs.forEach(m => {
    m.avatar = m.avatar || "/avatars/default.png";
    mensagensCache.set(m._id, m);
  });
  if (myUserId) renderizarHistorico();
});

function renderizarHistorico() {
  chatList.innerHTML = "";
  historicoPendente.forEach(m => renderMsg(m));
}

// Registro confirmado
socket.on("registered", (dados) => {
  myName = dados.nome;
  myRole = dados.role || "player";
  myUserId = dados._id || null;
  screenRegister.style.display = "none";
  screenChat.style.display = "";

  // Mostrar painel correto conforme role e dispositivo
  if (myRole === "master") {
    if (window.innerWidth <= 600) {
      fabMaster.style.display = "flex";
      adminPanel.style.display = "none";
    } else {
      adminPanel.style.display = "";
      fabMaster.style.display = "none";
    }
  } else {
    adminPanel.style.display = "none";
    fabMaster.style.display = "none";
  }

  setTimeout(() => ajustarLayoutMobile(), 200);
  if (historicoPendente) renderizarHistorico();
});

socket.on("registerError", (msg) => mostrarAviso(msg));
socket.on("kicked", (msg) => {
  mostrarAviso(msg || "Você foi desconectado por outro mestre.");
  setTimeout(() => window.location.reload(), 2000);
});

// Nova mensagem
socket.on("mensagem", (m) => {
  m.avatar = m.avatar || "/avatars/default.png";
  mensagensCache.set(m._id, m);
  renderMsg(m);
});

// Mensagem apagada / limpeza
socket.on("messageDeleted", (id) => {
  mensagensCache.delete(id);
  document.querySelector(`li[data-id="${id}"]`)?.remove();
});
socket.on("cleared", () => {
  chatList.innerHTML = "";
  mensagensCache.clear();
});

// Estado do servidor
socket.on("serverState", (st) => {
  serverState = st || { globalMuted: false };
  if (btnGlobalMute) {
    btnGlobalMute.textContent = serverState.globalMuted ? "Desilenciar todos" : "Silenciar todos";
  }
  if (globalMuteWarning) {
    globalMuteWarning.style.display = serverState.globalMuted ? "flex" : "none";
  }
});

socket.on("mutedWarning", (msg) => mostrarAviso(msg));

// Usuários online
socket.on("onlineUsers", (users) => {
  // Atualiza select de mute
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

  // Atualiza lista de usuários online
  if (usersList) {
    usersList.innerHTML = "";
    users.forEach(u => {
      const li = document.createElement("li");
      const img = document.createElement("img");
      img.src = u.avatar || "/avatars/default.png";
      img.className = "user-avatar";
      img.onerror = () => { img.src = "/avatars/default.png"; };
      const span = document.createElement("span");
      span.textContent = u.nome;
      li.appendChild(img);
      li.appendChild(span);
      if (u.role === "master") li.classList.add("user-master");
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

// Envio de mensagem com suporte a reply
function enviarMensagem() {
  if (!myName) return mostrarAviso("Defina seu perfil primeiro.");
  let texto = msgInput.value.trim();
  if (!texto) return;
  if (texto.length > 500) return mostrarAviso("Mensagem muito longa (máx 500 chars).");

  const mensagemData = { texto };
  if (replyingTo) {
    mensagemData.replyTo = replyingTo.id;
  }

  socket.emit("mensagem", mensagemData);
  msgInput.value = "";
  socket.emit("stopTyping");
  msgInput.style.height = 'auto';
  cancelarReply();
}

sendBtn.addEventListener("click", enviarMensagem);
msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    enviarMensagem();
  }
});

// Auto-resize e indicador de digitação
let typingTimer;
msgInput.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = (this.scrollHeight) + 'px';
  socket.emit("typing");
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => socket.emit("stopTyping"), 2000);
});

socket.on("userTyping", (dados) => {
  const nome = dados.nome;
  if (typingUsers[nome]) clearTimeout(typingUsers[nome]);
  typingUsers[nome] = setTimeout(() => {
    delete typingUsers[nome];
    atualizarTypingIndicator();
  }, 3000);
  atualizarTypingIndicator();
});

socket.on("userStopTyping", (dados) => {
  delete typingUsers[dados.nome];
  atualizarTypingIndicator();
});

function atualizarTypingIndicator() {
  const nomes = Object.keys(typingUsers);
  if (nomes.length === 0) {
    typingIndicator.textContent = "";
    typingIndicator.classList.remove('active');
  } else if (nomes.length === 1) {
    typingIndicator.textContent = `${nomes[0]} está digitando...`;
    typingIndicator.classList.add('active');
  } else {
    const ultimo = nomes.pop();
    typingIndicator.textContent = `${nomes.join(', ')} e ${ultimo} estão digitando...`;
    typingIndicator.classList.add('active');
    nomes.push(ultimo);
  }
}

// Menu de contexto
function showContextMenu(e, msgId, authorId) {
  e.preventDefault();
  currentMessageId = msgId;
  currentMessageAuthorId = authorId;

  let posX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
  let posY = e.clientY || (e.touches ? e.touches[0].clientY : 0);

  const menuWidth = contextMenu.offsetWidth || 150;
  const menuHeight = contextMenu.offsetHeight || 100;
  posX = Math.min(posX, window.innerWidth - menuWidth);
  posY = Math.min(posY, window.innerHeight - menuHeight);

  contextMenu.style.top = posY + 'px';
  contextMenu.style.left = posX + 'px';
  contextMenu.style.display = 'block';

  const canDelete = (myRole === 'master' || (myUserId && myUserId.toString() === authorId?.toString()));
  contextDelete.style.display = canDelete ? 'block' : 'none';
}

function addContextMenuToMessage(li, msgId, authorId) {
  li.addEventListener('contextmenu', (e) => showContextMenu(e, msgId, authorId));
  li.addEventListener('touchstart', (e) => {
    longPressTimer = setTimeout(() => showContextMenu(e, msgId, authorId), 500);
  });
  li.addEventListener('touchend', () => clearTimeout(longPressTimer));
  li.addEventListener('touchmove', () => clearTimeout(longPressTimer));
}

document.addEventListener('click', (e) => {
  if (!contextMenu.contains(e.target)) contextMenu.style.display = 'none';
});
document.addEventListener('scroll', () => contextMenu.style.display = 'none', true);

// Ações do menu
contextReply.addEventListener('click', () => {
  if (currentMessageId) {
    const msg = mensagensCache.get(currentMessageId);
    if (msg) {
      replyingTo = { id: msg._id, nome: msg.nome, texto: msg.texto };
      replyAuthor.textContent = msg.nome;
      replyText.textContent = msg.texto.length > 40 ? msg.texto.substring(0, 40) + '…' : msg.texto;
      replyBar.style.display = 'flex';
      msgInput.focus();
    }
  }
  contextMenu.style.display = 'none';
});

contextDelete.addEventListener('click', () => {
  if (currentMessageId) socket.emit('deleteMessage', currentMessageId);
  contextMenu.style.display = 'none';
});

// Cancelar reply
cancelReply.addEventListener('click', cancelarReply);
function cancelarReply() {
  replyingTo = null;
  replyBar.style.display = 'none';
}

// Renderizar mensagem com suporte a reply
function formatarData(data) {
  const dataMsg = new Date(data);
  const hoje = new Date();
  const diffDias = Math.floor((hoje.setHours(0,0,0,0) - new Date(dataMsg).setHours(0,0,0,0)) / (86400000));
  const horario = dataMsg.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (diffDias === 0) return `Hoje às ${horario}`;
  if (diffDias === 1) return `Ontem às ${horario}`;
  if (diffDias < 7) {
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return `${dias[dataMsg.getDay()]} às ${horario}`;
  }
  return `${dataMsg.toLocaleDateString()} às ${horario}`;
}

function renderMsg(m) {
  const li = document.createElement("li");
  li.dataset.id = m._id;

  const isMaster = m.role === "master";
  const isMine = (m.autorId && myUserId && m.autorId.toString() === myUserId);

  if (isMaster) li.classList.add("master");
  if (isMine) li.classList.add("mine");

  const img = document.createElement("img");
  img.src = m.avatar || "/avatars/default.png";
  img.className = "msg-avatar";
  img.onerror = () => { img.src = "/avatars/default.png"; };

  const box = document.createElement("div");
  box.className = "msg-box";

  // Preview de reply, se houver
  if (m.replyTo) {
    const msgOriginal = mensagensCache.get(m.replyTo);
    if (msgOriginal) {
      const replyPreview = document.createElement("div");
      replyPreview.className = "reply-preview";
      replyPreview.dataset.replyId = m.replyTo;
      replyPreview.innerHTML = `
        <span class="reply-author">${msgOriginal.nome}</span>
        <span class="reply-text">${msgOriginal.texto.length > 30 ? msgOriginal.texto.substring(0,30)+'…' : msgOriginal.texto}</span>
      `;
      replyPreview.addEventListener('click', (e) => {
        e.stopPropagation();
        const originalLi = document.querySelector(`li[data-id="${m.replyTo}"]`);
        if (originalLi) {
          originalLi.scrollIntoView({ behavior: 'smooth', block: 'center' });
          originalLi.style.backgroundColor = 'var(--brand-primary)';
          setTimeout(() => originalLi.style.backgroundColor = '', 1000);
        }
      });
      box.appendChild(replyPreview);
    }
  }

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

  addContextMenuToMessage(li, m._id, m.autorId);

  chatList.appendChild(li);
  chatList.scrollTop = chatList.scrollHeight;
}

// Atualizar timestamps
setInterval(() => {
  document.querySelectorAll('#chat li').forEach(li => {
    const msgId = li.dataset.id;
    const dados = mensagensCache.get(msgId);
    if (dados) {
      const timeElement = li.querySelector('.msg-time');
      if (timeElement) timeElement.textContent = formatarData(new Date(dados.data));
    }
  });
}, 60000);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    document.querySelectorAll('#chat li').forEach(li => {
      const msgId = li.dataset.id;
      const dados = mensagensCache.get(msgId);
      if (dados) {
        const timeElement = li.querySelector('.msg-time');
        if (timeElement) timeElement.textContent = formatarData(new Date(dados.data));
      }
    });
  }
});

// Admin actions
btnClear.addEventListener("click", () => {
  if (confirm("Apagar todas as mensagens?")) socket.emit("clearAll");
});
btnGlobalMute.addEventListener("click", () => {
  socket.emit("setGlobalMute", { value: !serverState.globalMuted });
});
btnMute.addEventListener("click", () => {
  const targetUserId = muteTarget.value;
  if (!targetUserId) return mostrarAviso("Selecione um jogador.");
  socket.emit("muteUser", { userId: targetUserId, mute: true });
});
btnUnmute.addEventListener("click", () => {
  const targetUserId = muteTarget.value;
  if (!targetUserId) return mostrarAviso("Selecione um jogador.");
  socket.emit("muteUser", { userId: targetUserId, mute: false });
});
btnSetName.addEventListener("click", () => {
  const novo = setNameInput.value.trim();
  if (novo) {
    socket.emit("setMyName", novo);
    setNameInput.value = "";
  }
});
if (btnSetNameMobile) {
  btnSetNameMobile.addEventListener("click", () => {
    const novo = setNameInputMobile.value.trim();
    if (novo) {
      socket.emit("setMyName", novo);
      setNameInputMobile.value = "";
      masterDrawer.classList.remove('open');
    }
  });
}

// FAB e Drawer mobile
if (fabMaster) {
  fabMaster.addEventListener('click', () => {
    masterDrawer.classList.add('open');
  });
  closeDrawer.addEventListener('click', () => {
    masterDrawer.classList.remove('open');
  });
}

// Ajuste de layout mobile
function ajustarLayoutMobile() {
  if (window.innerWidth <= 600) {
    if (myRole === "master") {
      fabMaster.style.display = "flex";
      adminPanel.style.display = "none";
    }
  } else {
    fabMaster.style.display = "none";
    if (myRole === "master") adminPanel.style.display = "";
  }
}
window.addEventListener('resize', ajustarLayoutMobile);
document.addEventListener('DOMContentLoaded', ajustarLayoutMobile);
setTimeout(ajustarLayoutMobile, 500);

// Observador para quando o chat for exibido
const observer = new MutationObserver(() => {
  if (screenChat.style.display !== 'none') setTimeout(ajustarLayoutMobile, 100);
});
if (screenChat) observer.observe(screenChat, { attributes: true });