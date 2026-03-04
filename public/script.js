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

// Reply
const replyBar = document.getElementById('reply-bar');
const replyAuthor = document.getElementById('reply-author');
const replyText = document.getElementById('reply-text');
const cancelReply = document.getElementById('cancel-reply');
let replyingTo = null;

// Painéis de mestre (ambos)
const adminPanel = document.getElementById("admin-panel");
const fabMaster = document.getElementById("fab-master");
const masterDrawer = document.getElementById("master-drawer");
const closeDrawer = document.getElementById("close-drawer");

// Elementos de controle (compartilhados entre painéis)
const btnClear = document.getElementById("btn-clear");
const btnGlobalMute = document.getElementById("btn-global-mute");
const muteTarget = document.getElementById("mute-target");
const btnMute = document.getElementById("btn-mute");
const btnUnmute = document.getElementById("btn-unmute");
const setNameInput = document.getElementById("set-name-input");
const btnSetName = document.getElementById("btn-set-name");
const adminAvatarOptions = document.querySelectorAll("#admin-avatar-options .avatar-option");

// Outros elementos
const usersList = document.getElementById("users-list");
const globalMuteWarning = document.getElementById("global-mute-warning");
const typingIndicator = document.getElementById("typing-msg");

// Estado
let selectedAvatar = null;
let selectedMasterAvatar = null;
let myName = null;
let myRole = null;
let myUserId = null;
let serverState = { globalMuted: false };
let historicoPendente = null;
let typingUsers = {};
let typingTimer;
let currentMessageId = null;
let currentMessageAuthorId = null;
let longPressTimer = null;
const mensagensCache = new Map();

// Menu de contexto
const contextMenu = document.getElementById('context-menu');
const contextReply = document.getElementById('context-reply');
const contextDelete = document.getElementById('context-delete');

// ===== Funções auxiliares =====
function mostrarAviso(texto) {
  const aviso = document.createElement("div");
  aviso.className = "toast-warning";
  aviso.textContent = texto;
  document.body.appendChild(aviso);
  setTimeout(() => aviso.remove(), 3000);
}

function atualizarBotaoPlayer() {
  const nome = playerNameInput.value.trim();
  const senha = playerPasswordInput ? playerPasswordInput.value.trim() : "";
  enterPlayerBtn.disabled = !(nome && selectedAvatar && senha);
}

function formatarData(data) {
  const dataMsg = new Date(data);
  const hoje = new Date();
  const diffDias = Math.floor((hoje.setHours(0,0,0,0) - new Date(dataMsg).setHours(0,0,0,0)) / 86400000);
  const horario = dataMsg.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (diffDias === 0) return `Hoje às ${horario}`;
  if (diffDias === 1) return `Ontem às ${horario}`;
  if (diffDias < 7) {
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return `${dias[dataMsg.getDay()]} às ${horario}`;
  }
  return `${dataMsg.toLocaleDateString()} às ${horario}`;
}

// ===== Controle de exibição dos painéis de mestre =====
function updateMasterUI() {
  const isMobile = window.innerWidth <= 600;
  const fab = document.getElementById('fab-master');
  const adminPanel = document.getElementById('admin-panel');
  const drawer = document.getElementById('master-drawer');

  if (myRole !== "master") {
    if (adminPanel) adminPanel.style.display = "none";
    if (fab) fab.style.display = "none";
    if (drawer) drawer.classList.remove("open");
    return;
  }

  if (isMobile) {
    adminPanel.style.display = "none";
    fab.style.display = "flex";
    // Drawer permanece fechado até clique no FAB
  } else {
    adminPanel.style.display = "block";
    fab.style.display = "none";
    drawer.classList.remove("open");
  }
}

function setupMasterActions() {
  // Seleciona todos os botões com classe master-action
  document.querySelectorAll('.master-action').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (!action) return;

      switch (action) {
        case 'clear':
          if (confirm("Apagar todas as mensagens?")) socket.emit("clearAll");
          break;
        case 'globalMute':
          socket.emit("setGlobalMute", { value: !serverState.globalMuted });
          break;
        case 'mute': {
          const select = document.querySelector('.master-select[data-target="mute"]');
          const targetUserId = select?.value;
          if (!targetUserId) return mostrarAviso("Selecione um jogador.");
          socket.emit("muteUser", { userId: targetUserId, mute: true });
          break;
        }
        case 'unmute': {
          const select = document.querySelector('.master-select[data-target="mute"]');
          const targetUserId = select?.value;
          if (!targetUserId) return mostrarAviso("Selecione um jogador.");
          socket.emit("muteUser", { userId: targetUserId, mute: false });
          break;
        }
        case 'setName': {
          const input = document.querySelector('.master-input[data-input="name"]');
          const novo = input?.value.trim();
          if (novo) {
            socket.emit("setMyName", novo);
            input.value = "";
          }
          break;
        }
      }
    });
  });

  // Avatares (tanto no painel quanto no drawer)
  document.querySelectorAll('#admin-avatar-grid .avatar-option, #drawer-avatar-grid .avatar-option').forEach(img => {
    img.addEventListener('click', () => {
      // Remove selected de todos os avatares de mestre
      document.querySelectorAll('#admin-avatar-grid .avatar-option, #drawer-avatar-grid .avatar-option').forEach(i => i.classList.remove('selected'));
      img.classList.add('selected');
      socket.emit("setMyAvatar", img.dataset.avatar);
      mostrarAviso("Avatar alterado!");
    });
  });
}

// Chamar setupMasterActions após o registro ou na inicialização
setupMasterActions();

// ===== FAB e Drawer =====
document.getElementById('fab-master')?.addEventListener('click', () => {
  document.getElementById('master-drawer').classList.add('open');
});
document.getElementById('close-drawer')?.addEventListener('click', () => {
  document.getElementById('master-drawer').classList.remove('open');
});

// ===== Event listeners de conexão =====
socket.on("connect", () => {
  const token = localStorage.getItem("chatAuth");
  if (token) socket.emit("resume", token);
});

socket.on("resumeFailed", () => {
  localStorage.removeItem("chatAuth");
  screenRegister.style.display = "";
  screenChat.style.display = "none";
  myName = myRole = myUserId = null;
  mostrarAviso("Sessão expirada. Faça login novamente.");
});

socket.on("disconnect", () => mostrarAviso("Conexão perdida. Tentando reconectar..."));
socket.on("reconnect", () => mostrarAviso("Reconectado com sucesso!"));
socket.on("reconnect_error", () => mostrarAviso("Erro ao reconectar. Verifique sua internet."));

// ===== Registro =====
avatarOptions.forEach(img => img.addEventListener("click", () => {
  avatarOptions.forEach(i => i.classList.remove("selected"));
  img.classList.add("selected");
  selectedAvatar = img.dataset.avatar;
  atualizarBotaoPlayer();
}));

masterAvatarOptions.forEach(img => img.addEventListener("click", () => {
  masterAvatarOptions.forEach(i => i.classList.remove("selected"));
  img.classList.add("selected");
  selectedMasterAvatar = img.dataset.avatar;
}));

adminAvatarOptions.forEach(img => img.addEventListener("click", () => {
  adminAvatarOptions.forEach(i => i.classList.remove("selected"));
  img.classList.add("selected");
  socket.emit("setMyAvatar", img.dataset.avatar);
  mostrarAviso("Avatar alterado!");
}));

document.querySelectorAll('input[name="role"]').forEach(r => {
  r.addEventListener("change", () => {
    if (r.value === "player") {
      playerForm.style.display = "";
      masterForm.style.display = "none";
    } else {
      playerForm.style.display = "none";
      masterForm.style.display = "";
    }
  });
});

playerNameInput.addEventListener("input", atualizarBotaoPlayer);
playerPasswordInput.addEventListener("input", atualizarBotaoPlayer);
atualizarBotaoPlayer();

enterPlayerBtn.addEventListener("click", () => {
  const nome = playerNameInput.value.trim();
  const senha = playerPasswordInput.value.trim();
  if (!nome || !selectedAvatar || !senha) return mostrarAviso("Escolha avatar, nome e senha.");
  socket.emit("register", { role: "player", nome, avatar: selectedAvatar, senha });
});

enterMasterBtn.addEventListener("click", () => {
  const senha = masterPassInput.value;
  if (!senha) return mostrarAviso("Senha necessária.");
  socket.emit("register", { role: "master", senha, avatar: selectedMasterAvatar });
});

socket.on("authToken", (token) => localStorage.setItem("chatAuth", token));

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

socket.on("registered", (dados) => {
  myName = dados.nome;
  myRole = dados.role || "player";
  myUserId = dados._id || null;
  screenRegister.style.display = "none";
  screenChat.style.display = "";
  updateMasterUI(); // ← aplica a lógica de exibição dos painéis
  if (historicoPendente) renderizarHistorico();
});

socket.on("registerError", (msg) => mostrarAviso(msg));

socket.on("kicked", (msg) => {
  mostrarAviso(msg || "Você foi desconectado por outro mestre.");
  setTimeout(() => window.location.reload(), 2000);
});

// ===== Mensagens =====
socket.on("mensagem", (m) => {
  m.avatar = m.avatar || "/avatars/default.png";
  mensagensCache.set(m._id, m);
  renderMsg(m);
});

socket.on("messageDeleted", (id) => {
  mensagensCache.delete(id);
  document.querySelector(`li[data-id="${id}"]`)?.remove();
});

socket.on("cleared", () => {
  chatList.innerHTML = "";
  mensagensCache.clear();
});

// ===== Estado do servidor =====
socket.on("serverState", (st) => {
  serverState = st || { globalMuted: false };
  btnGlobalMute.textContent = serverState.globalMuted ? "Desilenciar todos" : "Silenciar todos";
  if (globalMuteWarning) {
    globalMuteWarning.style.display = serverState.globalMuted ? "block" : "none";
  }
});

socket.on("mutedWarning", (msg) => mostrarAviso(msg));

// ===== Usuários online =====
socket.on("onlineUsers", (users) => {

   document.querySelectorAll('.master-select[data-target="mute"]').forEach(select => {
    select.innerHTML = '<option value="">Selecione um jogador</option>';
    users.forEach(u => {
      if (u.role !== "master") {
        const opt = document.createElement("option");
        opt.value = u.userId || "";
        opt.textContent = u.nome + (u.muted ? " (silenciado)" : "");
        select.appendChild(opt);
      }
    });
    });

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

// ===== Envio de mensagem =====
function enviarMensagem() {
  if (!myName) return mostrarAviso("Defina seu perfil primeiro.");
  let texto = msgInput.value.trim();
  if (!texto) return;
  if (texto.length > 500) return mostrarAviso("Mensagem muito longa (máx 500 chars).");

  const mensagemData = { texto };
  if (replyingTo) mensagemData.replyTo = replyingTo.id;

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

// Auto-resize e digitação
msgInput.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = (this.scrollHeight) + 'px';
  socket.emit("typing");
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => socket.emit("stopTyping"), 2000);
});

// ===== Indicador de digitação =====
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

// ===== Renderização de mensagem com suporte a reply =====
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

  const nome = document.createElement("div");
  nome.className = "msg-name";
  nome.textContent = m.nome;

  // Reply preview
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

// ===== Menu de contexto =====
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

cancelReply.addEventListener('click', cancelarReply);
function cancelarReply() {
  replyingTo = null;
  replyBar.style.display = 'none';
}

// ===== Ações do mestre (compartilhadas entre painéis) =====
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

// ===== FAB e Drawer (mobile) =====
if (fabMaster) {
  fabMaster.addEventListener('click', () => {
    masterDrawer.classList.add('open');
  });
  closeDrawer.addEventListener('click', () => {
    masterDrawer.classList.remove('open');
  });
}

// ===== Atualização de timestamps =====
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
    // forçar atualização de timestamps
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

// ===== Responsividade =====
window.addEventListener('resize', () => {
  updateMasterUI();
  // Garantir que o input não suma
  if (window.innerWidth <= 600) {
    document.getElementById('chat-input').style.display = 'flex';
  }
});

// Forçar ajuste inicial
document.addEventListener('DOMContentLoaded', () => {
  updateMasterUI();
  setTimeout(() => {
    if (window.innerWidth <= 600) {
      document.getElementById('chat-input').style.display = 'flex';
    }
  }, 500);
});