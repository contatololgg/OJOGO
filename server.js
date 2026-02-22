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
let userSessions = {};     // token -> userId
let globalMuted = false;

// Helpers
function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

async function getUserPublic(user) {
  return {
    _id: user._id,
    nome: user.nome,
    role: user.role,
    avatar: user.avatar,
    muted: !!user.muted
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
      // se cliente enviar resume, tratamos lá
    } catch (e) {
      console.error("Erro ao buscar histórico:", e);
    }
  })();

  // tentar restaurar sessão via token
  socket.on("resume", async (token) => {
    try {
      if (!token) return;
      const userId = userSessions[token];
      if (!userId) return;
      const usuario = await Usuario.findById(userId);
      if (!usuario) return;

      socket.usuario = usuario;
      onlineUsers[socket.id] = {
        socketId: socket.id,
        userId: usuario._id,
        nome: usuario.nome,
        role: usuario.role,
        avatar: usuario.avatar,
        muted: usuario.muted
      };

      socket.emit("registered", await getUserPublic(usuario));
      socket.emit("authToken", token); // reenvia token (opcional)
      io.emit("onlineUsers", Object.values(onlineUsers));
      console.log("Sessão restaurada:", usuario.nome);
    } catch (e) {
      console.error("Erro resume:", e);
    }
  });

  // registro / login
  // payload { role, nome, avatar, senha } for player
  // payload { role: 'master', nome, senha } for master (senha deve ser ADMIN_SECRET)
  socket.on("register", async (payload) => {
    try {
      if (!payload || !payload.role) return;

      /* ================= PLAYER ================= */
      if (payload.role === "player") {
        const nome = (payload.nome || "").trim();
        const avatar = payload.avatar || null;
        const senha = payload.senha || "";

        if (!nome || !avatar || !senha) {
          socket.emit("registerError", "Nome, avatar e senha são obrigatórios.");
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

        socket.usuario = usuario;

        onlineUsers[socket.id] = {
          socketId: socket.id,
          userId: usuario._id,
          nome: usuario.nome,
          role: usuario.role,
          avatar: usuario.avatar,
          muted: usuario.muted
        };

        io.emit("onlineUsers", Object.values(onlineUsers));
        socket.emit("registered", {
          nome: usuario.nome,
          role: usuario.role,
          avatar: usuario.avatar
        });

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

        socket.usuario = {
          _id: null,
          nome: "Mestre",
          role: "master",
          avatar: avatar,
          muted: false
        };

        onlineUsers[socket.id] = {
          socketId: socket.id,
          userId: null,
          nome: "Mestre",
          role: "master",
          avatar: avatar,
          muted: false
        };

        io.emit("onlineUsers", Object.values(onlineUsers));
        socket.emit("registered", socket.usuario);

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
      if (!dados || !dados.nome || !dados.texto) return;
      if (!socket.usuario) return;

      const isMaster = socket.usuario.role === "master";

      if (globalMuted && !isMaster) {
        socket.emit("mutedWarning", "O chat está silenciado pelo mestre.");
        return;
      }

      // verifica status atualizado no DB (para muted)
      const usuarioAtual = await Usuario.findById(socket.usuario._id);
      if (usuarioAtual && usuarioAtual.muted && !isMaster) {
        socket.emit("mutedWarning", "Você está silenciado pelo mestre.");
        return;
      }

      const nova = new Mensagem({
        nome: socket.usuario.nome,
        texto: dados.texto,
        avatar: socket.usuario.avatar || null,
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
        if (onlineUsers[sid].userId.toString() === userId) {
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

    socket.usuario.nome = novoNome;

    if (onlineUsers[socket.id]) {
      onlineUsers[socket.id].nome = novoNome;
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