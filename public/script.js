// script.js (substitua seu arquivo atual por este)
const socket = io();

const screenRegister = document.getElementById("screen-register");
const playerForm = document.getElementById("player-form");
const masterForm = document.getElementById("master-form");
const avatarOptions = document.querySelectorAll(".avatar-option");
const playerNameInput = document.getElementById("player-name");
const playerPasswordInput = document.getElementById("player-password"); // novo input no HTML
const masterNameInput = document.getElementById("master-name");
const masterPassInput = document.getElementById("master-pass");
const enterPlayerBtn = document.getElementById("enter-player");
const enterMasterBtn = document.getElementById("enter-master");

const screenChat = document.getElementById("screen-chat");
const chatList = document.getElementById("chat");
const msgInput = document.getElementById("msg");
const sendBtn = document.getElementById("send");

const adminPanel = document.getElementById("admin-panel");
const btnClear = document.getElementById("btn-clear");
const btnGlobalMute = document.getElementById("btn-global-mute");
// btnMasterOnly removed in HTML
const muteTarget = document.getElementById("mute-target"); // now a <select>
const btnMute = document.getElementById("btn-mute");
const btnUnmute = document.getElementById("btn-unmute");
const setNameInput = document.getElementById("set-name-input");
const btnSetName = document.getElementById("btn-set-name");

const usersList = document.getElementById("users-list");

let selectedAvatar = null;
let myName = null;
let myRole = "player";
let minhaAvatar = null;
let serverState = { globalMuted: false };
let selectedMasterAvatar = null;

document.querySelectorAll("#master-avatar-options .avatar-option")
.forEach(img => {
  img.addEventListener("click", () => {
    document.querySelectorAll("#master-avatar-options .avatar-option")
      .forEach(i => i.classList.remove("selected"));

    img.classList.add("selected");
    selectedMasterAvatar = img.dataset.avatar;
  });
});

// helpers
function mostrarAviso(texto) {
  const aviso = document.createElement("div");
  aviso.className = "toast-warning";
  aviso.textContent = texto;
  document.body.appendChild(aviso);
  setTimeout(() => aviso.remove(), 3000);
}

// tentar reautenticar se tiver token salvo
const savedAuth = localStorage.getItem("chatAuth");
if (savedAuth) {
  socket.emit("resume", savedAuth);
}

// avatar selection
avatarOptions.forEach(img => img.addEventListener("click", () => {
  avatarOptions.forEach(i => i.classList.remove("selected"));
  img.classList.add("selected");
  selectedAvatar = img.dataset.avatar;
  atualizarBotaoPlayer();
}));

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

// bloquear botão entrar até escolher avatar+nome+senha
enterPlayerBtn.disabled = true;
function atualizarBotaoPlayer() {
  const nome = playerNameInput.value.trim();
  const senha = playerPasswordInput ? playerPasswordInput.value.trim() : "";
  enterPlayerBtn.disabled = !(nome && selectedAvatar && senha);
}
playerNameInput.addEventListener("input", atualizarBotaoPlayer);
if (playerPasswordInput) playerPasswordInput.addEventListener("input", atualizarBotaoPlayer);

// entrar como player (cria conta ou faz login)
enterPlayerBtn.addEventListener("click", () => {
  const nome = playerNameInput.value.trim();
  const senha = playerPasswordInput.value.trim();
  if (!nome || !selectedAvatar || !senha) return alert("Escolha avatar, nome e senha.");
  socket.emit("register", { role: "player", nome, avatar: selectedAvatar, senha });
});

// entrar como master
enterMasterBtn.addEventListener("click", () => {
  const senha = masterPassInput.value;
  if (!senha) return alert("Senha necessária.");
  const nomeDesejado = masterNameInput.value.trim() || "Mestre";
  socket.emit("register", { role: "master", senha, nome: nomeDesejado });
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
  minhaAvatar = dados.avatar || null;

  // troca de telas
  if (screenRegister) screenRegister.style.display = "none";
  if (screenChat) screenChat.style.display = "";

  // mostra painel admin se master
  if (myRole === "master") {
    adminPanel.style.display = "";
  } else {
    adminPanel.style.display = "none";
  }
});

// erros de registro
socket.on("registerError", (msg) => {
  alert("Erro registro: " + msg);
});

// histórico
socket.on("historico", (msgs) => {
  chatList.innerHTML = "";
  msgs.forEach(renderMsg);
});

// nova mensagem
socket.on("mensagem", (m) => {
  renderMsg(m);
});

// apagado / limpo
socket.on("messageDeleted", (id) => {
  const li = document.querySelector(`li[data-id="${id}"]`);
  if (li) li.remove();
});
socket.on("cleared", () => { chatList.innerHTML = ""; });

// estado do servidor
socket.on("serverState", (st) => {
  serverState = st || { globalMuted: false };
  btnGlobalMute.textContent = serverState.globalMuted ? "Desilenciar todos" : "Silenciar todos";
});

// aviso de mute
socket.on("mutedWarning", (msg) => {
  mostrarAviso(msg || "Você está silenciado.");
});

// online users update (dropdown + sidebar)
socket.on("onlineUsers", (users) => {
  // dropdown (mute target)
  if (muteTarget) {
    muteTarget.innerHTML = "";
    users.forEach(u => {
      if (u.role !== "master") {
        const opt = document.createElement("option");
        opt.value = u.userId; // use userId
        opt.textContent = u.nome + (u.muted ? " (silenciado)" : "");
        muteTarget.appendChild(opt);
      }
    });
  }

  // sidebar list
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

// enviar mensagem
sendBtn.addEventListener("click", () => {
  if (!myName) return alert("Defina seu perfil primeiro.");
  const texto = msgInput.value.trim();
  if (!texto) return;
  if (serverState.masterOnly && myRole !== "master") return alert("Somente o Mestre pode mandar mensagens agora.");
  socket.emit("mensagem", { nome: myName, texto });
  msgInput.value = "";
});

// render mensagens
function renderMsg(m) {
  const li = document.createElement("li");
  li.dataset.id = m._id;
  const hora = new Date(m.data).toLocaleTimeString();
  li.textContent = `[${hora}] ${m.nome}: ${m.texto}`;

  if (m.avatar) {
    const img = document.createElement("img");
    img.src = m.avatar;
    img.className = "msg-avatar";
    li.prepend(img);
  }

  if (myRole === "master") {
    const btnDel = document.createElement("button");
    btnDel.textContent = "Apagar";
    btnDel.addEventListener("click", () => {
      socket.emit("deleteMessage", m._id);
    });
    li.appendChild(btnDel);
  }

  if (m.muted) li.classList.add("msg-muted");

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
  if (!targetUserId) return;
  socket.emit("muteUser", { userId: targetUserId, mute: true });
});

btnUnmute.addEventListener("click", () => {
  const targetUserId = muteTarget.value;
  if (!targetUserId) return;
  socket.emit("muteUser", { userId: targetUserId, mute: false });
});

btnSetName.addEventListener("click", () => {
  const novo = setNameInput.value.trim();
  if (!novo) return;
  socket.emit("setMyName", novo);
});