// server.js
// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// Conexão Mongo
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Mongo conectado"))
  .catch(err => console.error("Erro Mongo:", err));

// Schemas / Models
const mensagemSchema = new mongoose.Schema({
  nome: String,
  texto: String,
  avatar: String,
  role: String,
  autorId: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", default: null },
  data: { type: Date, default: Date.now }
});
const Mensagem = mongoose.model("Mensagem", mensagemSchema);

const userSchema = new mongoose.Schema({
  nome: { type: String, unique: true },
  senha: { type: String, required: true },
  role: { type: String, default: "player" }, // player ou master
  avatar: String,
  muted: { type: Boolean, default: false }
});
const Usuario = mongoose.model("Usuario", userSchema);

// Estado
let onlineUsers = {};      // socketId -> { socketId, userId, nome, role, avatar, muted }
let userSessions = {};     // token -> { type: 'player'|'master', userId?, name?, avatar? }
let globalMuted = false;

// Helpers
function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

function publicUserFromDoc(userDoc) {
  if (!userDoc) return null;
  return {
    _id: userDoc._id.toString(),
    nome: userDoc.nome,
    role: userDoc.role,
    avatar: userDoc.avatar || null,
    muted: !!userDoc.muted
  };
}

// Socket
io.on("connection", (socket) => {
  console.log("Conectou:", socket.id);

  // envia histórico e estado ao conectar
  (async () => {
    try {
      const historico = await Mensagem.find().sort({ data: 1 }).limit(500);
      socket.emit("historico", historico);
      socket.emit("serverState", { globalMuted });
    } catch (e) {
      console.error("Erro ao buscar histórico:", e);
    }
  })();

  // tentar restaurar sessão via token
  socket.on("resume", async (token) => {
    try {
      if (!token) return;
      const sess = userSessions[token];
      if (!sess) return;

      if (sess.type === "player") {
        const usuario = await Usuario.findById(sess.userId);
        if (!usuario) return;
        socket.usuario = usuario;
        onlineUsers[socket.id] = {
          socketId: socket.id,
          userId: usuario._id.toString(),
          nome: usuario.nome,
          role: usuario.role,
          avatar: usuario.avatar,
          muted: usuario.muted
        };
        socket.emit("registered", publicUserFromDoc(usuario));
        socket.emit("authToken", token);
        io.emit("onlineUsers", Object.values(onlineUsers));
        console.log("Sessão player restaurada:", usuario.nome);
      } else if (sess.type === "master") {
        socket.usuario = {
          _id: null,
          nome: sess.name || "Mestre",
          role: "master",
          avatar: sess.avatar || null,
          muted: false
        };
        onlineUsers[socket.id] = {
          socketId: socket.id,
          userId: null,
          nome: socket.usuario.nome,
          role: "master",
          avatar: socket.usuario.avatar,
          muted: false
        };
        socket.emit("registered", socket.usuario);
        socket.emit("authToken", token);
        io.emit("onlineUsers", Object.values(onlineUsers));
        console.log("Sessão master restaurada");
      }
    } catch (e) {
      console.error("Erro resume:", e);
    }
  });

  // registro / login
  socket.on("register", async (payload) => {
    try {
      if (!payload || !payload.role) return;

      /* ================= PLAYER ================= */
      if (payload.role === "player") {
        const nome = (payload.nome || "").trim();
        const avatar = payload.avatar || null;
        const senha = payload.senha || "";

        // validações
        if (!nome || !avatar || !senha) {
          socket.emit("registerError", "Nome, avatar e senha são obrigatórios.");
          return;
        }
        if (nome.length > 20) {
          socket.emit("registerError", "Nome muito longo (máx 20 caracteres).");
          return;
        }
        if (senha.length < 4) {
          socket.emit("registerError", "Senha muito curta (mín 4 caracteres).");
          return;
        }

        let usuario = await Usuario.findOne({ nome });

        if (!usuario) {
          // cria novo jogador
          const hash = await bcrypt.hash(senha, 10);
          usuario = await Usuario.create({
            nome,
            senha: hash,
            avatar,
            role: "player"
          });
        } else {
          // se já existe mas não é player → bloqueia
          if (usuario.role !== "player") {
            socket.emit("registerError", "Nome indisponível.");
            return;
          }
          const senhaValida = await bcrypt.compare(senha, usuario.senha);
          if (!senhaValida) {
            socket.emit("registerError", "Senha incorreta.");
            return;
          }
        }

        // cria token de sessão e armazena
        const token = makeToken();
        userSessions[token] = { type: "player", userId: usuario._id.toString() };

        socket.usuario = usuario;
        onlineUsers[socket.id] = {
          socketId: socket.id,
          userId: usuario._id.toString(),
          nome: usuario.nome,
          role: usuario.role,
          avatar: usuario.avatar,
          muted: usuario.muted
        };

        io.emit("onlineUsers", Object.values(onlineUsers));
        socket.emit("registered", publicUserFromDoc(usuario));
        socket.emit("authToken", token);
        console.log("Player logado:", usuario.nome);
        return;
      }

      /* ================= MASTER ================= */
      if (payload.role === "master") {
        const senha = payload.senha || "";
        const avatar = payload.avatar || null;

        if (!process.env.ADMIN_SECRET || senha !== process.env.ADMIN_SECRET) {
          socket.emit("registerError", "Senha do mestre incorreta.");
          return;
        }

        // NÃO salva no banco; cria sessão na memória
        const token = makeToken();
        userSessions[token] = { type: "master", name: "Mestre", avatar: avatar || null };

        socket.usuario = {
          _id: null,
          nome: "Mestre",
          role: "master",
          avatar: avatar || null,
          muted: false
        };

        onlineUsers[socket.id] = {
          socketId: socket.id,
          userId: null,
          nome: "Mestre",
          role: "master",
          avatar: avatar || null,
          muted: false
        };

        io.emit("onlineUsers", Object.values(onlineUsers));
        socket.emit("registered", socket.usuario);
        socket.emit("authToken", token);
        console.log("Master autenticado:", socket.usuario.nome);
        return;
      }

    } catch (err) {
      console.error("Erro register:", err);
      socket.emit("registerError", "Erro no registro.");
    }
  });

  // nova mensagem
  socket.on("mensagem", async (dados) => {
    try {
      if (!dados || !dados.texto) return;
      if (!socket.usuario) return;

      // limita tamanho da mensagem
      const texto = String(dados.texto).slice(0, 500);

      const isMaster = socket.usuario.role === "master";

      if (globalMuted && !isMaster) {
        socket.emit("mutedWarning", "O chat está silenciado pelo mestre.");
        return;
      }

      // verifica status atualizado no DB (para muted) - apenas para players
      if (socket.usuario._id) {
        const usuarioAtual = await Usuario.findById(socket.usuario._id);
        if (usuarioAtual && usuarioAtual.muted && !isMaster) {
          socket.emit("mutedWarning", "Você está silenciado pelo mestre.");
          return;
        }
      }

      const nova = new Mensagem({
        nome: socket.usuario.nome,
        texto,
        avatar: socket.usuario.avatar || null,
        role: socket.usuario.role || "player",
        autorId: socket.usuario._id || null
      });
      await nova.save();

      io.emit("mensagem", nova);
    } catch (e) {
      console.error("Erro ao salvar mensagem:", e);
    }
  });

  // apagar mensagem (master)
  socket.on("deleteMessage", async (id) => {
    try {
      if (!socket.usuario || socket.usuario.role !== "master") return;
      await Mensagem.findByIdAndDelete(id);
      io.emit("messageDeleted", id);
    } catch (e) {
      console.error("Erro deleteMessage:", e);
    }
  });

  // limpar tudo (master)
  socket.on("clearAll", async () => {
    try {
      if (!socket.usuario || socket.usuario.role !== "master") return;
      await Mensagem.deleteMany({});
      io.emit("cleared");
    } catch (e) {
      console.error("Erro clearAll:", e);
    }
  });

  // silenciar / dessilenciar por userId (master)
  socket.on("muteUser", async ({ userId, mute }) => {
    try {
      if (!socket.usuario || socket.usuario.role !== "master") return;
      if (!userId) return;

      await Usuario.findByIdAndUpdate(userId, { muted: !!mute });

      // atualizar onlineUsers e notificar o socket do user
      for (let sid in onlineUsers) {
        if (onlineUsers[sid].userId && onlineUsers[sid].userId.toString() === userId) {
          onlineUsers[sid].muted = !!mute;
          io.to(sid).emit("userMuted", { mute: !!mute });
        }
      }

      io.emit("onlineUsers", Object.values(onlineUsers));
    } catch (e) {
      console.error("Erro muteUser:", e);
    }
  });

  // global mute toggle (master)
  socket.on("setGlobalMute", ({ value }) => {
    if (!socket.usuario || socket.usuario.role !== "master") return;
    globalMuted = !!value;
    io.emit("serverState", { globalMuted });
  });

  // troca de nome do master
  socket.on("setMyName", (novoNome) => {
    if (!socket.usuario || socket.usuario.role !== "master") return;
    const trimmed = String(novoNome || "").trim().slice(0, 20);
    socket.usuario.nome = trimmed || "Mestre";
    if (onlineUsers[socket.id]) {
      onlineUsers[socket.id].nome = socket.usuario.nome;
    }
    // atualizar sessão master (se tiver token)
    for (const t in userSessions) {
      if (userSessions[t].type === "master") {
        // find matching by socket: best-effort: if onlineUsers[socket.id].userId===null and names match
        // We'll update any master session names to the new name to keep resume consistent for the active master
        userSessions[t].name = socket.usuario.nome;
      }
    }
    io.emit("onlineUsers", Object.values(onlineUsers));
    socket.emit("registered", socket.usuario);
  });

  // trocar avatar do master
  socket.on("setMyAvatar", (novoAvatar) => {
    if (!socket.usuario || socket.usuario.role !== "master") return;

    socket.usuario.avatar = novoAvatar;

    if (onlineUsers[socket.id]) {
      onlineUsers[socket.id].avatar = novoAvatar;
    }

    // atualizar sessão master avatar
    for (const t in userSessions) {
      if (userSessions[t].type === "master") {
        userSessions[t].avatar = novoAvatar;
      }
    }

    io.emit("onlineUsers", Object.values(onlineUsers));
  });

  // desconexão
  socket.on("disconnect", () => {
    delete onlineUsers[socket.id];
    io.emit("onlineUsers", Object.values(onlineUsers));
  });
});

// start
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server rodando na porta", PORT));