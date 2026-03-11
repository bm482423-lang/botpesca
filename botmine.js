const mineflayer = require('mineflayer')
const util = require('util')

// Se precisares:
// npm i mineflayer

let bot = null
let reconnecting = false

const CONFIG = {
  host: '45.89.30.237',
  port: 30000,
  username: 'mara',
  version: '1.20.4',

  loginCommand: '/logar rbrava2020',

  stableLoginDelayMs: 12000,
  afterLoginWaitMs: 15000,
  hotbarTimeoutMs: 30000,
  reconnectDelayMs: 15000,

  hotbarSlot: 4,
  menuClickSlot: 13,
  menuClickDelayMs: 8000,
  afterMenuClickPauseMs: 5000,
  useItemDelayMs: 4000,

  pickaxeHotbarSlot: 0,
  afterSlot13SequenceDelayMs: 4000,
  afterPickaxeSelectDelayMs: 3000,
  afterMinaCommandDelayMs: 8000,

  minaCommand: '/mina',
  minaResetCommand: '/mina reset',
  minaResetIntervalMs: 5500,

  targetX: 1.543,
  targetY: 117.00000,
  targetZ: 1.472,

  lookYawDeg: 140.0,
  lookPitchDeg: 53.9,
  afterLookDelayMs: 2000,

  miningLoopDelayMs: 1200,
  miningRetryDelayMs: 1500,

  levelWebhookUrl: 'https://discord.com/api/webhooks/1479869868680679666/3qrtt_nyxXBe8QiguA2_aq2chh3UH2D01rf4452_Dtq_oZcQFEfY8lKleXXlgVW6TEvH',

  aiReplyEnabled: true,
  aiModel: 'gpt-5.4',
  aiMaxReplyChars: 220,
  aiReplyDelayMs: 4000,

  suspiciousTeleportDistance: 6,
  lookAroundEnabled: true,
  lookAroundMinStepDelayMs: 700,
  lookAroundMaxStepDelayMs: 1800,
  lookAroundStepsMin: 5,
  lookAroundStepsMax: 9,

  resumeAfterStopDelayMs: 3 * 60 * 1000,

  flyToMineEnabled: true,
  flyHorizontalTolerance: 1.8,
  flyVerticalTolerance: 1.6,
  flyStepMs: 120,
  flyMaxTimeMs: 90000,
  flyLookSmoothing: 0.18,
  flyNearTargetSlowRadius: 6,
  flyStopForwardChanceNearTarget: 0.18
}

let state = {}

function resetState() {
  state = {
    joinTime: 0,
    spawnCount: 0,
    respawnCount: 0,
    lastSpawnAt: 0,

    loginSent: false,
    loginConfirmed: false,

    slotSelected: false,
    menuOpened: false,
    menuClicked: false,
    postLoginStarted: false,
    compassUsed: false,

    stableTimer: null,

    minaSequenceStarted: false,
    walkingToMine: false,
    infiniteMiningStarted: false,
    minaResetInterval: null,

    replyingToTell: false,
    lastTellSignature: null,
    lastTellAt: 0,

    lastLevelSignature: null,
    lastLevelAt: 0,

    lastPosition: null,
    suspiciousMode: false,
    handlingTeleport: false,

    resumeMiningTimeout: null,
    pausedByTellOrTeleport: false
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function cleanMessage(text) {
  return String(text || '').replace(/§[0-9A-FK-OR]/gi, '').trim()
}

function section(title) {
  console.log('\n==============================')
  console.log(title)
  console.log('==============================')
}

function clearStableTimer() {
  if (state.stableTimer) {
    clearTimeout(state.stableTimer)
    state.stableTimer = null
  }
}

function clearRoutineTimers() {
  if (state.minaResetInterval) {
    clearInterval(state.minaResetInterval)
    state.minaResetInterval = null
  }

  if (state.resumeMiningTimeout) {
    clearTimeout(state.resumeMiningTimeout)
    state.resumeMiningTimeout = null
  }

  state.walkingToMine = false
  state.infiniteMiningStarted = false
  state.minaSequenceStarted = false
  state.pausedByTellOrTeleport = false
  state.replyingToTell = false
  state.handlingTeleport = false
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2
  while (angle < -Math.PI) angle += Math.PI * 2
  return angle
}

function degToRad(deg) {
  return deg * Math.PI / 180
}

function truncateReply(text, maxLen = CONFIG.aiMaxReplyChars) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLen) return clean
  return clean.slice(0, maxLen - 3).trim() + '...'
}

function stopAllMovementControls() {
  if (!bot) return

  try {
    bot.setControlState('forward', false)
    bot.setControlState('back', false)
    bot.setControlState('left', false)
    bot.setControlState('right', false)
    bot.setControlState('jump', false)
    bot.setControlState('sneak', false)
    bot.setControlState('sprint', false)
  } catch (err) {
    console.log('[DEBUG] erro ao limpar control states:', err.message)
  }
}

function scheduleReconnect(delay = CONFIG.reconnectDelayMs) {
  if (reconnecting) return
  reconnecting = true

  console.log(`Reconectando em ${delay / 1000} segundos...`)
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
    t.includes('senha') ||
    t.includes('logar') ||
    t.includes('login')
  )
}

function looksLikeLoginSuccess(text) {
  const t = cleanMessage(text).toLowerCase()
  return (
    t.includes('você logou com sucesso') ||
    t.includes('voce logou com sucesso') ||
    t.includes('logou com sucesso') ||
    t.includes('login realizado') ||
    t.includes('autenticado com sucesso')
  )
}

function looksLikeLevelUp(text) {
  const t = cleanMessage(text).toLowerCase()
  return (
    t.includes('você evoluiu para o nível') ||
    t.includes('voce evoluiu para o nível') ||
    t.includes('voce evoluiu para o nivel') ||
    t.includes('você evoluiu para o nivel')
  )
}

function isDuplicateTell(sender, message) {
  const signature = `${sender}::${message}`
  const now = Date.now()

  if (state.lastTellSignature === signature && now - state.lastTellAt < 3000) {
    return true
  }

  state.lastTellSignature = signature
  state.lastTellAt = now
  return false
}

function isDuplicateLevel(text) {
  const signature = text
  const now = Date.now()

  if (state.lastLevelSignature === signature && now - state.lastLevelAt < 5000) {
    return true
  }

  state.lastLevelSignature = signature
  state.lastLevelAt = now
  return false
}

async function sendDiscordWebhook(webhookUrl, content) {
  if (!webhookUrl) {
    console.log('[DEBUG] webhook do Discord não configurado')
    return
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'Mara Bot',
        content
      })
    })

    if (!res.ok) {
      console.log('[DEBUG] erro ao enviar webhook:', res.status, res.statusText)
      return
    }

    console.log('[DEBUG] mensagem enviada para o Discord')
  } catch (err) {
    console.log('[DEBUG] falha ao enviar webhook:', err.message)
  }
}

function printHotbar() {
  console.log('\n[DEBUG] estado da hotbar:')
  for (let i = 36; i <= 44; i++) {
    const item = bot.inventory.slots[i]
    console.log(`slot ${i} -> ${item ? `${item.name} x${item.count}` : 'vazio'}`)
  }
}

function hotbarReady() {
  for (let i = 36; i <= 44; i++) {
    if (bot.inventory.slots[i]) return true
  }
  return false
}

async function waitForHotbar(maxMs = CONFIG.hotbarTimeoutMs) {
  const start = Date.now()

  while (Date.now() - start < maxMs) {
    if (!bot || !bot.entity) return false
    if (hotbarReady()) return true

    console.log('[DEBUG] hotbar ainda não carregou, esperando 2s...')
    await sleep(2000)
  }

  return false
}

function scheduleLoginAttempt(reason) {
  clearStableTimer()

  console.log(`[DEBUG] aguardando ${CONFIG.stableLoginDelayMs / 1000}s de estabilidade para logar... (${reason})`)

  state.stableTimer = setTimeout(() => {
    sendLogin(`estabilidade após ${reason}`)
  }, CONFIG.stableLoginDelayMs)
}

function sendLogin(trigger) {
  if (!bot) return

  if (state.loginSent) {
    console.log(`[DEBUG] login já enviado, ignorando trigger: ${trigger}`)
    return
  }

  const msSinceLastSpawn = Date.now() - state.lastSpawnAt
  if (state.lastSpawnAt && msSinceLastSpawn < 5000) {
    console.log(`[DEBUG] último spawn foi há ${msSinceLastSpawn}ms, ainda cedo para logar`)
    scheduleLoginAttempt('spawn recente')
    return
  }

  state.loginSent = true

  section('ENVIANDO LOGIN')
  console.log('Trigger:', trigger)
  console.log('Spawns detectados:', state.spawnCount)
  console.log('Respawns detectados:', state.respawnCount)
  console.log('Tempo desde entrada:', ((Date.now() - state.joinTime) / 1000).toFixed(2) + 's')
  console.log('Comando:', CONFIG.loginCommand)

  try {
    bot.chat(CONFIG.loginCommand)
    console.log('[DEBUG] comando de login enviado')
  } catch (err) {
    console.log('[DEBUG] erro ao enviar login:', err.message)
    state.loginSent = false
    scheduleLoginAttempt('erro ao enviar login')
  }
}

async function lookAtMineAngle() {
  if (!bot || !bot.entity) {
    console.log('[DEBUG] bot/entity indisponível para olhar para o ângulo')
    return
  }

  section('OLHANDO PARA O ÂNGULO DA MINA')

  try {
    console.log('[DEBUG] yaw/pitch alvo (graus):', {
      yaw: CONFIG.lookYawDeg,
      pitch: CONFIG.lookPitchDeg
    })

    const yawRad = degToRad(CONFIG.lookYawDeg)
    const pitchRad = degToRad(CONFIG.lookPitchDeg)

    console.log('[DEBUG] yaw/pitch alvo (radianos):', { yawRad, pitchRad })

    await bot.look(yawRad, pitchRad, true)
    console.log('[DEBUG] bot virou para o ângulo pretendido')

    console.log(`[DEBUG] aguardando ${CONFIG.afterLookDelayMs / 1000}s após olhar...`)
    await sleep(CONFIG.afterLookDelayMs)
  } catch (err) {
    console.log('[DEBUG] erro ao olhar para o ângulo:', err.message)
  }
}

function parseTellMessage(text) {
  const clean = cleanMessage(text)

  const patterns = [
    /^\[mensagem de \[[^\]]+\]\s+(.+?)\]:\s*(.+)$/i,
    /^(.+?)\s+->\s+você:\s+(.+)$/i,
    /^(.+?)\s+->\s+voce:\s+(.+)$/i,
    /^de\s+(.+?):\s+(.+)$/i,
    /^\[tell\]\s+(.+?):\s+(.+)$/i,
    /^mensagem de\s+(.+?):\s+(.+)$/i,
    /^(.+?)\s+te disse:\s+(.+)$/i,
    /^(.+?)\s+whispers:\s+(.+)$/i,
    /^from\s+(.+?):\s+(.+)$/i
  ]

  for (const pattern of patterns) {
    const match = clean.match(pattern)
    if (match) {
      return {
        sender: match[1].trim(),
        message: match[2].trim()
      }
    }
  }

  return null
}

async function askAIAboutTell(sender, message) {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    console.log('[DEBUG] OPENAI_API_KEY não definida')
    return null
  }

  const systemPrompt = [
    'És um jogador real de Minecraft a responder mensagens privadas no jogo.',
    'Responde em português de Portugal.',
    'Analisa o que a pessoa disse e responde de forma natural, contextual e curta.',
    'Não digas que és uma IA.',
    'Não uses respostas pré-feitas nem demasiado genéricas.',
    'Responde como alguém normal no servidor.',
    'Mantém a resposta curta o suficiente para caber bem num /r.',
    'Se a pessoa fizer uma pergunta, responde à pergunta.',
    'Se a mensagem for vaga, responde de forma natural e coerente com o contexto.',
    'Nunca excedas 220 caracteres.',
    'Devolve apenas a resposta final.'
  ].join(' ')

  const userPrompt = [
    `Jogador: ${sender}`,
    `Mensagem privada recebida: "${message}"`,
    'Gera apenas a resposta que devo enviar no /r, sem aspas e sem explicações.'
  ].join('\n')

  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: CONFIG.aiModel,
        input: [
          {
            role: 'system',
            content: [
              { type: 'input_text', text: systemPrompt }
            ]
          },
          {
            role: 'user',
            content: [
              { type: 'input_text', text: userPrompt }
            ]
          }
        ]
      })
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.log('[DEBUG] erro da OpenAI:', res.status, errorText)
      return null
    }

    const data = await res.json()
    const text = data.output_text || ''

    if (!text.trim()) {
      console.log('[DEBUG] resposta vazia da IA')
      return null
    }

    return truncateReply(text, CONFIG.aiMaxReplyChars)
  } catch (err) {
    console.log('[DEBUG] erro ao consultar IA:', err.message)
    return null
  }
}

function startMinaResetLoop() {
  if (state.minaResetInterval) {
    console.log('[DEBUG] rotina /mina reset já está ativa')
    return
  }

  section('INICIANDO ROTINA /MINA RESET')

  const runReset = () => {
    if (!bot || !state.loginConfirmed) {
      console.log('[DEBUG] bot não está pronto para /mina reset')
      return
    }

    try {
      console.log(`[DEBUG] enviando comando: ${CONFIG.minaResetCommand}`)
      bot.chat(CONFIG.minaResetCommand)
    } catch (err) {
      console.log('[DEBUG] erro ao enviar /mina reset:', err.message)
    }
  }

  runReset()

  state.minaResetInterval = setInterval(() => {
    runReset()
  }, CONFIG.minaResetIntervalMs)

  console.log(`[DEBUG] /mina reset ficará a correr de ${CONFIG.minaResetIntervalMs} em ${CONFIG.minaResetIntervalMs} ms`)
}

async function stopAllMiningActions(reason = 'motivo desconhecido') {
  section('PARANDO TUDO')
  console.log('[DEBUG] motivo:', reason)

  try {
    if (bot?.targetDigBlock) {
      await bot.stopDigging()
      console.log('[DEBUG] mineração parada com stopDigging()')
    }
  } catch (err) {
    console.log('[DEBUG] erro ao parar mineração:', err.message)
  }

  stopAllMovementControls()

  if (state.minaResetInterval) {
    clearInterval(state.minaResetInterval)
    state.minaResetInterval = null
    console.log('[DEBUG] loop /mina reset parado')
  }

  state.walkingToMine = false
  state.infiniteMiningStarted = false
}

async function lookAroundNaturally() {
  if (!bot || !bot.entity || !CONFIG.lookAroundEnabled) {
    console.log('[DEBUG] não dá para olhar em volta agora')
    return
  }

  section('OLHANDO EM VOLTA NATURALMENTE')

  try {
    const baseYaw = bot.entity.yaw
    const basePitch = bot.entity.pitch
    const steps = randomBetween(CONFIG.lookAroundStepsMin, CONFIG.lookAroundStepsMax)

    console.log('[DEBUG] yaw inicial:', baseYaw)
    console.log('[DEBUG] pitch inicial:', basePitch)
    console.log('[DEBUG] passos:', steps)

    for (let i = 0; i < steps; i++) {
      if (!bot || !bot.entity) return

      const nextYaw = baseYaw + randomFloat(-1.8, 1.8)
      const nextPitch = Math.max(-1.2, Math.min(1.2, basePitch + randomFloat(-0.35, 0.35)))
      const delay = randomBetween(CONFIG.lookAroundMinStepDelayMs, CONFIG.lookAroundMaxStepDelayMs)

      console.log('[DEBUG] look step:', {
        step: i + 1,
        yaw: nextYaw,
        pitch: nextPitch,
        delay
      })

      try {
        await bot.look(nextYaw, nextPitch, true)
      } catch (err) {
        console.log('[DEBUG] erro no bot.look:', err.message)
      }

      await sleep(delay)
    }

    console.log('[DEBUG] terminou o olhar natural em volta')
  } catch (err) {
    console.log('[DEBUG] erro ao olhar em volta:', err.message)
  }
}

function isMiningOrMiningSetupRunning() {
  return !!(
    state.infiniteMiningStarted ||
    state.walkingToMine ||
    state.minaResetInterval
  )
}

function scheduleMiningResume(reason = 'motivo desconhecido') {
  if (state.resumeMiningTimeout) {
    clearTimeout(state.resumeMiningTimeout)
    state.resumeMiningTimeout = null
    console.log('[DEBUG] retoma anterior cancelada para reagendar nova')
  }

  state.pausedByTellOrTeleport = true

  section('AGENDANDO RETOMA DA MINERAÇÃO')
  console.log('[DEBUG] motivo:', reason)
  console.log(`[DEBUG] retoma em ${CONFIG.resumeAfterStopDelayMs / 1000}s`)

  state.resumeMiningTimeout = setTimeout(async () => {
    state.resumeMiningTimeout = null

    if (!bot || !state.loginConfirmed) {
      console.log('[DEBUG] bot não está pronto quando chegou a hora de retomar mineração')
      return
    }

    section('RETOMANDO MINERAÇÃO')

    try {
      console.log('[DEBUG] mudando novamente para o slot da picareta:', CONFIG.pickaxeHotbarSlot)
      bot.setQuickBarSlot(CONFIG.pickaxeHotbarSlot)

      await sleep(CONFIG.afterPickaxeSelectDelayMs)

      console.log('[DEBUG] heldItem antes de retomar:', bot.heldItem ? bot.heldItem.name : 'nenhum')

      console.log('[DEBUG] voltando para a coordenada da mina...')
      await walkToMineCoordinate()

      console.log('[DEBUG] olhando novamente para o ângulo da mina...')
      await lookAtMineAngle()

      console.log('[DEBUG] reiniciando loop /mina reset...')
      startMinaResetLoop()

      console.log('[DEBUG] reiniciando mineração infinita...')
      state.pausedByTellOrTeleport = false
      await startInfiniteMining()
    } catch (err) {
      console.log('[DEBUG] erro ao retomar mineração:', err.message)
    }
  }, CONFIG.resumeAfterStopDelayMs)
}

async function handleSuspiciousTeleport(oldPos, newPos) {
  if (!bot || !state.loginConfirmed) {
    console.log('[DEBUG] teleport suspeito detetado mas bot não está pronto')
    return
  }

  if (state.handlingTeleport) {
    console.log('[DEBUG] já estou a tratar um teleport suspeito')
    return
  }

  state.handlingTeleport = true
  state.suspiciousMode = true

  try {
    section('TELEPORT SUSPEITO DETETADO')
    console.log('[DEBUG] posição antiga:', oldPos)
    console.log('[DEBUG] posição nova:', newPos)

    await stopAllMiningActions('teleport recebido enquanto minerava')
    await sleep(1200)
    await lookAroundNaturally()

    scheduleMiningResume('teleport suspeito')
  } catch (err) {
    console.log('[DEBUG] erro ao tratar teleport suspeito:', err.message)
  } finally {
    state.handlingTeleport = false
  }
}

async function handleIncomingTell(rawText, source) {
  if (!CONFIG.aiReplyEnabled) return

  const parsed = parseTellMessage(rawText)
  if (!parsed) return

  if (isDuplicateTell(parsed.sender, parsed.message)) {
    console.log('[DEBUG] tell duplicada ignorada')
    return
  }

  if (!bot || !state.loginConfirmed) {
    console.log('[DEBUG] tell recebida mas o bot ainda não está pronto')
    return
  }

  if (state.replyingToTell) {
    console.log('[DEBUG] já estou a responder a uma tell, ignorando nova mensagem')
    return
  }

  state.replyingToTell = true

  try {
    section('TELL RECEBIDA')
    console.log('[DEBUG] source:', source)
    console.log('[DEBUG] sender:', parsed.sender)
    console.log('[DEBUG] message:', parsed.message)

    await stopAllMiningActions('tell recebida')
    await sleep(1200)

    const reply = await askAIAboutTell(parsed.sender, parsed.message)

    if (!reply) {
      console.log('[DEBUG] sem resposta válida da IA')
      scheduleMiningResume('tell recebida sem resposta válida')
      return
    }

    console.log('[DEBUG] resposta gerada pela IA:', reply)
    console.log(`[DEBUG] aguardando ${CONFIG.aiReplyDelayMs}ms antes de responder /r...`)
    await sleep(CONFIG.aiReplyDelayMs)

    if (!bot || !state.loginConfirmed) {
      console.log('[DEBUG] bot deixou de estar pronto antes do /r')
      scheduleMiningResume('tell recebida mas bot ficou indisponível')
      return
    }

    const command = `/r ${reply}`
    console.log('[DEBUG] enviando:', command)
    bot.chat(command)

    scheduleMiningResume('tell respondida')
  } catch (err) {
    console.log('[DEBUG] erro ao tratar tell:', err.message)
    scheduleMiningResume('erro ao tratar tell')
  } finally {
    state.replyingToTell = false
  }
}

function getMineableBlockInFront() {
  if (!bot) return null

  const block = bot.blockAtCursor(5)

  if (!block) {
    console.log('[DEBUG] nenhum bloco encontrado no cursor')
    return null
  }

  console.log('[DEBUG] bloco no cursor:', {
    name: block.name,
    position: block.position,
    hardness: block.hardness,
    boundingBox: block.boundingBox
  })

  if (block.name === 'air' || block.boundingBox === 'empty') {
    console.log('[DEBUG] bloco no cursor não é minerável')
    return null
  }

  return block
}

async function startInfiniteMining() {
  if (!bot || !bot.entity) {
    console.log('[DEBUG] bot/entity indisponível para mineração infinita')
    return
  }

  if (state.infiniteMiningStarted) {
    console.log('[DEBUG] mineração infinita já iniciada')
    return
  }

  state.infiniteMiningStarted = true

  section('MINERAÇÃO INFINITA')

  while (bot && bot.entity && state.loginConfirmed) {
    try {
      if (state.replyingToTell || state.handlingTeleport) {
        console.log('[DEBUG] mineração suspensa porque tell/teleport está a ser tratada')
        break
      }

      if (bot.targetDigBlock) {
        console.log('[DEBUG] já está a minerar um bloco, aguardando...')
        await sleep(CONFIG.miningLoopDelayMs)
        continue
      }

      const block = getMineableBlockInFront()

      if (!block) {
        console.log(`[DEBUG] sem bloco válido à frente, tentando novamente em ${CONFIG.miningRetryDelayMs}ms...`)
        await sleep(CONFIG.miningRetryDelayMs)
        continue
      }

      const canDig = bot.canDigBlock(block)
      console.log('[DEBUG] canDigBlock:', canDig)

      if (!canDig) {
        console.log('[DEBUG] não consigo minerar esse bloco agora')
        await sleep(CONFIG.miningRetryDelayMs)
        continue
      }

      console.log(`[DEBUG] iniciando mineração de ${block.name} em ${block.position}`)

      await bot.dig(block, true)

      console.log('[DEBUG] bloco minerado com sucesso')
      await sleep(CONFIG.miningLoopDelayMs)
    } catch (err) {
      console.log('[DEBUG] erro na mineração infinita:', err.message)
      await sleep(CONFIG.miningRetryDelayMs)
    }
  }

  state.infiniteMiningStarted = false
}

async function flyNaturallyToCoordinate(x, y, z) {
  if (!bot || !bot.entity) {
    console.log('[DEBUG] bot/entity indisponível para voo')
    return
  }

  if (state.walkingToMine) {
    console.log('[DEBUG] já existe deslocação em curso')
    return
  }

  state.walkingToMine = true

  section('VOANDO NATURALMENTE ATÉ À COORDENADA')

  const startTime = Date.now()

  try {
    while (bot && bot.entity) {
      const pos = bot.entity.position
      const dx = x - pos.x
      const dy = y - pos.y
      const dz = z - pos.z

      const horizontalDist = Math.sqrt(dx * dx + dz * dz)
      const totalDist = Math.sqrt(dx * dx + dy * dy + dz * dz)

      console.log('[DEBUG] voo status:', {
        pos: {
          x: pos.x.toFixed(3),
          y: pos.y.toFixed(3),
          z: pos.z.toFixed(3)
        },
        target: { x, y, z },
        dx: dx.toFixed(3),
        dy: dy.toFixed(3),
        dz: dz.toFixed(3),
        horizontalDist: horizontalDist.toFixed(3),
        totalDist: totalDist.toFixed(3)
      })

      if (
        horizontalDist <= CONFIG.flyHorizontalTolerance &&
        Math.abs(dy) <= CONFIG.flyVerticalTolerance
      ) {
        console.log('[DEBUG] destino de voo alcançado')
        break
      }

      if (Date.now() - startTime > CONFIG.flyMaxTimeMs) {
        throw new Error('tempo limite do voo excedido')
      }

      const desiredYaw = Math.atan2(-dx, -dz)
      const yawDiff = normalizeAngle(desiredYaw - bot.entity.yaw)
      const nextYaw = bot.entity.yaw + yawDiff * CONFIG.flyLookSmoothing

      let desiredPitch = -Math.atan2(dy, Math.max(horizontalDist, 0.001))
      desiredPitch = clamp(desiredPitch, -0.9, 0.9)

      const pitchDiff = desiredPitch - bot.entity.pitch
      const nextPitch = bot.entity.pitch + pitchDiff * CONFIG.flyLookSmoothing

      try {
        await bot.look(nextYaw, nextPitch, true)
      } catch (err) {
        console.log('[DEBUG] erro no look durante voo:', err.message)
      }

      const nearTarget = horizontalDist <= CONFIG.flyNearTargetSlowRadius
      const pauseForwardNearTarget = nearTarget && Math.random() < CONFIG.flyStopForwardChanceNearTarget

      bot.setControlState('forward', !pauseForwardNearTarget)
      bot.setControlState('back', false)

      const shouldGoUp = dy > 0.8
      const shouldGoDown = dy < -0.8

      bot.setControlState('jump', shouldGoUp)
      bot.setControlState('sneak', shouldGoDown)

      bot.setControlState('left', yawDiff < -0.22)
      bot.setControlState('right', yawDiff > 0.22)

      if (nearTarget) {
        bot.setControlState('sprint', false)
      } else {
        bot.setControlState('sprint', Math.random() > 0.2)
      }

      await sleep(CONFIG.flyStepMs)
    }
  } catch (err) {
    console.log('[DEBUG] erro ao voar até à coordenada:', err.message)
  } finally {
    stopAllMovementControls()
    state.walkingToMine = false
  }
}

async function walkToMineCoordinate() {
  if (!bot || !bot.entity) {
    console.log('[DEBUG] bot/entity indisponível para ir até à mina')
    return
  }

  if (CONFIG.flyToMineEnabled) {
    await flyNaturallyToCoordinate(
      CONFIG.targetX,
      CONFIG.targetY,
      CONFIG.targetZ
    )
    return
  }

  console.log('[DEBUG] flyToMineEnabled está false, mas neste código não há fallback de pathfinder')
}

async function openCompassMenuSequence(trigger) {
  if (state.postLoginStarted) {
    console.log(`[DEBUG] sequência pós-login já iniciada. Ignorando: ${trigger}`)
    return
  }

  state.postLoginStarted = true

  section('PÓS-LOGIN')
  console.log('Trigger:', trigger)
  console.log(`Aguardando ${CONFIG.afterLoginWaitMs / 1000}s antes de verificar hotbar...`)

  try {
    await sleep(CONFIG.afterLoginWaitMs)

    const ready = await waitForHotbar()
    printHotbar()

    if (!ready) {
      console.log('[DEBUG] hotbar não carregou a tempo.')
      state.postLoginStarted = false
      return
    }

    state.slotSelected = true

    console.log(`[DEBUG] selecionando slot ${CONFIG.hotbarSlot} (item ${CONFIG.hotbarSlot + 1})`)
    bot.setQuickBarSlot(CONFIG.hotbarSlot)

    await sleep(CONFIG.useItemDelayMs)

    console.log('[DEBUG] heldItem atual:', bot.heldItem ? bot.heldItem.name : 'nenhum')

    if (state.compassUsed) {
      console.log('[DEBUG] bússola já foi usada nesta sessão, ignorando novo activateItem')
      return
    }

    console.log('[DEBUG] tentando abrir menu com a bússola...')

    try {
      state.compassUsed = true
      console.log('[DEBUG] VOU USAR O ITEM AGORA')
      bot.activateItem()
      console.log('[DEBUG] activateItem enviado')
    } catch (err) {
      state.compassUsed = false
      console.log('[DEBUG] erro ao usar item:', err.message)
    }
  } catch (err) {
    console.log('[DEBUG] erro na sequência pós-login:', err.message)
    state.postLoginStarted = false
  }
}

async function runAfterSlot13Sequence() {
  if (!bot || !state.loginConfirmed) {
    console.log('[DEBUG] bot não está pronto para a sequência após slot 13')
    return
  }

  if (state.minaSequenceStarted) {
    console.log('[DEBUG] sequência após slot 13 já iniciada')
    return
  }

  state.minaSequenceStarted = true
  state.suspiciousMode = false

  section('SEQUÊNCIA APÓS SLOT 13')

  try {
    console.log(`[DEBUG] aguardando ${CONFIG.afterSlot13SequenceDelayMs / 1000}s após clique no slot 13...`)
    await sleep(CONFIG.afterSlot13SequenceDelayMs)

    console.log(`[DEBUG] mudando para o slot da picareta: ${CONFIG.pickaxeHotbarSlot}`)
    bot.setQuickBarSlot(CONFIG.pickaxeHotbarSlot)

    await sleep(CONFIG.afterPickaxeSelectDelayMs)

    console.log('[DEBUG] heldItem após trocar para picareta:', bot.heldItem ? bot.heldItem.name : 'nenhum')

    console.log(`[DEBUG] enviando comando: ${CONFIG.minaCommand}`)
    bot.chat(CONFIG.minaCommand)

    await sleep(CONFIG.afterMinaCommandDelayMs)

    console.log('[DEBUG] iniciando deslocação até à coordenada alvo...')
    await walkToMineCoordinate()

    await lookAtMineAngle()

    startMinaResetLoop()

    await startInfiniteMining()
  } catch (err) {
    console.log('[DEBUG] erro na sequência após slot 13:', err.message)
    state.minaSequenceStarted = false
  }
}

function maybeHandleLoginSuccess(text, source) {
  if (!state.loginConfirmed && looksLikeLoginSuccess(text)) {
    state.loginConfirmed = true
    console.log(`[DEBUG] login confirmado por: ${source}`)

    openCompassMenuSequence(`login confirmado por ${source}`)
  }
}

function logKickReason(reason) {
  section('MOTIVO DO KICK')

  try {
    console.log(util.inspect(reason, { depth: 10, colors: true }))
  } catch {}

  try {
    console.log(JSON.stringify(reason, null, 2))
  } catch {}
}

function attachTeleportPacketListeners() {
  if (!bot?._client) return

  const packetHandler = async (packetName, packet) => {
    try {
      console.log('[DEBUG] pacote de teleport/position detetado:', packetName)

      if (!isMiningOrMiningSetupRunning()) return
      if (!state.loginConfirmed) return

      const oldPos = state.lastPosition && state.lastPosition.clone
        ? state.lastPosition.clone()
        : (bot.entity?.position ? bot.entity.position.clone() : null)

      const newPos = bot.entity?.position ? bot.entity.position.clone() : null

      if (!oldPos || !newPos) return

      await handleSuspiciousTeleport(oldPos, newPos)
    } catch (err) {
      console.log('[DEBUG] erro no packet handler:', err.message)
    }
  }

  const packetNames = [
    'position',
    'position_look',
    'entity_teleport'
  ]

  for (const name of packetNames) {
    try {
      bot._client.on(name, (packet) => {
        packetHandler(name, packet)
      })
      console.log('[DEBUG] listener de pacote registado para:', name)
    } catch (err) {
      console.log('[DEBUG] não foi possível registar listener para', name, err.message)
    }
  }
}

function createBot() {
  resetState()

  if (bot) {
    try {
      bot.removeAllListeners()
      bot.quit()
    } catch {}
    bot = null
  }

  console.log('Iniciando Mara...')

  bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: CONFIG.version
  })

  state.joinTime = Date.now()

  attachTeleportPacketListeners()

  bot.on('connect', () => {
    console.log('[DEBUG] Socket conectado ao servidor')
  })

  bot.on('login', () => {
    console.log('[DEBUG] Pacote de login aceito')
  })

  bot.on('spawn', () => {
    state.spawnCount++
    state.lastSpawnAt = Date.now()

    section(`SPAWN #${state.spawnCount}`)
    console.log('Tempo desde entrada:', ((Date.now() - state.joinTime) / 1000).toFixed(2) + 's')
    console.log('Username:', bot.username)

    if (bot.entity) {
      console.log('Posição:', bot.entity.position)
      state.lastPosition = bot.entity.position.clone()
    }

    if (!state.loginSent) {
      scheduleLoginAttempt(`spawn #${state.spawnCount}`)
    }
  })

  bot.on('respawn', () => {
    state.respawnCount++
    section(`RESPAWN #${state.respawnCount}`)
    console.log('[DEBUG] respawn detectado')
  })

  bot.on('move', () => {
    try {
      if (!bot?.entity?.position) return

      const currentPos = bot.entity.position.clone()

      if (!state.lastPosition) {
        state.lastPosition = currentPos
        return
      }

      const distance = currentPos.distanceTo(state.lastPosition)

      if (distance >= CONFIG.suspiciousTeleportDistance) {
        console.log('[DEBUG] movimento grande detetado:', distance)

        const wasMining = isMiningOrMiningSetupRunning()

        if (wasMining) {
          handleSuspiciousTeleport(state.lastPosition.clone(), currentPos.clone())
        }
      }

      state.lastPosition = currentPos
    } catch (err) {
      console.log('[DEBUG] erro no listener move:', err.message)
    }
  })

  bot.on('messagestr', async (msg) => {
    const cleanMsg = cleanMessage(msg)
    console.log('[CHAT]', cleanMsg)

    if (!state.loginSent && looksLikeLoginPrompt(cleanMsg)) {
      console.log('[DEBUG] possível pedido de login detectado no chat')
      setTimeout(() => sendLogin('prompt no chat'), 3000)
    }

    maybeHandleLoginSuccess(cleanMsg, 'chat')

    if (looksLikeLevelUp(cleanMsg) && !isDuplicateLevel(cleanMsg)) {
      await sendDiscordWebhook(
        CONFIG.levelWebhookUrl,
        cleanMsg
      )
    }

    await handleIncomingTell(cleanMsg, 'chat')
  })

  bot.on('message', async (msg) => {
    try {
      const raw = cleanMessage(msg.toString())
      console.log('[RAW MESSAGE]', raw)

      if (!state.loginSent && looksLikeLoginPrompt(raw)) {
        console.log('[DEBUG] possível pedido de login detectado na raw message')
        setTimeout(() => sendLogin('prompt na raw message'), 3000)
      }

      maybeHandleLoginSuccess(raw, 'raw message')

      if (looksLikeLevelUp(raw) && !isDuplicateLevel(raw)) {
        await sendDiscordWebhook(
          CONFIG.levelWebhookUrl,
          raw
        )
      }

      await handleIncomingTell(raw, 'raw message')
    } catch (err) {
      console.log('[RAW MESSAGE] erro ao converter:', err.message)
    }
  })

  bot.on('title', (title, subtitle) => {
    try {
      console.log('[TITLE]', title ? title.toString() : '')
      console.log('[SUBTITLE]', subtitle ? subtitle.toString() : '')
    } catch {
      console.log('[TITLE/SUBTITLE] recebido')
    }
  })

  bot.on('actionBar', async (msg) => {
    try {
      const text = cleanMessage(msg.toString())
      console.log('[ACTIONBAR]', text)

      if (!state.loginSent && looksLikeLoginPrompt(text)) {
        console.log('[DEBUG] possível pedido de login detectado na actionbar')
        setTimeout(() => sendLogin('prompt na actionbar'), 3000)
      }

      maybeHandleLoginSuccess(text, 'actionbar')

      if (looksLikeLevelUp(text) && !isDuplicateLevel(text)) {
        await sendDiscordWebhook(
          CONFIG.levelWebhookUrl,
          text
        )
      }
    } catch {
      console.log('[ACTIONBAR] erro')
    }
  })

  bot.on('heldItemChanged', (item) => {
    console.log('[DEBUG] heldItemChanged:', item ? item.name : 'nenhum')
  })

  bot.on('windowOpen', async (window) => {
    state.menuOpened = true

    section('MENU ABERTO')
    console.log('Título:', window?.title || '(sem título)')

    try {
      const slotsInfo = window.slots.map((item, i) => ({
        slot: i,
        item: item ? item.name : null,
        count: item ? item.count : null
      }))
      console.log(util.inspect(slotsInfo, { depth: 4, colors: true }))
    } catch (err) {
      console.log('[DEBUG] erro ao listar slots da janela:', err.message)
    }

    if (state.menuClicked) {
      console.log('[DEBUG] menu já clicado anteriormente, ignorando')
      return
    }

    try {
      console.log(`[DEBUG] aguardando ${CONFIG.menuClickDelayMs / 1000}s antes de clicar no slot ${CONFIG.menuClickSlot}...`)
      await sleep(CONFIG.menuClickDelayMs)

      if (!bot.currentWindow) {
        console.log('[DEBUG] a janela fechou antes do clique')
        return
      }

      const target = bot.currentWindow.slots[CONFIG.menuClickSlot]
      console.log('[DEBUG] slot alvo:', target ? `${target.name} x${target.count}` : 'vazio')

      if (!target) {
        console.log('[DEBUG] slot alvo vazio, cancelando clique')
        return
      }

      await bot.clickWindow(CONFIG.menuClickSlot, 0, 0)
      state.menuClicked = true
      console.log(`[DEBUG] clique no slot ${CONFIG.menuClickSlot} realizado`)

      console.log(`[DEBUG] aguardando ${CONFIG.afterMenuClickPauseMs / 1000}s após o clique para estabilizar troca de servidor...`)
      await sleep(CONFIG.afterMenuClickPauseMs)

      await runAfterSlot13Sequence()
    } catch (err) {
      console.log('[DEBUG] erro ao clicar na janela:', err.message)
    }
  })

  bot.on('windowClose', () => {
    console.log('[DEBUG] janela fechada')
    state.menuOpened = false
  })

  bot.on('kicked', (reason, loggedIn) => {
    clearStableTimer()
    clearRoutineTimers()
    stopAllMovementControls()

    console.log('loggedIn:', loggedIn)
    console.log('spawnCount:', state.spawnCount)
    console.log('respawnCount:', state.respawnCount)
    console.log('tempo conectado:', ((Date.now() - state.joinTime) / 1000).toFixed(2) + 's')
    console.log('loginSent:', state.loginSent)
    console.log('loginConfirmed:', state.loginConfirmed)
    console.log('slotSelected:', state.slotSelected)
    console.log('menuOpened:', state.menuOpened)
    console.log('menuClicked:', state.menuClicked)
    console.log('minaSequenceStarted:', state.minaSequenceStarted)
    console.log('walkingToMine:', state.walkingToMine)
    console.log('infiniteMiningStarted:', state.infiniteMiningStarted)

    logKickReason(reason)
    scheduleReconnect()
  })

  bot.on('error', (err) => {
    section('ERRO')
    console.log('Mensagem:', err.message)
    console.log('Código:', err.code)
    console.log(util.inspect(err, { depth: 10, colors: true }))
  })

  bot.on('end', () => {
    clearStableTimer()
    clearRoutineTimers()
    stopAllMovementControls()
    console.log('[DEBUG] conexão encerrada')
    scheduleReconnect(10000)
  })
}

createBot()