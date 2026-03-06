"use strict";

require("dotenv").config();

const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);

const io = new Server(server,{
  cors:{origin:"*"}
});

// ===== CONFIG =====
const PORT = process.env.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const MONGO_URI = process.env.MONGO_URI;

if(!ADMIN_SECRET) throw new Error("ADMIN_SECRET não definido");
if(!MONGO_URI) throw new Error("MONGO_URI não definido");

// ===== MONGO =====
mongoose.connect(MONGO_URI);

const mensagemSchema = new mongoose.Schema({

  nome:String,
  texto:String,

  role:{
    type:String,
    enum:["player","master"],
    default:"player"
  },

  avatar:{
    type:String,
    default:"/avatars/default.png"
  },

  userId:String,

  replyTo:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"Mensagem",
    default:null
  },

  data:{
    type:Date,
    default:Date.now
  }

});

mensagemSchema.index({data:-1});

const Mensagem = mongoose.model("Mensagem",mensagemSchema);

// ===== ESTADO =====
let onlineUsers = new Map();

let serverState = {
  globalMuted:false
};

function broadcastUsers(){

  const users = [...onlineUsers.values()].map(u=>({
    nome:u.nome,
    avatar:u.avatar,
    role:u.role,
    muted:u.muted,
    userId:u.userId
  }));

  io.emit("onlineUsers",users);

}

// ===== SOCKET =====
io.on("connection",(socket)=>{

  let user = null;

  // ===== REGISTRO =====
  socket.on("register", async(dados)=>{

    const nome = (dados.nome || "").trim();
    if(!nome) return socket.emit("registerError","Nome inválido");

    const isMaster = dados.secret === ADMIN_SECRET;

    user = {
      socketId:socket.id,
      userId:crypto.randomUUID(),
      nome,
      role:isMaster ? "master" : "player",
      avatar:"/avatars/default.png",
      muted:false
    };

    onlineUsers.set(socket.id,user);

    socket.emit("registered",{
      nome:user.nome,
      role:user.role,
      _id:user.userId
    });

    const historico = await Mensagem
      .find()
      .sort({data:-1})
      .limit(200)
      .lean();

    socket.emit("historico",historico.reverse());

    socket.emit("serverState",serverState);

    broadcastUsers();

  });

  // ===== MENSAGEM =====
  socket.on("mensagem", async(dados)=>{

    if(!user) return;

    if(user.muted && user.role!=="master") return;

    if(serverState.globalMuted && user.role!=="master") return;

    const texto = (dados.texto || "").trim();
    if(!texto) return;

    const msg = new Mensagem({
      nome:user.nome,
      texto,
      role:user.role,
      avatar:user.avatar,
      userId:user.userId,
      replyTo:dados.replyTo || null
    });

    await msg.save();

    io.emit("mensagem",msg);

  });

  // ===== DELETE =====
  socket.on("deleteMessage", async(id)=>{

    if(!user || user.role!=="master") return;

    await Mensagem.deleteOne({_id:id});

    io.emit("messageDeleted",id);

  });

  // ===== CLEAR =====
  socket.on("clearAll", async()=>{

    if(!user || user.role!=="master") return;

    await Mensagem.deleteMany({});

    io.emit("cleared");

  });

  // ===== GLOBAL MUTE =====
  socket.on("setGlobalMute",(dados)=>{

    if(!user || user.role!=="master") return;

    serverState.globalMuted = !!dados.value;

    io.emit("serverState",serverState);

  });

  // ===== MUTE USER =====
  socket.on("muteUser",(dados)=>{

    if(!user || user.role!=="master") return;

    for(const u of onlineUsers.values()){

      if(u.userId === dados.userId){

        u.muted = !!dados.mute;

      }

    }

    broadcastUsers();

  });

  // ===== ALTERAR NOME =====
  socket.on("setMyName",(nome)=>{

    if(!user) return;

    const novo = (nome||"").trim();
    if(!novo) return;

    user.nome = novo;

    broadcastUsers();

  });

  // ===== ALTERAR AVATAR =====
  socket.on("setMyAvatar",(avatar)=>{

    if(!user) return;

    user.avatar = avatar;

    broadcastUsers();

  });

  // ===== DISCONNECT =====
  socket.on("disconnect",()=>{

    onlineUsers.delete(socket.id);

    broadcastUsers();

  });

});

// ===== STATIC =====
app.use(express.static("public"));

// ===== START =====
server.listen(PORT,()=>{

  console.log("Servidor rodando na porta",PORT);

});