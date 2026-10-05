/**
 * /api/mobi/route.ts
 * ──────────────────
 * MOBI — asistente de IA de SULA MOB (solo administradores, solo consulta).
 *
 * Recibe el historial del chat, deja que Claude consulte la producción en
 * vivo con las herramientas de src/lib/mobi-tools.ts y devuelve la respuesta
 * en streaming como líneas JSON (NDJSON):
 *   {"type":"text","delta":"..."}    texto de la respuesta
 *   {"type":"tool","label":"..."}    MOBI está consultando datos
 *   {"type":"error","message":"..."} algo falló
 *
 * Requiere la variable de entorno ANTHROPIC_API_KEY (.env.local y Vercel).
 *
 * RUTA DEL ARCHIVO: src/app/api/mobi/route.ts
 */

import Anthropic from '@anthropic-ai/sdk'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { MOBI_TOOLS, MOBI_TOOL_LABELS, fechaHoy, nombrePorCorreo, runMobiTool } from '@/lib/mobi-tools'

export const maxDuration = 60

const MODEL = 'claude-opus-5-5'
const MAX_TURNOS = 8 // vueltas modelo → herramientas por pregunta
const MAX_MENSAJES = 30 // historial que se envía al modelo
const MAX_CARACTERES = 4000 // por mensaje

/* ═══════════════════════════════════════
   INSTRUCCIONES DE MOBI
   (texto fijo: no meter fechas ni datos variables aquí,
   para que el prompt se pueda cachear)
   ═══════════════════════════════════════ */

const SYSTEM_PROMPT = `Eres MOBI, el asistente de producción de SULA MOB, el Módulo de Producción de GRUPO AVANT CIM (SULA), una planta que fabrica mobiliario y piezas de metal: corte de lámina, corte láser, corte de tubo, troquel, doblez, punteado, soldadura y pulido, pintura y empaque.

Hablas con administradores de la planta dentro del sistema. Tu trabajo es responder sus preguntas sobre la producción con los datos reales y actuales del sistema, y orientarlos sobre cómo usar el sistema.

Cómo funciona el sistema
- Un proyecto es un pedido de un cliente (código tipo PED-3486). Se crea en Proyectos subiendo el PDF del pedido; el sistema lee el número, cliente, fechas, referencia/sucursal y las partidas.
- Cada proyecto tiene partidas (productos), cada una con su cantidad de piezas.
- Cada partida pasa por las áreas de producción. Por cada partida y área se llevan las piezas completadas contra las piezas totales.
- Cada área tiene un peso en porcentaje. El progreso de una partida es el avance de sus áreas ponderado por esos pesos, y el progreso del proyecto sale del progreso de sus partidas.
- Los operadores registran sus avances (piezas hechas por área y partida) desde su panel, y pueden mandar avisos y reportar retrasos, que llegan como notificaciones.
- Un proyecto está atrasado cuando su fecha de entrega ya pasó y su progreso es menor a 100%.
- Secciones del administrador: Dashboard (indicadores generales), Proyectos (alta de pedidos y avance por partida), Áreas (áreas, pesos y responsables), Notificaciones, Reportes y Usuarios.

Cómo trabajar
- Para cualquier dato de producción (avances, pedidos, áreas, operadores, retrasos, notificaciones) consulta las herramientas antes de responder. Los datos cambian durante el día, así que vuelve a consultar aunque ya los hayas visto antes en la conversación.
- Responde solo con lo que devuelven las herramientas. Si un dato no existe o viene vacío (por ejemplo, un pedido sin fecha de entrega), dilo tal cual en lugar de suponerlo.
- Puedes hacer cuentas con los datos (sumas, porcentajes, comparaciones, qué falta) y señalar lo que merece atención, como cuellos de botella o pedidos en riesgo, siempre que salga de los datos.
- Solo puedes consultar. No puedes crear, modificar ni borrar nada. Si te piden un cambio, explica en qué sección del sistema se hace.
- Nunca compartas contraseñas ni datos de acceso; no tienes acceso a ellos.
- Si la pregunta no tiene que ver con la producción ni con el uso del sistema, dilo con amabilidad y ofrece ayuda con lo que sí puedes consultar.

Cómo responder
- En español, claro y directo, como un compañero que conoce la planta. Empieza por la respuesta.
- Sé breve: lo que preguntaron, con los números que lo respaldan. Ofrece más detalle solo si aporta.
- El chat muestra texto simple: no uses Markdown (nada de asteriscos, almohadillas ni tablas). Para listas usa una línea por elemento empezando con "• ".
- Escribe los porcentajes como 45% y las piezas como 120 de 300.`

/* ═══════════════════════════════════════
   VALIDACIÓN
   ═══════════════════════════════════════ */

interface Sesion {
  rol?: string
  nombre?: string
  correo?: string
}

async function leerSesion(): Promise<Sesion | null> {
  const cookieStore = await cookies()
  const session = cookieStore.get('sula_session')
  if (!session?.value) return null
  try {
    const datos = JSON.parse(session.value)
    return datos && typeof datos === 'object' ? (datos as Sesion) : null
  } catch {
    return null
  }
}

async function esAdmin(): Promise<boolean> {
  return (await leerSesion())?.rol === 'admin'
}

/** Acepta solo { role: 'user' | 'assistant', content: string } y recorta el historial. */
function leerMensajes(body: unknown): Anthropic.Beta.BetaMessageParam[] | null {
  const lista = (body as { messages?: unknown })?.messages
  if (!Array.isArray(lista)) return null

  const mensajes: Anthropic.Beta.BetaMessageParam[] = []
  for (const m of lista) {
    const role = (m as { role?: unknown })?.role
    const content = (m as { content?: unknown })?.content
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null
    const texto = content.trim().slice(0, MAX_CARACTERES)
    if (texto) mensajes.push({ role, content: texto })
  }

  const recientes = mensajes.slice(-MAX_MENSAJES)
  // El historial debe empezar con un mensaje del usuario y terminar con su pregunta
  while (recientes.length && recientes[0].role !== 'user') recientes.shift()
  if (!recientes.length || recientes[recientes.length - 1].role !== 'user') return null
  return recientes
}

function mensajeDeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return 'La API key de MOBI no es válida. Revisa ANTHROPIC_API_KEY.'
  }
  if (err instanceof Anthropic.RateLimitError) {
    return 'MOBI está recibiendo muchas consultas. Intenta de nuevo en un momento.'
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return 'No se pudo conectar con el servicio de IA. Intenta de nuevo.'
  }
  if (err instanceof Anthropic.APIError) {
    return `El servicio de IA respondió con un error (${err.status ?? 'sin código'}). Intenta de nuevo.`
  }
  return 'MOBI tuvo un problema al procesar la consulta. Intenta de nuevo.'
}

/* ═══════════════════════════════════════
   HANDLER GET — nombre del admin para el saludo
   (la cookie de sesión es httpOnly: el navegador no puede leerla)
   ═══════════════════════════════════════ */

export async function GET() {
  const sesion = await leerSesion()
  if (sesion?.rol !== 'admin') {
    return NextResponse.json({ error: 'MOBI solo está disponible para administradores.' }, { status: 403 })
  }

  // Los admins de la tabla usuarios traen el nombre en la sesión;
  // los de Supabase Auth solo el correo, así que se busca por correo.
  let nombre = typeof sesion.nombre === 'string' ? sesion.nombre.trim() : ''
  if (!nombre && typeof sesion.correo === 'string' && sesion.correo) {
    nombre = (await nombrePorCorreo(sesion.correo)) ?? ''
  }

  return NextResponse.json({ nombre }, { headers: { 'Cache-Control': 'no-store' } })
}

/* ═══════════════════════════════════════
   HANDLER POST
   ═══════════════════════════════════════ */

export async function POST(request: NextRequest) {
  if (!(await esAdmin())) {
    return NextResponse.json({ error: 'MOBI solo está disponible para administradores.' }, { status: 403 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'MOBI no está configurado: falta la variable ANTHROPIC_API_KEY.' },
      { status: 503 }
    )
  }

  const messages = leerMensajes(await request.json().catch(() => null))
  if (!messages) {
    return NextResponse.json({ error: 'Mensaje inválido.' }, { status: 400 })
  }

  const client = new Anthropic()
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))

      try {
        let huboTexto = false

        for (let turno = 0; turno < MAX_TURNOS; turno++) {
          let textoEnTurno = false

          const llamada = client.beta.messages.stream(
            {
              model: MODEL,
              max_tokens: 16000,
              // Si el modelo declina una consulta, la API la reintenta en el modelo de respaldo
              betas: ['server-side-fallback-2026-07-01'],
              fallbacks: 'default',
              output_config: { effort: 'medium' },
              cache_control: { type: 'ephemeral' },
              system: [
                { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
                // La fecha va después del bloque cacheado para no invalidarlo cada día
                { type: 'text', text: `Fecha de hoy en la planta: ${fechaHoy()}.` },
              ],
              tools: MOBI_TOOLS,
              messages,
            },
            { signal: request.signal }
          )

          llamada.on('text', delta => {
            // Separa el texto de este turno del que ya se mostró antes de consultar datos
            if (!textoEnTurno && huboTexto) send({ type: 'text', delta: '\n\n' })
            textoEnTurno = true
            huboTexto = true
            send({ type: 'text', delta })
          })

          const respuesta = await llamada.finalMessage()

          if (respuesta.stop_reason === 'refusal') {
            send({ type: 'text', delta: `${huboTexto ? '\n\n' : ''}No puedo ayudar con esa consulta.` })
            break
          }
          if (respuesta.stop_reason !== 'tool_use') {
            if (respuesta.stop_reason === 'max_tokens') {
              send({ type: 'text', delta: '\n\n(La respuesta se cortó por ser muy larga; pide la parte que falte.)' })
            }
            break
          }

          messages.push({ role: 'assistant', content: respuesta.content })

          const llamadas = respuesta.content.filter(
            (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use'
          )
          for (const t of llamadas) {
            send({ type: 'tool', label: MOBI_TOOL_LABELS[t.name] ?? 'Consultando datos' })
          }

          // Todas las consultas en paralelo y sus resultados en un solo mensaje
          const resultados = await Promise.all(
            llamadas.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
              try {
                return { type: 'tool_result', tool_use_id: t.id, content: await runMobiTool(t.name, t.input) }
              } catch (err) {
                console.error(`[mobi] Error en ${t.name}:`, err)
                return {
                  type: 'tool_result',
                  tool_use_id: t.id,
                  is_error: true,
                  content: err instanceof Error ? err.message : 'Error al consultar los datos.',
                }
              }
            })
          )
          messages.push({ role: 'user', content: resultados })

          if (turno === MAX_TURNOS - 1) {
            send({ type: 'text', delta: `${huboTexto ? '\n\n' : ''}Necesité demasiadas consultas para responder. Intenta con una pregunta más específica.` })
          }
        }
      } catch (err) {
        if (!request.signal.aborted) {
          console.error('[mobi] Error:', err)
          send({ type: 'error', message: mensajeDeError(err) })
        }
      } finally {
        // Si el cliente canceló, el stream ya está cerrado
        try { controller.close() } catch {}
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
