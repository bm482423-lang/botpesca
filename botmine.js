const mineflayer = require('mineflayer')
const util = require('util')

let bot = null
let reconnecting = false

const CONFIG = {
  host: '45.89.30.237',
  port: 30000,
  username: 'JATAPODENDO',
  version: '1.20.4',

  loginCommand: '/logar clan001',

  stableLoginDelayMs: 12000,
  reconnectDelayMs: 15000,

  hotbarSlot: 4,
  menuClickSlot: 13,
  menuClickDelayMs: 8000,

  pescaDelayMin: 30000,
  pescaDelayMax: 35000,

  rodDetectDelay: 20000,
  startFishingDelay: 10000,

  peixesInterval: 5 * 60 * 1000,

  peixesWebhook: "https://discord.com/api/webhooks/1479869845339373645/SsKiJKujjScjXAfOMF82c4MCMaAjkKGy3qkC2tDr6ipBpP90dtLxISA5ijHGAoJBQ5FJ"
}

let state = {}

function resetState(){
  state = {
    loginSent:false,
    loginConfirmed:false,
    compassUsed:false,
    menuClicked:false,
    waitingPeixes:false,
    enteredFishingServer:false
  }
}

function sleep(ms){
  return new Promise(r=>setTimeout(r,ms))
}

function randomDelay(min,max){
  return Math.floor(Math.random()*(max-min)+min)
}

function cleanMessage(t){
  return String(t||'').replace(/§[0-9A-FK-OR]/gi,'').trim()
}

async function sendWebhook(message){
  try{
    await fetch(CONFIG.peixesWebhook,{
      method:"POST",
      headers:{ "Content-Type":"application/json"},
      body:JSON.stringify({
        username:"Fishing Bot",
        content:`🐟 **PEIXES**\nConta: **${bot.username}**\n${message}`
      })
    })
  }catch(err){
    console.log("Erro webhook:",err.message)
  }
}

function scheduleReconnect(delay = CONFIG.reconnectDelayMs){
  if(reconnecting) return
  reconnecting=true
  console.log(`Reconectando em ${delay/1000}s...`)
  setTimeout(()=>{
    reconnecting=false
    createBot()
  },delay)
}

function sendLogin(){
  if(!bot || state.loginSent) return
  state.loginSent=true
  console.log("Enviando login...")
  bot.chat(CONFIG.loginCommand)
}

async function openCompass(){

  await sleep(15000)

  bot.setQuickBarSlot(CONFIG.hotbarSlot)

  await sleep(4000)

  if(!state.compassUsed){
    state.compassUsed=true
    console.log("Usando bússola")
    bot.activateItem()
  }
}

async function startFishing(){

  const delay=randomDelay(CONFIG.pescaDelayMin,CONFIG.pescaDelayMax)

  console.log(`Esperando ${delay/1000}s para executar /pesca`)

  await sleep(delay)

  bot.chat("/pesca")

  console.log("/pesca enviado")

  console.log("Esperando servidor estabilizar...")

  await sleep(CONFIG.rodDetectDelay)

  let rodSlot=null

  for(let i=36;i<=44;i++){

    const item=bot.inventory.slots[i]

    if(item && item.name.includes("fishing_rod")){
      rodSlot=i-36
      break
    }

  }

  if(rodSlot===null){
    console.log("Vara não encontrada")
    return
  }

  console.log("Vara encontrada no slot",rodSlot)

  bot.setQuickBarSlot(rodSlot)

  console.log("Aguardando 10s antes de começar pesca")

  await sleep(CONFIG.startFishingDelay)

  console.log("Começando pesca")

  bot.activateItem()

  startPeixesLoop()
}

function startPeixesLoop(){

  console.log("Iniciando loop de /peixes")

  setInterval(()=>{

    console.log("Executando /peixes")

    state.waitingPeixes=true

    bot.chat("/peixes")

  },CONFIG.peixesInterval)
}

function maybeHandleLoginSuccess(text){

  text=cleanMessage(text).toLowerCase()

  if(!state.loginConfirmed && text.includes("logou com sucesso")){

    state.loginConfirmed=true

    console.log("Login confirmado")

    openCompass()

  }
}

function createBot(){

  resetState()

  bot=mineflayer.createBot({
    host:CONFIG.host,
    port:CONFIG.port,
    username:CONFIG.username,
    version:CONFIG.version
  })

  bot.on("spawn",()=>{

    console.log("Spawn detectado")

    if(!state.loginSent){
      setTimeout(sendLogin,CONFIG.stableLoginDelayMs)
      return
    }

    if(state.menuClicked && !state.enteredFishingServer){

      state.enteredFishingServer=true

      console.log("Spawn na pesca detectado")

      startFishing()

    }

  })

  bot.on("messagestr",(msg)=>{

    const cleanMsg=cleanMessage(msg)

    console.log("[CHAT]",cleanMsg)

    if(state.waitingPeixes){

      state.waitingPeixes=false

      console.log("Resposta /peixes capturada")

      sendWebhook(cleanMsg)

    }

    maybeHandleLoginSuccess(cleanMsg)

  })

  bot.on("windowOpen",async()=>{

    console.log("Menu aberto")

    if(state.menuClicked) return

    await sleep(CONFIG.menuClickDelayMs)

    const target=bot.currentWindow.slots[CONFIG.menuClickSlot]

    if(!target) return

    await bot.clickWindow(CONFIG.menuClickSlot,0,0)

    state.menuClicked=true

    console.log("Slot 13 clicado")

  })

  bot.on("kicked",(reason)=>{
    console.log("Kick:",util.inspect(reason))
    scheduleReconnect()
  })

  bot.on("end",()=>{
    console.log("Conexão encerrada")
    scheduleReconnect(10000)
  })

  bot.on("error",(err)=>{
    console.log("Erro:",err.message)
  })
}

createBot()

