const mineflayer = require('mineflayer')
const util = require('util')

const ACCOUNTS = [
  { username: "bmw1", password: "bruno1" },
  { username: "bmw2", password: "bruno1" },
  { username: "bmw3", password: "bruno1" },
  { username: "bmw4", password: "bruno1" },
  { username: "bmw5", password: "bruno1" },
  { username: "bmw6", password: "bruno1" },
  { username: "bmw7", password: "bruno1" },
  { username: "bmw8", password: "bruno1" },
  { username: "bmw9", password: "bruno1" },
  { username: "bmw10", password: "bruno1" }
]

const CONFIG = {
  host: '45.89.30.237',
  port: 30000,
  version: '1.20.4',

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

function sleep(ms){
  return new Promise(r=>setTimeout(r,ms))
}

function randomDelay(min,max){
  return Math.floor(Math.random()*(max-min)+min)
}

function cleanMessage(t){
  return String(t||'').replace(/§[0-9A-FK-OR]/gi,'').trim()
}

async function sendWebhook(bot,message){
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

function createBot(account){

  let state = {
    loginSent:false,
    loginConfirmed:false,
    compassUsed:false,
    menuClicked:false,
    waitingPeixes:false,
    enteredFishingServer:false
  }

  let reconnecting=false

  const bot = mineflayer.createBot({
    host:CONFIG.host,
    port:CONFIG.port,
    username:account.username,
    version:CONFIG.version
  })

  function scheduleReconnect(delay = CONFIG.reconnectDelayMs){

    if(reconnecting) return

    reconnecting=true

    console.log(`[${bot.username}] Reconectando em ${delay/1000}s`)

    setTimeout(()=>{

      reconnecting=false

      createBot(account)

    },delay)

  }

  function sendLogin(){

    if(!bot || state.loginSent) return

    state.loginSent=true

    console.log(`[${bot.username}] Enviando login`)

    bot.chat(`/logar ${account.password}`)

  }

  async function openCompass(){

    await sleep(15000)

    bot.setQuickBarSlot(CONFIG.hotbarSlot)

    await sleep(4000)

    if(!state.compassUsed){

      state.compassUsed=true

      console.log(`[${bot.username}] Usando bússola`)

      bot.activateItem()

    }

  }

  async function startFishing(){

    const delay=randomDelay(CONFIG.pescaDelayMin,CONFIG.pescaDelayMax)

    console.log(`[${bot.username}] Esperando ${delay/1000}s para /pesca`)

    await sleep(delay)

    bot.chat("/pesca")

    console.log(`[${bot.username}] /pesca enviado`)

    console.log(`[${bot.username}] Esperando servidor estabilizar`)

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

      console.log(`[${bot.username}] Vara não encontrada`)
      return

    }

    console.log(`[${bot.username}] Vara encontrada no slot ${rodSlot}`)

    bot.setQuickBarSlot(rodSlot)

    console.log(`[${bot.username}] Esperando 10s para começar pesca`)

    await sleep(CONFIG.startFishingDelay)

    console.log(`[${bot.username}] Começando pesca`)

    bot.activateItem()

    startPeixesLoop()

  }

  function startPeixesLoop(){

    console.log(`[${bot.username}] Loop /peixes iniciado`)

    setInterval(()=>{

      console.log(`[${bot.username}] Executando /peixes`)

      state.waitingPeixes=true

      bot.chat("/peixes")

    },CONFIG.peixesInterval)

  }

  bot.on("spawn",()=>{

    console.log(`[${bot.username}] Spawn detectado`)

    if(!state.loginSent){

      setTimeout(sendLogin,CONFIG.stableLoginDelayMs)
      return

    }

    if(state.menuClicked && !state.enteredFishingServer){

      state.enteredFishingServer=true

      console.log(`[${bot.username}] Spawn pesca detectado`)

      startFishing()

    }

  })

  bot.on("messagestr",(msg)=>{

    const cleanMsg=cleanMessage(msg)

    console.log(`[${bot.username}]`,cleanMsg)

    if(state.waitingPeixes){

      state.waitingPeixes=false

      sendWebhook(bot,cleanMsg)

    }

    if(!state.loginConfirmed && cleanMsg.toLowerCase().includes("logou com sucesso")){

      state.loginConfirmed=true

      console.log(`[${bot.username}] Login confirmado`)

      openCompass()

    }

  })

  bot.on("windowOpen",async()=>{

    if(state.menuClicked) return

    await sleep(CONFIG.menuClickDelayMs)

    const target=bot.currentWindow.slots[CONFIG.menuClickSlot]

    if(!target) return

    await bot.clickWindow(CONFIG.menuClickSlot,0,0)

    state.menuClicked=true

    console.log(`[${bot.username}] Slot 13 clicado`)

  })

  bot.on("kicked",(reason)=>{

    console.log(`[${bot.username}] Kick`,util.inspect(reason))

    scheduleReconnect()

  })

  bot.on("end",()=>{

    console.log(`[${bot.username}] Conexão encerrada`)

    scheduleReconnect()

  })

  bot.on("error",(err)=>{

    console.log(`[${bot.username}] Erro`,err.message)

  })

}

async function startBots(){

  for(let i=0;i<ACCOUNTS.length;i++){

    const account=ACCOUNTS[i]

    console.log(`Iniciando bot ${account.username}`)

    createBot(account)

    if(i<ACCOUNTS.length-1){

      console.log("Aguardando 15s para próxima conta")

      await sleep(15000)

    }

  }

}

startBots()
