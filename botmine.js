const mineflayer = require('mineflayer')
const util = require('util')

let bot = null
let reconnecting = false

const CONFIG = {
  host: '45.89.30.237',
  port: 30000,
  username: 'joao2',
  version: '1.20.4',

  loginCommand: '/logar bruno1',

  stableLoginDelayMs: 12000,
  afterLoginWaitMs: 15000,
  hotbarTimeoutMs: 30000,
  reconnectDelayMs: 15000,

  hotbarSlot: 4,
  menuClickSlot: 13,
  menuClickDelayMs: 8000,
  afterMenuClickPauseMs: 8000,
  useItemDelayMs: 4000,

  afterPescaCommandDelay: 10000,

  peixesWebhook: "https://discord.com/api/webhooks/1479869845339373645/SsKiJKujjScjXAfOMF82c4MCMaAjkKGy3qkC2tDr6ipBpP90dtLxISA5ijHGAoJBQ5FJ"
}

let state = {}

function resetState() {
  state = {
    joinTime: 0,
    spawnCount: 0,
    loginSent: false,
    loginConfirmed: false,
    menuClicked: false,
    compassUsed: false,
    postLoginStarted: false,
    stableTimer: null,
    waitingPeixesMessage: false
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function cleanMessage(text) {
  return String(text || '').replace(/§[0-9A-FK-OR]/gi, '').trim()
}

async function sendWebhook(message) {

  try {

    await fetch(CONFIG.peixesWebhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "Fishing Bot",
        content: `🐟 **PEIXES**\nConta: **${bot.username}**\n${message}`
      })
    })

  } catch (err) {

    console.log("Erro webhook:", err.message)

  }
}

function scheduleReconnect(delay = CONFIG.reconnectDelayMs) {

  if (reconnecting) return

  reconnecting = true

  console.log(`Reconectando em ${delay / 1000}s...`)

  setTimeout(() => {
    reconnecting = false
    createBot()
  }, delay)
}

function looksLikeLoginPrompt(text) {

  const t = cleanMessage(text).toLowerCase()

  return (
    t.includes('/logar') ||
    t.includes('/login') ||
    t.includes('senha')
  )
}

function looksLikeLoginSuccess(text) {

  const t = cleanMessage(text).toLowerCase()

  return (
    t.includes('logou com sucesso') ||
    t.includes('login realizado')
  )
}

function scheduleLoginAttempt() {

  if (state.stableTimer) clearTimeout(state.stableTimer)

  state.stableTimer = setTimeout(() => {
    sendLogin()
  }, CONFIG.stableLoginDelayMs)
}

function sendLogin() {

  if (!bot || state.loginSent) return

  state.loginSent = true

  console.log("Enviando login...")

  bot.chat(CONFIG.loginCommand)
}

async function waitForHotbar() {

  const start = Date.now()

  while (Date.now() - start < CONFIG.hotbarTimeoutMs) {

    for (let i = 36; i <= 44; i++) {

      if (bot.inventory.slots[i]) return true

    }

    await sleep(2000)

  }

  return false
}

async function openCompassMenuSequence() {

  if (state.postLoginStarted) return

  state.postLoginStarted = true

  await sleep(CONFIG.afterLoginWaitMs)

  const ready = await waitForHotbar()

  if (!ready) return

  bot.setQuickBarSlot(CONFIG.hotbarSlot)

  await sleep(CONFIG.useItemDelayMs)

  if (!state.compassUsed) {

    state.compassUsed = true

    console.log("Usando bússola")

    bot.activateItem()

  }
}

async function checkPeixes() {

  await sleep(5000)

  console.log("Executando /peixes")

  state.waitingPeixesMessage = true

  bot.chat("/peixes")
}

async function startFishingSequence() {

  console.log("Iniciando pesca")

  await sleep(CONFIG.afterPescaCommandDelay)

  bot.chat("/pesca")

  console.log("Comando /pesca enviado")

  await sleep(10000)

  let rodSlot = null

  for (let i = 36; i <= 44; i++) {

    const item = bot.inventory.slots[i]

    if (item && item.name.includes("fishing_rod")) {

      rodSlot = i - 36

      break

    }
  }

  if (rodSlot === null) {

    console.log("Vara não encontrada")

    return
  }

  console.log("Vara encontrada no slot", rodSlot)

  bot.setQuickBarSlot(rodSlot)

  await sleep(2000)

  console.log("Começando pesca")

  bot.activateItem()

  checkPeixes()
}

function maybeHandleLoginSuccess(text) {

  if (!state.loginConfirmed && looksLikeLoginSuccess(text)) {

    state.loginConfirmed = true

    console.log("Login confirmado")

    openCompassMenuSequence()

  }
}

function createBot() {

  resetState()

  bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: CONFIG.version
  })

  bot.on("spawn", () => {

    console.log("Spawn detectado")

    if (!state.loginSent) scheduleLoginAttempt()

  })

  bot.on("messagestr", msg => {

    const cleanMsg = cleanMessage(msg)

    console.log("[CHAT]", cleanMsg)

    if (!state.loginSent && looksLikeLoginPrompt(cleanMsg)) {

      setTimeout(sendLogin, 3000)

    }

    if (state.waitingPeixesMessage) {

      state.waitingPeixesMessage = false

      console.log("Mensagem /peixes capturada:", cleanMsg)

      sendWebhook(cleanMsg)

    }

    maybeHandleLoginSuccess(cleanMsg)

  })

  bot.on("windowOpen", async window => {

    console.log("Menu aberto")

    if (state.menuClicked) return

    await sleep(CONFIG.menuClickDelayMs)

    const target = bot.currentWindow.slots[CONFIG.menuClickSlot]

    if (!target) return

    await bot.clickWindow(CONFIG.menuClickSlot, 0, 0)

    state.menuClicked = true

    console.log("Slot 13 clicado")

    await sleep(CONFIG.afterMenuClickPauseMs)

    startFishingSequence()

  })

  bot.on("kicked", reason => {

    console.log("Kick:", util.inspect(reason))

    scheduleReconnect()

  })

  bot.on("end", () => {

    console.log("Conexão encerrada")

    scheduleReconnect(10000)

  })

  bot.on("error", err => {

    console.log("Erro:", err.message)

  })
}

createBot()
