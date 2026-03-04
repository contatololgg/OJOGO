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

// Verifica variáveis de ambiente obrigatórias
if (!process.env.MONGO_URI || !process.env.ADMIN_SECRET) {
  console.error("ERRO: As variáveis MONGO_URI e ADMIN_SECRET são obrigatórias.");
  process.exit(1);
}

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
mensagemSchema.index({ data: -1 });
const Mensagem = mongoose.model("Mensagem", mensagemSchema);

const userSchema = new mongoose.Schema({
  nome: { type: String, unique: true },
  senha: { type: String, required: true },
  role: { type: String, default: "player" },
  avatar: String,
  muted: { type: Boolean, default: false }
});
const Usuario = mongoose.model("Usuario", userSchema);

const sessaoSchema = new mongoose.Schema({
  token: { type: String, unique: true },
  type: String, // 'player' | 'master'
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", default: null },
  name: String,
  avatar: String,
  createdAt: { type: Date, default: Date.now, expires: '7d' }
});
const Sessao = mongoose.model("Sessao", sessaoSchema);

// Estado
let onlineUsers = {};      // socketId -> { socketId, userId, nome, role, avatar, muted }
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
    avatar: userDoc.avatar || "/avatars/default.png",
    muted: !!userDoc.muted
  };
}

// Socket
io.on("connection", (socket) => {
  console.log("Conectou:", socket.id);

  // Não envia histórico aqui, será enviado após registro

  socket.on("resume", async (token) => {
    try {
      if (!token) {
        socket.emit("resumeFailed");
        return;
      }
      const sess = await Sessao.findOne({ token });
      if (!sess) {
        socket.emit("resumeFailed");
        return;
      }

      if (sess.type === "master") {
        const existingMaster = Object.values(onlineUsers).find(u => u.role === "master");
        if (existingMaster) {
          io.to(existingMaster.socketId).emit("kicked", "Um novo mestre conectou-se.");
          io.sockets.sockets.get(existingMaster.socketId)?.disconnect(true);
        }
      }

      if (sess.type === "player") {
        const usuario = await Usuario.findById(sess.userId);
        if (!usuario) {
          socket.emit("resumeFailed");
          return;
        }
        socket.usuario = usuario;
        socket.token = token;
        onlineUsers[socket.id] = {
          socketId: socket.id,
          userId: usuario._id.toString(),
          nome: usuario.nome,
          role: usuario.role,
          avatar: usuario.avatar || "/avatars/default.png",
          muted: usuario.muted
        };
        socket.emit("registered", publicUserFromDoc(usuario));
        socket.emit("authToken", token);
        // Envia histórico após registro
        const historico = await Mensagem.find().sort({ data: 1 }).limit(500);
        socket.emit("historico", historico);
        io.emit("onlineUsers", Object.values(onlineUsers));
        console.log("Sessão player restaurada:", usuario.nome);
      } else if (sess.type === "master") {
        socket.usuario = {
          _id: null,
          nome: sess.name || "Mestre",
          role: "master",
          avatar: sess.avatar || "/avatars/default.png",
          muted: false
        };
        socket.token = token;
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
        const historico = await Mensagem.find().sort({ data: 1 }).limit(500);
        socket.emit("historico", historico);
        io.emit("onlineUsers", Object.values(onlineUsers));
        console.log("Sessão master restaurada");
      }
    } catch (e) {
      console.error("Erro resume:", e);
      socket.emit("resumeFailed");
    }
  });

  socket.on("register", async (payload) => {
    try {
      if (!payload || !payload.role) return;

      if (payload.role === "player") {
        const nome = (payload.nome || "").trim();
        const avatar = payload.avatar || "/avatars/default.png";
        const senha = payload.senha || "";

        if (!nome || !senha) {
          socket.emit("registerError", "Nome e senha são obrigatórios.");
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
          const hash = await bcrypt.hash(senha, 10);
          usuario = await Usuario.create({ nome, senha: hash, avatar, role: "player" });
        } else {
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

        const token = makeToken();
        await Sessao.create({ token, type: "player", userId: usuario._id });

        socket.usuario = usuario;
        socket.token = token;
        onlineUsers[socket.id] = {
          socketId: socket.id,
          userId: usuario._id.toString(),
          nome: usuario.nome,
          role: usuario.role,
          avatar: usuario.avatar || "/avatars/default.png",
          muted: usuario.muted
        };

        io.emit("onlineUsers", Object.values(onlineUsers));
        socket.emit("registered", publicUserFromDoc(usuario));
        socket.emit("authToken", token);
        const historico = await Mensagem.find().sort({ data: 1 }).limit(500);
        socket.emit("historico", historico);
        console.log("Player logado:", usuario.nome);
        return;
      }

      if (payload.role === "master") {
        const senha = payload.senha || "";
        const avatar = payload.avatar || "/avatars/default.png";

        if (!process.env.ADMIN_SECRET || senha !== process.env.ADMIN_SECRET) {
          socket.emit("registerError", "Senha do mestre incorreta.");
          return;
        }

        const existingMaster = Object.values(onlineUsers).find(u => u.role === "master");
        if (existingMaster) {
          io.to(existingMaster.socketId).emit("kicked", "Um novo mestre conectou-se.");
          io.sockets.sockets.get(existingMaster.socketId)?.disconnect(true);
        }

        const token = makeToken();
        await Sessao.create({ token, type: "master", name: "Mestre", avatar });

        socket.usuario = {
          _id: null,
          nome: "Mestre",
          role: "master",
          avatar,
          muted: false
        };
        socket.token = token;

        onlineUsers[socket.id] = {
          socketId: socket.id,
          userId: null,
          nome: "Mestre",
          role: "master",
          avatar,
          muted: false
        };

        io.emit("onlineUsers", Object.values(onlineUsers));
        socket.emit("registered", socket.usuario);
        socket.emit("authToken", token);
        const historico = await Mensagem.find().sort({ data: 1 }).limit(500);
        socket.emit("historico", historico);
        console.log("Master autenticado");
        return;
      }

    } catch (err) {
      console.error("Erro register:", err);
      socket.emit("registerError", "Erro no registro.");
    }
  });

  socket.on("typing", () => {
    if (!socket.usuario) return;
    socket.broadcast.emit("userTyping", { nome: socket.usuario.nome });
  });

  socket.on("stopTyping", () => {
    if (!socket.usuario) return;
    socket.broadcast.emit("userStopTyping", { nome: socket.usuario.nome });
  });

  socket.on("mensagem", async (dados) => {
    try {
      if (!dados || !dados.texto) return;
      if (!socket.usuario) return;

      const texto = String(dados.texto).trim().slice(0, 500);
      if (texto.length === 0) return;

      const isMaster = socket.usuario.role === "master";

      if (globalMuted && !isMaster) {
        socket.emit("mutedWarning", "O chat está silenciado pelo mestre.");
        return;
      }

      if (!isMaster && onlineUsers[socket.id]?.muted) {
        socket.emit("mutedWarning", "Você está silenciado pelo mestre.");
        return;
      }

      const nova = new Mensagem({
        nome: socket.usuario.nome,
        texto,
        avatar: socket.usuario.avatar || "/avatars/default.png",
        role: socket.usuario.role || "player",
        autorId: socket.usuario._id || null,
        replyTo: dados.replyTo || null // novo campo
      });
      await nova.save();

      io.emit("mensagem", nova);
    } catch (e) {
      console.error("Erro ao salvar mensagem:", e);
    }
  });

  socket.on("deleteMessage", async (id) => {
    try {
      if (!socket.usuario) return;
      const mensagem = await Mensagem.findById(id);
      if (!mensagem) return;
      // Permite apagar se for mestre OU se for o autor da mensagem
      if (socket.usuario.role === "master" || (socket.usuario._id && mensagem.autorId && mensagem.autorId.toString() === socket.usuario._id.toString())) {
        await Mensagem.findByIdAndDelete(id);
        io.emit("messageDeleted", id);
      }
    } catch (e) { console.error("Erro deleteMessage:", e); }
  });

  socket.on("clearAll", async () => {
    try {
      if (!socket.usuario || socket.usuario.role !== "master") return;
      await Mensagem.deleteMany({});
      io.emit("cleared");
    } catch (e) { console.error("Erro clearAll:", e); }
  });

  socket.on("muteUser", async ({ userId, mute }) => {
    try {
      if (!socket.usuario || socket.usuario.role !== "master") return;
      if (!userId) return;

      await Usuario.findByIdAndUpdate(userId, { muted: !!mute });

      for (let sid in onlineUsers) {
        if (onlineUsers[sid].userId && onlineUsers[sid].userId.toString() === userId) {
          onlineUsers[sid].muted = !!mute;
          io.to(sid).emit("userMuted", { mute: !!mute });
        }
      }
      io.emit("onlineUsers", Object.values(onlineUsers));
    } catch (e) { console.error("Erro muteUser:", e); }
  });

  socket.on("setGlobalMute", ({ value }) => {
    if (!socket.usuario || socket.usuario.role !== "master") return;
    globalMuted = !!value;
    io.emit("serverState", { globalMuted });
  });

  socket.on("setMyName", async (novoNome) => {
    if (!socket.usuario || socket.usuario.role !== "master") return;
    const trimmed = String(novoNome || "").trim().slice(0, 20);
    if (!trimmed) return;
    socket.usuario.nome = trimmed;
    if (onlineUsers[socket.id]) {
      onlineUsers[socket.id].nome = socket.usuario.nome;
    }
    if (socket.token) {
      await Sessao.updateOne({ token: socket.token }, { name: socket.usuario.nome });
    }
    io.emit("onlineUsers", Object.values(onlineUsers));
    socket.emit("registered", socket.usuario);
  });

  socket.on("setMyAvatar", async (novoAvatar) => {
    if (!socket.usuario || socket.usuario.role !== "master") return;
    socket.usuario.avatar = novoAvatar || "/avatars/default.png";
    if (onlineUsers[socket.id]) {
      onlineUsers[socket.id].avatar = socket.usuario.avatar;
    }
    if (socket.token) {
      await Sessao.updateOne({ token: socket.token }, { avatar: socket.usuario.avatar });
    }
    io.emit("onlineUsers", Object.values(onlineUsers));
  });

  socket.on("disconnect", () => {
    delete onlineUsers[socket.id];
    io.emit("onlineUsers", Object.values(onlineUsers));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server rodando na porta", PORT));