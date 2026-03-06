// ===== ESTADO =====
let myName = null;
let myRole = null;
let myUserId = null;

let serverState = { globalMuted:false };
let historicoPendente = null;
let mensagensCache = new Map();

let typingUsers = {};
let typingTimer;

let replyingTo = null;
let currentMessageId = null;
let currentMessageAuthorId = null;

// ===== ELEMENTOS =====
const usersList = document.getElementById("users-list");
const globalMuteWarning = document.getElementById("global-mute-warning");
const typingIndicator = document.getElementById("typing-msg");

const contextMenu = document.getElementById("context-menu");
const contextReply = document.getElementById("context-reply");
const contextDelete = document.getElementById("context-delete");

// ===== UTIL =====
function aviso(texto){
  const div = document.createElement("div");
  div.className="toast-warning";
  div.textContent=texto;
  document.body.appendChild(div);
  setTimeout(()=>div.remove(),3000);
}

function formatarData(data){
  const d = new Date(data);

  const today = new Date();
  today.setHours(0,0,0,0);

  const msgDay = new Date(d);
  msgDay.setHours(0,0,0,0);

  const diff = Math.floor((today-msgDay)/86400000);

  const hora = d.toLocaleTimeString([],{
    hour:"2-digit",
    minute:"2-digit"
  });

  if(diff===0) return `Hoje às ${hora}`;
  if(diff===1) return `Ontem às ${hora}`;

  if(diff<7){
    const dias=["Dom","Seg","Ter","Qua","Qui","Sex","Sab"];
    return `${dias[d.getDay()]} às ${hora}`;
  }

  return `${d.toLocaleDateString()} às ${hora}`;
}

// ===== MASTER UI =====
function updateMasterUI(){

  const isMobile = window.innerWidth <= 600;

  const fab = document.getElementById("fab-master");
  const panel = document.getElementById("admin-panel");
  const drawer = document.getElementById("master-drawer");

  if(myRole!=="master"){
    panel.style.display="none";
    fab.style.display="none";
    drawer.classList.remove("open");
    return;
  }

  if(isMobile){
    panel.style.display="none";
    fab.style.display="flex";
  }else{
    panel.style.display="block";
    fab.style.display="none";
    drawer.classList.remove("open");
  }
}

// ===== MASTER ACTIONS =====
function setupMasterActions(){

  document.querySelectorAll(".master-action").forEach(btn=>{

    btn.addEventListener("click",()=>{

      const action = btn.dataset.action;

      switch(action){

        case "clear":
          if(confirm("Apagar mensagens?")){
            socket.emit("clearAll");
          }
        break;

        case "globalMute":
          socket.emit("setGlobalMute",{value:!serverState.globalMuted});
        break;

        case "mute":
        case "unmute":

          const select = document.querySelector('.master-select[data-target="mute"]');
          const userId = select?.value;

          if(!userId) return aviso("Selecione jogador");

          socket.emit("muteUser",{
            userId,
            mute: action==="mute"
          });

        break;

        case "setName":

          const input = document.querySelector('.master-input[data-input="name"]');
          const nome = input?.value.trim();

          if(nome){
            socket.emit("setMyName",nome);
            input.value="";
          }

        break;
      }

    });

  });

  // AVATAR MASTER
  document.querySelectorAll(
    "#admin-avatar-grid .avatar-option, #drawer-avatar-grid .avatar-option"
  ).forEach(img=>{

    img.addEventListener("click",()=>{

      document.querySelectorAll(
        "#admin-avatar-grid .avatar-option, #drawer-avatar-grid .avatar-option"
      ).forEach(i=>i.classList.remove("selected"));

      img.classList.add("selected");

      socket.emit("setMyAvatar",img.dataset.avatar);

      aviso("Avatar alterado");

    });

  });

}

setupMasterActions();

// ===== SOCKET =====
socket.on("connect",()=>{
  const token = localStorage.getItem("chatAuth");
  if(token) socket.emit("resume",token);
});

socket.on("authToken",token=>{
  localStorage.setItem("chatAuth",token);
});

socket.on("registered",dados=>{

  myName = dados.nome;
  myRole = dados.role || "player";
  myUserId = dados._id || null;

  screenRegister.style.display="none";
  screenChat.style.display="";

  updateMasterUI();

  if(historicoPendente) renderHistorico();

});

socket.on("registerError",aviso);

// ===== HISTÓRICO =====
socket.on("historico",msgs=>{

  historicoPendente = msgs;

  mensagensCache.clear();

  msgs.forEach(m=>{
    m.avatar = m.avatar || "/avatars/default.png";
    mensagensCache.set(m._id,m);
  });

  if(myUserId) renderHistorico();

});

function renderHistorico(){

  chatList.innerHTML="";

  historicoPendente.forEach(m=>{
    renderMsg(m);
  });

}

// ===== MENSAGENS =====
socket.on("mensagem",m=>{

  m.avatar = m.avatar || "/avatars/default.png";

  mensagensCache.set(m._id,m);

  renderMsg(m);

});

socket.on("messageDeleted",id=>{
  mensagensCache.delete(id);
  document.querySelector(`li[data-id="${id}"]`)?.remove();
});

socket.on("cleared",()=>{
  chatList.innerHTML="";
  mensagensCache.clear();
});

// ===== SERVER STATE =====
socket.on("serverState",st=>{

  serverState = st || {globalMuted:false};

  const btn = document.querySelector('[data-action="globalMute"]');

  if(btn){
    btn.textContent = serverState.globalMuted
      ? "Desilenciar todos"
      : "Silenciar todos";
  }

  if(globalMuteWarning){
    globalMuteWarning.style.display =
      serverState.globalMuted ? "block" : "none";
  }

});

// ===== ONLINE USERS =====
socket.on("onlineUsers",users=>{

  const selects = document.querySelectorAll('.master-select[data-target="mute"]');

  selects.forEach(select=>{

    select.innerHTML='<option value="">Selecione</option>';

    users.forEach(u=>{

      if(u.role==="master") return;

      const opt=document.createElement("option");

      opt.value=u.userId || "";
      opt.textContent = u.nome + (u.muted?" (mutado)":"");

      select.appendChild(opt);

    });

  });

  if(usersList){

    usersList.innerHTML="";

    users.forEach(u=>{

      const li=document.createElement("li");

      const img=document.createElement("img");
      img.src=u.avatar || "/avatars/default.png";
      img.className="user-avatar";

      const span=document.createElement("span");
      span.textContent=u.nome;

      li.appendChild(img);
      li.appendChild(span);

      if(u.role==="master") li.classList.add("user-master");

      if(u.muted){

        const badge=document.createElement("span");
        badge.className="badge-muted";
        badge.textContent="🔇";

        li.appendChild(badge);

      }

      usersList.appendChild(li);

    });

  }

});

// ===== ENVIO =====
function enviarMensagem(){

  if(!myName) return aviso("Defina perfil");

  const texto = msgInput.value.trim();

  if(!texto) return;

  if(texto.length>500){
    return aviso("Mensagem longa");
  }

  const dados = {texto};

  if(replyingTo) dados.replyTo = replyingTo.id;

  socket.emit("mensagem",dados);

  msgInput.value="";
  cancelarReply();

}

sendBtn.addEventListener("click",enviarMensagem);

msgInput.addEventListener("keydown",e=>{

  if(e.key==="Enter" && !e.shiftKey){

    e.preventDefault();
    enviarMensagem();

  }

});

// ===== RENDER =====
function renderMsg(m){

  const li=document.createElement("li");
  li.dataset.id=m._id;

  if(m.role==="master") li.classList.add("master");

  const img=document.createElement("img");
  img.src=m.avatar || "/avatars/default.png";
  img.className="msg-avatar";

  const box=document.createElement("div");
  box.className="msg-box";

  const nome=document.createElement("div");
  nome.className="msg-name";
  nome.textContent=m.nome;

  const texto=document.createElement("div");
  texto.className="msg-text";
  texto.textContent=m.texto;

  const hora=document.createElement("div");
  hora.className="msg-time";
  hora.textContent=formatarData(m.data);

  box.appendChild(nome);
  box.appendChild(texto);
  box.appendChild(hora);

  li.appendChild(img);
  li.appendChild(box);

  chatList.appendChild(li);

  chatList.scrollTop = chatList.scrollHeight;

}

// ===== REPLY =====
cancelReply.addEventListener("click",cancelarReply);

function cancelarReply(){

  replyingTo=null;

  replyBar.style.display="none";

}

// ===== RESPONSIVO =====
window.addEventListener("resize",updateMasterUI);

document.addEventListener("DOMContentLoaded",updateMasterUI);

// ===== UPDATE TIMESTAMP =====
setInterval(()=>{

  document.querySelectorAll("#chat li").forEach(li=>{

    const id = li.dataset.id;
    const msg = mensagensCache.get(id);

    if(!msg) return;

    const el = li.querySelector(".msg-time");

    if(el) el.textContent = formatarData(msg.data);

  });

},60000);