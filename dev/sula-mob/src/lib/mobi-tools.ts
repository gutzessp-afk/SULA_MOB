/**
 * mobi-tools.ts
 * ─────────────
 * Herramientas de SOLO LECTURA que MOBI (el asistente de IA) usa para
 * consultar la producción en vivo desde Supabase. Cada pregunta vuelve
 * a consultar la base, así MOBI siempre responde con datos actuales.
 *
 * Solo se ejecuta en el servidor (lo importa /api/mobi/route.ts).
 * Ninguna herramienta escribe en la base ni expone password_hash.
 *
 * RUTA: src/lib/mobi-tools.ts
 */

import type Anthropic from '@anthropic-ai/sdk'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/* ═══════════════════════════════════════
   TIPOS DE LAS TABLAS (solo lo que se lee)
   ═══════════════════════════════════════ */

interface Proyecto {
  id: string
  codigo: string | null
  nombre: string | null
  cliente: string | null
  descripcion: string | null
  prioridad: string | null
  progreso: number | null
  created_at: string
}

interface Producto {
  id: string
  proyecto_id: string
  nombre: string | null
  cantidad: number | null
  progreso: number | null
}

interface AvanceArea {
  producto_id: string
  area_id: string
  piezas_completadas: number | null
  piezas_totales: number | null
}

interface Area {
  id: string
  nombre: string
  peso: number | null
  activo: boolean | null
  responsable_id: string | null
}

interface Usuario {
  id: string
  nombre: string | null
  apellidos: string | null
  username: string | null
  correo: string | null
  rol_id: string | null
  area_id: string | null
  activo: boolean | null
}

interface AvanceRegistro {
  proyecto_id: string | null
  producto_id: string | null
  area_id: string | null
  operador_id: string | null
  piezas: number | null
  operacion: string | null
  actividad: string | null
  comentario: string | null
  problemas: string | null
  hora_inicio: string | null
  created_at: string
}

interface Notificacion {
  remitente_id: string | null
  destinatario_id: string | null
  proyecto_id: string | null
  tipo: string | null
  mensaje: string | null
  leida: boolean | null
  created_at: string
}

/* ═══════════════════════════════════════
   UTILIDADES
   ═══════════════════════════════════════ */

function getSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

/** Supabase devuelve máximo 1000 filas por consulta — se pagina para traer todas. */
async function fetchAll<T>(supabase: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const PAGE = 1000
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`Error consultando ${table}: ${error.message}`)
    rows.push(...((data ?? []) as unknown as T[]))
    if (!data || data.length < PAGE) break
  }
  return rows
}

const pct = (hechas: number, total: number) => (total > 0 ? Math.round((hechas / total) * 100) : 0)

const nombreCompleto = (u?: Usuario) => (u ? `${u.nombre ?? ''} ${u.apellidos ?? ''}`.trim() : null)

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

function entero(v: unknown, porDefecto: number, min: number, max: number) {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return porDefecto
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** Fecha de hoy en la zona horaria de la planta (YYYY-MM-DD). */
export function fechaHoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
}

/** proyectos.descripcion guarda "Fecha: … | Entrega: … | Ref: … | Elaboró: …" */
function datosDeDescripcion(descripcion: string | null) {
  const d = descripcion ?? ''
  const campo = (re: RegExp) => d.match(re)?.[1]?.trim() || null
  return {
    fecha_pedido: campo(/Fecha:\s*([^|]+)/),
    fecha_entrega: campo(/Entrega:\s*([^|]+)/),
    referencia_sucursal: campo(/Ref:\s*([^|]+)/),
    elaborado_por: campo(/Elabor[oó]:\s*([^|]+)/),
  }
}

/** Mismo criterio que el Dashboard: atrasado = fecha de entrega vencida y progreso < 100. */
function estadoProyecto(progreso: number, fechaEntrega: string | null, hoy: string) {
  if (progreso >= 100) return 'Finalizado'
  if (fechaEntrega && /^\d{4}-\d{2}-\d{2}/.test(fechaEntrega) && fechaEntrega.slice(0, 10) < hoy) return 'Atrasado'
  return progreso > 0 ? 'En proceso' : 'Sin iniciar'
}

function resumenProyecto(p: Proyecto, hoy: string) {
  const datos = datosDeDescripcion(p.descripcion)
  const progreso = p.progreso ?? 0
  return {
    codigo: p.codigo,
    nombre: p.nombre,
    cliente: p.cliente,
    prioridad: p.prioridad,
    progreso_pct: progreso,
    estado: estadoProyecto(progreso, datos.fecha_entrega, hoy),
    ...datos,
    creado: p.created_at?.slice(0, 10),
  }
}

/* ═══════════════════════════════════════
   DEFINICIÓN DE HERRAMIENTAS (lo que ve el modelo)
   ═══════════════════════════════════════ */

export const MOBI_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'resumen_produccion',
    description:
      'Panorama general de la producción en este momento: todos los proyectos/pedidos con su progreso, estado y fecha de entrega; avance global de cada área; y notificaciones sin leer por tipo. Úsala primero para preguntas generales ("¿cómo vamos?", "¿qué pedidos están atrasados?", "¿cuántos proyectos hay?").',
    eager_input_streaming: true,
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'detalle_proyecto',
    description:
      'Detalle de un proyecto/pedido: datos generales y cada partida (producto) con su cantidad, progreso y piezas completadas por área. Úsala cuando pregunten por un pedido específico, sus partidas o qué le falta.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        proyecto: {
          type: 'string',
          description: 'Código o nombre del proyecto, completo o parcial. Ejemplos: "PED-3486", "3486", "Pedido 3492".',
        },
      },
      required: ['proyecto'],
      additionalProperties: false,
    },
  },
  {
    name: 'avance_por_area',
    description:
      'Avance por área de producción (Corte, Doblez, Soldadura, Pintura, etc.): piezas completadas contra totales, desglosado por proyecto. Si se indica un área, incluye además las partidas pendientes en esa área. Úsala para cuellos de botella y carga de trabajo por área.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        area: {
          type: 'string',
          description: 'Nombre del área, completo o parcial (ej. "Pintura", "Soldadura"). Omitir para ver todas las áreas.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'avances_recientes',
    description:
      'Bitácora de avances registrados por los operadores: quién, cuándo, en qué área, proyecto y partida, cuántas piezas, operación, comentarios y problemas reportados. Úsala para "¿qué se hizo hoy/esta semana?" o "¿qué ha registrado tal operador?".',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        dias: { type: 'integer', description: 'Cuántos días hacia atrás consultar (1 = solo hoy). Por defecto 7.' },
        limite: { type: 'integer', description: 'Máximo de registros a devolver. Por defecto 50.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'notificaciones',
    description:
      'Notificaciones del sistema: retrasos, avisos y nuevos proyectos, con remitente, destinatario, proyecto y si ya fueron leídas. Úsala para incidencias y retrasos reportados.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['retraso', 'aviso', 'nuevo_proyecto'], description: 'Filtrar por tipo.' },
        solo_no_leidas: { type: 'boolean', description: 'true para traer solo las no leídas.' },
        limite: { type: 'integer', description: 'Máximo de notificaciones (las más recientes primero). Por defecto 30.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'usuarios_y_areas',
    description:
      'Personal y áreas: usuarios con su rol, área asignada y si están activos; y áreas con su peso en el avance y su responsable. Úsala para "¿quién es el responsable de…?" o "¿qué operadores hay?".',
    eager_input_streaming: true,
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
]

/* ═══════════════════════════════════════
   IMPLEMENTACIÓN
   ═══════════════════════════════════════ */

const COLS_PROYECTO = 'id, codigo, nombre, cliente, descripcion, prioridad, progreso, created_at'
const COLS_PRODUCTO = 'id, proyecto_id, nombre, cantidad, progreso'
const COLS_AVANCE_AREA = 'producto_id, area_id, piezas_completadas, piezas_totales'
const COLS_AREA = 'id, nombre, peso, activo, responsable_id'
const COLS_USUARIO = 'id, nombre, apellidos, username, correo, rol_id, area_id, activo'

async function resumenProduccion(supabase: SupabaseClient) {
  const hoy = fechaHoy()
  const [proyectos, productos, matriz, areas, notifs] = await Promise.all([
    fetchAll<Proyecto>(supabase, 'proyectos', COLS_PROYECTO),
    fetchAll<Producto>(supabase, 'proyecto_productos', COLS_PRODUCTO),
    fetchAll<AvanceArea>(supabase, 'producto_area_avance', COLS_AVANCE_AREA),
    fetchAll<Area>(supabase, 'areas', COLS_AREA),
    fetchAll<Notificacion>(supabase, 'notificaciones', 'tipo, leida, created_at'),
  ])

  const porArea = new Map<string, { hechas: number; total: number }>()
  for (const m of matriz) {
    const a = porArea.get(m.area_id) ?? { hechas: 0, total: 0 }
    a.hechas += m.piezas_completadas ?? 0
    a.total += m.piezas_totales ?? 0
    porArea.set(m.area_id, a)
  }

  const sinLeer: Record<string, number> = {}
  for (const n of notifs) {
    if (!n.leida) sinLeer[n.tipo ?? 'otro'] = (sinLeer[n.tipo ?? 'otro'] ?? 0) + 1
  }

  return {
    fecha_actual: hoy,
    total_proyectos: proyectos.length,
    proyectos: proyectos.map(p => {
      const prods = productos.filter(x => x.proyecto_id === p.id)
      return {
        ...resumenProyecto(p, hoy),
        partidas: prods.length,
        piezas_pedidas: prods.reduce((s, x) => s + (x.cantidad ?? 0), 0),
      }
    }),
    areas: areas.map(a => {
      const t = porArea.get(a.id) ?? { hechas: 0, total: 0 }
      return {
        area: a.nombre,
        activa: a.activo,
        peso_pct: a.peso,
        piezas_completadas: t.hechas,
        piezas_totales: t.total,
        avance_pct: pct(t.hechas, t.total),
      }
    }),
    notificaciones_sin_leer: sinLeer,
  }
}

async function detalleProyecto(supabase: SupabaseClient, input: Record<string, unknown>) {
  const busqueda = texto(input.proyecto).toLowerCase()
  if (!busqueda) return { error: 'Falta indicar el código o nombre del proyecto.' }

  const hoy = fechaHoy()
  const proyectos = await fetchAll<Proyecto>(supabase, 'proyectos', COLS_PROYECTO)
  const coincide = (p: Proyecto) =>
    (p.codigo ?? '').toLowerCase().includes(busqueda) || (p.nombre ?? '').toLowerCase().includes(busqueda)
  const exacto = proyectos.filter(p => (p.codigo ?? '').toLowerCase() === busqueda)
  const encontrados = exacto.length ? exacto : proyectos.filter(coincide)

  if (encontrados.length === 0) {
    return {
      error: `No hay ningún proyecto que coincida con "${texto(input.proyecto)}".`,
      proyectos_existentes: proyectos.map(p => ({ codigo: p.codigo, nombre: p.nombre })),
    }
  }
  if (encontrados.length > 1) {
    return {
      aviso: 'Varios proyectos coinciden; pide al usuario que precise cuál.',
      coincidencias: encontrados.map(p => resumenProyecto(p, hoy)),
    }
  }

  const proyecto = encontrados[0]
  const [{ data: prods, error: e1 }, areas] = await Promise.all([
    supabase.from('proyecto_productos').select(COLS_PRODUCTO).eq('proyecto_id', proyecto.id).order('created_at'),
    fetchAll<Area>(supabase, 'areas', COLS_AREA),
  ])
  if (e1) throw new Error(`Error consultando partidas: ${e1.message}`)
  const productos = (prods ?? []) as Producto[]

  let matriz: AvanceArea[] = []
  if (productos.length) {
    const { data, error } = await supabase
      .from('producto_area_avance')
      .select(COLS_AVANCE_AREA)
      .in('producto_id', productos.map(p => p.id))
      .limit(5000)
    if (error) throw new Error(`Error consultando avance por área: ${error.message}`)
    matriz = (data ?? []) as AvanceArea[]
  }

  const nombreArea = new Map(areas.map(a => [a.id, a.nombre]))
  return {
    fecha_actual: hoy,
    proyecto: resumenProyecto(proyecto, hoy),
    total_partidas: productos.length,
    // piezas_por_area: "completadas/totales" de cada área para esa partida
    partidas: productos.map(p => ({
      partida: p.nombre,
      cantidad: p.cantidad,
      progreso_pct: p.progreso ?? 0,
      piezas_por_area: Object.fromEntries(
        matriz
          .filter(m => m.producto_id === p.id)
          .map(m => [nombreArea.get(m.area_id) ?? 'Área', `${m.piezas_completadas ?? 0}/${m.piezas_totales ?? 0}`])
      ),
    })),
  }
}

async function avancePorArea(supabase: SupabaseClient, input: Record<string, unknown>) {
  const filtro = texto(input.area).toLowerCase()
  const [areas, proyectos, productos, matriz, usuarios] = await Promise.all([
    fetchAll<Area>(supabase, 'areas', COLS_AREA),
    fetchAll<Proyecto>(supabase, 'proyectos', COLS_PROYECTO),
    fetchAll<Producto>(supabase, 'proyecto_productos', COLS_PRODUCTO),
    fetchAll<AvanceArea>(supabase, 'producto_area_avance', COLS_AVANCE_AREA),
    fetchAll<Usuario>(supabase, 'usuarios', COLS_USUARIO),
  ])

  const seleccion = filtro ? areas.filter(a => a.nombre.toLowerCase().includes(filtro)) : areas
  if (seleccion.length === 0) {
    return { error: `No hay ningún área que coincida con "${texto(input.area)}".`, areas_existentes: areas.map(a => a.nombre) }
  }

  const producto = new Map(productos.map(p => [p.id, p]))
  const proyecto = new Map(proyectos.map(p => [p.id, p]))
  const usuario = new Map(usuarios.map(u => [u.id, u]))
  const MAX_PENDIENTES = 60

  return {
    fecha_actual: fechaHoy(),
    areas: seleccion.map(a => {
      const filas = matriz.filter(m => m.area_id === a.id)
      const porProyecto = new Map<string, { hechas: number; total: number }>()
      let hechas = 0
      let total = 0
      for (const m of filas) {
        const prj = producto.get(m.producto_id)?.proyecto_id ?? 'sin-proyecto'
        const t = porProyecto.get(prj) ?? { hechas: 0, total: 0 }
        t.hechas += m.piezas_completadas ?? 0
        t.total += m.piezas_totales ?? 0
        porProyecto.set(prj, t)
        hechas += m.piezas_completadas ?? 0
        total += m.piezas_totales ?? 0
      }

      const pendientes = filas.filter(m => (m.piezas_completadas ?? 0) < (m.piezas_totales ?? 0))
      return {
        area: a.nombre,
        activa: a.activo,
        peso_pct: a.peso,
        responsable: nombreCompleto(usuario.get(a.responsable_id ?? '')),
        piezas_completadas: hechas,
        piezas_totales: total,
        piezas_pendientes: total - hechas,
        avance_pct: pct(hechas, total),
        partidas_pendientes: pendientes.length,
        por_proyecto: [...porProyecto.entries()].map(([id, t]) => ({
          proyecto: proyecto.get(id)?.codigo ?? proyecto.get(id)?.nombre ?? 'Sin proyecto',
          piezas_completadas: t.hechas,
          piezas_totales: t.total,
          avance_pct: pct(t.hechas, t.total),
        })),
        // El detalle de partidas solo se incluye cuando se pide un área concreta
        ...(filtro && {
          detalle_pendientes: pendientes.slice(0, MAX_PENDIENTES).map(m => {
            const p = producto.get(m.producto_id)
            return {
              proyecto: proyecto.get(p?.proyecto_id ?? '')?.codigo ?? null,
              partida: p?.nombre ?? null,
              piezas: `${m.piezas_completadas ?? 0}/${m.piezas_totales ?? 0}`,
            }
          }),
          ...(pendientes.length > MAX_PENDIENTES && {
            nota: `Se muestran ${MAX_PENDIENTES} de ${pendientes.length} partidas pendientes.`,
          }),
        }),
      }
    }),
  }
}

async function avancesRecientes(supabase: SupabaseClient, input: Record<string, unknown>) {
  const dias = entero(input.dias, 7, 1, 365)
  const limite = entero(input.limite, 50, 1, 200)
  // "1 día" = desde las 00:00 de hoy en la planta (UTC-6)
  const desde = new Date(`${fechaHoy()}T00:00:00-06:00`)
  desde.setDate(desde.getDate() - (dias - 1))

  const [{ data, error, count }, areas, proyectos, productos, usuarios] = await Promise.all([
    supabase
      .from('avances')
      .select(
        'proyecto_id, producto_id, area_id, operador_id, piezas, operacion, actividad, comentario, problemas, hora_inicio, created_at',
        { count: 'exact' }
      )
      .gte('created_at', desde.toISOString())
      .order('created_at', { ascending: false })
      .limit(limite),
    fetchAll<Area>(supabase, 'areas', COLS_AREA),
    fetchAll<Proyecto>(supabase, 'proyectos', COLS_PROYECTO),
    fetchAll<Producto>(supabase, 'proyecto_productos', COLS_PRODUCTO),
    fetchAll<Usuario>(supabase, 'usuarios', COLS_USUARIO),
  ])
  if (error) throw new Error(`Error consultando avances: ${error.message}`)

  const area = new Map(areas.map(a => [a.id, a.nombre]))
  const proyecto = new Map(proyectos.map(p => [p.id, p.codigo ?? p.nombre]))
  const producto = new Map(productos.map(p => [p.id, p.nombre]))
  const usuario = new Map(usuarios.map(u => [u.id, u]))

  return {
    fecha_actual: fechaHoy(),
    periodo: `últimos ${dias} día(s)`,
    total_en_periodo: count ?? data?.length ?? 0,
    mostrados: data?.length ?? 0,
    avances: ((data ?? []) as AvanceRegistro[]).map(a => ({
      registrado: a.created_at,
      hora_inicio: a.hora_inicio,
      operador: nombreCompleto(usuario.get(a.operador_id ?? '')),
      area: area.get(a.area_id ?? '') ?? null,
      proyecto: proyecto.get(a.proyecto_id ?? '') ?? null,
      partida: producto.get(a.producto_id ?? '') ?? null,
      piezas: a.piezas,
      operacion: a.operacion,
      actividad: a.actividad,
      comentario: a.comentario,
      problemas: a.problemas,
    })),
  }
}

async function notificaciones(supabase: SupabaseClient, input: Record<string, unknown>) {
  const limite = entero(input.limite, 30, 1, 100)
  const tipo = texto(input.tipo)

  let query = supabase
    .from('notificaciones')
    .select('remitente_id, destinatario_id, proyecto_id, tipo, mensaje, leida, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(limite)
  if (['retraso', 'aviso', 'nuevo_proyecto'].includes(tipo)) query = query.eq('tipo', tipo)
  if (input.solo_no_leidas === true) query = query.eq('leida', false)

  const [{ data, error, count }, proyectos, usuarios] = await Promise.all([
    query,
    fetchAll<Proyecto>(supabase, 'proyectos', COLS_PROYECTO),
    fetchAll<Usuario>(supabase, 'usuarios', COLS_USUARIO),
  ])
  if (error) throw new Error(`Error consultando notificaciones: ${error.message}`)

  const proyecto = new Map(proyectos.map(p => [p.id, p.codigo ?? p.nombre]))
  const usuario = new Map(usuarios.map(u => [u.id, u]))

  return {
    fecha_actual: fechaHoy(),
    total_que_coinciden: count ?? data?.length ?? 0,
    mostradas: data?.length ?? 0,
    notificaciones: ((data ?? []) as Notificacion[]).map(n => ({
      fecha: n.created_at,
      tipo: n.tipo,
      mensaje: n.mensaje,
      leida: n.leida,
      remitente: nombreCompleto(usuario.get(n.remitente_id ?? '')),
      destinatario: nombreCompleto(usuario.get(n.destinatario_id ?? '')),
      proyecto: proyecto.get(n.proyecto_id ?? '') ?? null,
    })),
  }
}

async function usuariosYAreas(supabase: SupabaseClient) {
  const [usuarios, areas, { data: roles, error }] = await Promise.all([
    fetchAll<Usuario>(supabase, 'usuarios', COLS_USUARIO),
    fetchAll<Area>(supabase, 'areas', COLS_AREA),
    supabase.from('roles').select('id, nombre'),
  ])
  if (error) throw new Error(`Error consultando roles: ${error.message}`)

  const rol = new Map((roles ?? []).map(r => [r.id as string, r.nombre as string]))
  const area = new Map(areas.map(a => [a.id, a.nombre]))
  const usuario = new Map(usuarios.map(u => [u.id, u]))

  return {
    usuarios: usuarios.map(u => ({
      nombre: nombreCompleto(u),
      username: u.username,
      correo: u.correo,
      rol: rol.get(u.rol_id ?? '') ?? null,
      area: area.get(u.area_id ?? '') ?? null,
      activo: u.activo,
    })),
    areas: areas.map(a => ({
      area: a.nombre,
      activa: a.activo,
      peso_pct: a.peso,
      responsable: nombreCompleto(usuario.get(a.responsable_id ?? '')),
    })),
  }
}

/** Nombre completo del usuario con ese correo (para el saludo de MOBI). */
export async function nombrePorCorreo(correo: string): Promise<string | null> {
  const { data } = await getSupabase()
    .from('usuarios')
    .select('nombre, apellidos')
    .eq('correo', correo)
    .maybeSingle()
  if (!data) return null
  return `${data.nombre ?? ''} ${data.apellidos ?? ''}`.trim() || null
}

/* ═══════════════════════════════════════
   DESPACHADOR
   ═══════════════════════════════════════ */

/** Texto corto que la interfaz muestra mientras se ejecuta cada herramienta. */
export const MOBI_TOOL_LABELS: Record<string, string> = {
  resumen_produccion: 'Revisando el estado de la producción',
  detalle_proyecto: 'Consultando el proyecto',
  avance_por_area: 'Revisando el avance por área',
  avances_recientes: 'Leyendo los avances registrados',
  notificaciones: 'Revisando notificaciones',
  usuarios_y_areas: 'Consultando personal y áreas',
}

/**
 * Ejecuta una herramienta y devuelve el resultado como JSON en texto.
 * La entrada viene del modelo: se valida aquí antes de usarla.
 */
export async function runMobiTool(name: string, rawInput: unknown): Promise<string> {
  const input = rawInput && typeof rawInput === 'object' ? (rawInput as Record<string, unknown>) : {}
  const supabase = getSupabase()

  switch (name) {
    case 'resumen_produccion':
      return JSON.stringify(await resumenProduccion(supabase))
    case 'detalle_proyecto':
      return JSON.stringify(await detalleProyecto(supabase, input))
    case 'avance_por_area':
      return JSON.stringify(await avancePorArea(supabase, input))
    case 'avances_recientes':
      return JSON.stringify(await avancesRecientes(supabase, input))
    case 'notificaciones':
      return JSON.stringify(await notificaciones(supabase, input))
    case 'usuarios_y_areas':
      return JSON.stringify(await usuariosYAreas(supabase))
    default:
      throw new Error(`Herramienta desconocida: ${name}`)
  }
}
