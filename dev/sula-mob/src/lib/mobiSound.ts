/**
 * mobiSound.ts
 * ────────────
 * Sonidos y voz de Mobi, todo generado por el navegador (sin archivos de audio
 * ni servicios externos): tonos con Web Audio API y voz con Web Speech API.
 * Solo se importa desde componentes de cliente.
 *
 * Los navegadores no dejan sonar nada hasta que el usuario interactúa con el
 * sitio. La bienvenida (playMobiBienvenida) espera a esa primera interacción;
 * los demás sonidos se omiten si el audio sigue bloqueado.
 *
 * RUTA: src/lib/mobiSound.ts
 */

interface Nota {
  /** Frecuencia en Hz (523 = Do5, 659 = Mi5, 784 = Sol5) */
  frecuencia: number
  /** Segundos desde el arranque del sonido */
  inicio: number
  duracion: number
  tipo?: OscillatorType
  /** 0 a 1 */
  volumen?: number
}

let audioCtx: AudioContext | null = null

async function contextoActivo(): Promise<AudioContext | null> {
  if (typeof window === 'undefined' || !window.AudioContext) return null
  audioCtx ??= new AudioContext()
  if (audioCtx.state === 'suspended') {
    // resume() no resuelve mientras el navegador tenga bloqueado el audio
    await Promise.race([
      audioCtx.resume().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 200)),
    ])
  }
  return audioCtx.state === 'running' ? audioCtx : null
}

/** Toca las notas. Devuelve false si el navegador todavía tiene bloqueado el audio */
async function tocar(notas: Nota[]): Promise<boolean> {
  try {
    const ctx = await contextoActivo()
    if (!ctx) return false
    const ahora = ctx.currentTime

    for (const { frecuencia, inicio, duracion, tipo = 'sine', volumen = 0.15 } of notas) {
      const osc = ctx.createOscillator()
      osc.type = tipo
      osc.frequency.value = frecuencia

      // Entrada y salida graduales para que no truene al empezar ni al terminar
      const gain = ctx.createGain()
      const t0 = ahora + inicio
      gain.gain.setValueAtTime(0, t0)
      gain.gain.linearRampToValueAtTime(volumen, t0 + 0.01)
      gain.gain.setValueAtTime(volumen, t0 + duracion - 0.02)
      gain.gain.linearRampToValueAtTime(0, t0 + duracion)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + duracion)
    }
    return true
  } catch {
    // Sin audio el chat funciona igual
    return false
  }
}

/** Tres notas ascendentes (Do-Mi-Sol) cuando el robot aparece */
export function playMobiStartup(): Promise<boolean> {
  return tocar([
    { frecuencia: 523, inicio: 0, duracion: 0.12, volumen: 0.12 },
    { frecuencia: 659, inicio: 0.12, duracion: 0.12, volumen: 0.14 },
    { frecuencia: 784, inicio: 0.24, duracion: 0.2, volumen: 0.15 },
  ])
}

/** Pop suave al abrir el chat */
export function playMobiPop(): void {
  void tocar([
    { frecuencia: 880, inicio: 0, duracion: 0.08, tipo: 'triangle', volumen: 0.1 },
    { frecuencia: 1100, inicio: 0.03, duracion: 0.07, volumen: 0.06 },
  ])
}

/** Ding corto y bajito cuando Mobi responde */
export function playMobiDing(): void {
  void tocar([{ frecuencia: 1047, inicio: 0, duracion: 0.08, volumen: 0.06 }])
}

/* ═══════════════════════════════════════
   VOZ (Web Speech API)
   ═══════════════════════════════════════ */

// Chrome carga las voces de forma asíncrona: la primera consulta puede venir vacía
function cargarVoces(): Promise<SpeechSynthesisVoice[]> {
  const voces = speechSynthesis.getVoices()
  if (voces.length) return Promise.resolve(voces)
  return new Promise((resolve) => {
    const listo = () => resolve(speechSynthesis.getVoices())
    speechSynthesis.addEventListener('voiceschanged', listo, { once: true })
    setTimeout(listo, 1000)
  })
}

/** Mejor voz en español: México, luego Latinoamérica, España y cualquier otra */
function vozEnEspanol(voces: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const idioma = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-').toLowerCase()
  for (const preferido of ['es-mx', 'es-419', 'es-us', 'es-es']) {
    const voz = voces.find((v) => idioma(v) === preferido)
    if (voz) return voz
  }
  return voces.find((v) => idioma(v).startsWith('es')) ?? null
}

/** Dice en voz alta "¡Bienvenido {nombre}!". Si el equipo no tiene voz en español, no dice nada */
export async function playMobiVoice(nombre?: string): Promise<void> {
  try {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    const voz = vozEnEspanol(await cargarVoces())
    if (!voz) return

    const frase = new SpeechSynthesisUtterance(nombre ? `¡Bienvenido ${nombre}!` : '¡Bienvenido a SULA MOB!')
    frase.voice = voz
    frase.lang = voz.lang
    frase.rate = 1
    frase.pitch = 1.1
    frase.volume = 0.8

    // Limpia cualquier frase atorada en la cola antes de hablar
    speechSynthesis.cancel()
    speechSynthesis.speak(frase)
  } catch {
    // Sin voz el chat funciona igual
  }
}

/* ═══════════════════════════════════════
   BIENVENIDA (notas + voz)
   ═══════════════════════════════════════ */

const EVENTOS_DE_INTERACCION = ['pointerdown', 'keydown'] as const

/**
 * Toca las tres notas y luego dice el saludo. Si el navegador tiene bloqueado el audio
 * (página recién cargada, sin clicks todavía), lo deja para la primera interacción.
 * `nombre` es una promesa para que el saludo use el nombre aunque llegue después.
 * Devuelve una función que cancela la bienvenida pendiente.
 */
export function playMobiBienvenida(nombre: Promise<string>): () => void {
  let cancelada = false
  let quitarEscuchas = () => {}

  const sonar = async () => {
    if (!(await playMobiStartup()) || cancelada) return false
    // La voz entra cuando terminan las notas
    const [quien] = await Promise.all([nombre, new Promise((resolve) => setTimeout(resolve, 500))])
    if (!cancelada) void playMobiVoice(quien || undefined)
    return true
  }

  void sonar().then((sono) => {
    if (sono || cancelada) return
    const alInteractuar = () => {
      quitarEscuchas()
      void sonar()
    }
    quitarEscuchas = () =>
      EVENTOS_DE_INTERACCION.forEach((e) => window.removeEventListener(e, alInteractuar, true))
    EVENTOS_DE_INTERACCION.forEach((e) => window.addEventListener(e, alInteractuar, true))
  })

  return () => {
    cancelada = true
    quitarEscuchas()
  }
}
