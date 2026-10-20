'use server'

// PRUEBA: trabajo por pasos con el despiece del plano (ensambles, subensambles y piezas), por área,
// con reloj (Iniciar → Finalizar) como el registro de siempre.
// Usa sus propias tablas (prueba_despiece_avance y prueba_despiece_trabajos, ver
// sql/prueba_despiece.sql): no toca piezas, relojes, avances ni el progreso que ve el administrador.
// Para quitar la prueba se borra esta carpeta, los enlaces marcados con PRUEBA en la pantalla
// del proyecto y las dos tablas.

import { createClient } from '@/lib/supabase/server'
import { construirMatriz, type Matriz } from '@/lib/matriz-corte'
import { dispositivoDe, tieneAccesoArea } from '@/lib/operador/acceso'
import type { PlantillaBOM } from '@/lib/types'
import { getUsuarioActual, type UsuarioSesion } from '../../../actions'

type Supabase = Awaited<ReturnType<typeof createClient>>

/** Un paso de la fila de trabajo del área: una pieza (corte, doblez) o un subensamble (punteado, soldadura...) */
export interface PasoDespiece {
  clave: string
  tipo: 'pieza' | 'subensamble'
  partidaId: string
  partidaClave: string
  partidaNombre: string
  partidaCantidad: number
  subensamble: string
  nombre: string
  medidas: string
  material: string
  notas: string
  pagina: number | null
  revisar: boolean
  meta: number
  hechas: number
  /** Reloj corriendo en este paso (mio = lo inició este dispositivo) */
  trabajo: { id: string; inicio: string; mio: boolean } | null
}

export interface PartidaResumen {
  id: string
  clave: string
  nombre: string
  cantidad: number
  meta: number
  hechas: number
}

export interface DespieceArea {
  proyectoCodigo: string
  proyectoNombre: string
  areaNombre: string
  /** Qué registra esta área: piezas del plano, o subensambles si el plano no le asigna piezas */
  unidad: 'pieza' | 'subensamble'
  partidas: PartidaResumen[]
  /** En orden de trabajo: producto → subensamble → pieza */
  pasos: PasoDespiece[]
  /** Partidas del proyecto que todavía no tienen plano analizado */
  sinPlano: number
  /** Hora del servidor, para que el reloj de la pantalla no se desfase */
  ahora: string
}

const norm = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** "1508mm × 900mm", o el perfil si es tubo */
function medidas(largo: number | null, ancho: string) {
  const a = ancho?.trim()
  const anchoTxt = a ? (/^\d+(\.\d+)?$/.test(a) ? `${a}mm` : a) : ''
  return [largo !== null ? `${largo}mm` : '', anchoTxt].filter(Boolean).join(' × ')
}

/** "ESCRIT. MB-01: ESCRITORIO CON PEDESTAL..." → "ESCRIT. MB-01" */
function nombreCorto(texto: string) {
  const i = texto.indexOf(':')
  return i > 0 ? texto.slice(0, i).trim() : texto
}

/** Cómo se reconoce un paso aunque el plano se vuelva a numerar */
function clavePieza(subensamble: string, f: { descripcion: string; material: string; largo: number | null; ancho: string }) {
  return [subensamble, f.descripcion, f.material, f.largo ?? '', f.ancho].join('|')
}
const claveSubensamble = (subensamble: string) => `SUB|${subensamble}`

interface PartidaPlano {
  id: string
  clave: string
  nombre: string
  cantidad: number
  matriz: Matriz
}

/** Arma la fila de trabajo del área con lo que ya se registró y los relojes que están corriendo */
async function cargarPasos(
  supabase: Supabase,
  usuario: UsuarioSesion,
  proyectoId: string,
  areaId: string,
  areaNombre: string
): Promise<{ unidad: 'pieza' | 'subensamble'; partidas: PartidaResumen[]; pasos: PasoDespiece[]; sinPlano: number }> {
  const { data: filasPartidas } = await supabase
    .from('partidas')
    .select('id, clave, descripcion, cantidad')
    .eq('proyecto_id', proyectoId)
    .order('orden')

  const partidas = (filasPartidas ?? []) as { id: string; clave: string; descripcion: string | null; cantidad: number | null }[]
  if (partidas.length === 0) return { unidad: 'pieza', partidas: [], pasos: [], sinPlano: 0 }

  const [plantillasRes, registrosRes, trabajosRes] = await Promise.all([
    supabase.from('plantilla_despiece').select('clave, bom').in('clave', [...new Set(partidas.map((p) => p.clave))]),
    supabase
      .from('prueba_despiece_avance')
      .select('partida_id, pieza_clave, piezas')
      .eq('proyecto_id', proyectoId)
      .eq('area_id', areaId),
    supabase
      .from('prueba_despiece_trabajos')
      .select('id, partida_id, pieza_clave, inicio, dispositivo')
      .eq('proyecto_id', proyectoId)
      .eq('area_id', areaId)
      .eq('estado', 'en_curso'),
  ])

  if (registrosRes.error) console.error('Error al traer registros de la prueba (¿ya corriste sql/prueba_despiece.sql?):', registrosRes.error)
  if (trabajosRes.error) console.error('Error al traer relojes de la prueba (¿ya corriste sql/prueba_despiece.sql?):', trabajosRes.error)

  const bomPorClave = new Map<string, PlantillaBOM>()
  ;(plantillasRes.data ?? []).forEach((f) => bomPorClave.set(f.clave as string, f.bom as PlantillaBOM))

  const hechasPor = new Map<string, number>()
  ;(registrosRes.data ?? []).forEach((r) => {
    const k = `${r.partida_id}#${r.pieza_clave}`
    hechasPor.set(k, (hechasPor.get(k) ?? 0) + ((r.piezas as number) ?? 0))
  })

  const miDispositivo = dispositivoDe(usuario)
  const trabajoPor = new Map<string, { id: string; inicio: string; mio: boolean }>()
  ;(trabajosRes.data ?? []).forEach((t) =>
    trabajoPor.set(`${t.partida_id}#${t.pieza_clave}`, {
      id: t.id as string,
      inicio: t.inicio as string,
      mio: t.dispositivo === miDispositivo,
    })
  )

  let sinPlano = 0
  const conPlano: PartidaPlano[] = []
  for (const p of partidas) {
    const bom = bomPorClave.get(p.clave)
    if (!bom) {
      sinPlano++
      continue
    }
    const cantidad = Math.max(1, p.cantidad ?? 1)
    const descripcion = p.descripcion ?? bom.descripcion ?? ''
    conPlano.push({
      id: p.id,
      clave: p.clave,
      nombre: nombreCorto(descripcion),
      cantidad,
      matriz: construirMatriz(bom, { clave: p.clave, descripcion, cantidad, cliente: '', proyecto: '', fecha: '' }),
    })
  }

  // Si el plano le asigna piezas a esta área (corte, doblez...), se trabaja por pieza;
  // si no (punteado, soldadura, pintura...), se trabaja por subensamble
  const areaBuscada = norm(areaNombre)
  const esDelArea = (area: string) => norm(area) === areaBuscada
  const unidad = conPlano.some((p) => p.matriz.secciones.some((s) => s.filas.some((f) => esDelArea(f.area) && f.total > 0)))
    ? 'pieza'
    : 'subensamble'

  const pasos: PasoDespiece[] = []
  for (const p of conPlano) {
    const base = {
      partidaId: p.id,
      partidaClave: p.clave,
      partidaNombre: p.nombre,
      partidaCantidad: p.cantidad,
    }
    const conRegistro = (paso: PasoDespiece): PasoDespiece => {
      const k = `${p.id}#${paso.clave}`
      return { ...paso, hechas: Math.min(paso.meta, hechasPor.get(k) ?? 0), trabajo: trabajoPor.get(k) ?? null }
    }

    for (const seccion of p.matriz.secciones) {
      if (unidad === 'subensamble') {
        if (seccion.nombre === 'HERRAJE DE ARMADO') continue
        pasos.push(
          conRegistro({
            ...base,
            clave: claveSubensamble(seccion.nombre),
            tipo: 'subensamble',
            subensamble: seccion.nombre,
            nombre: seccion.nombre,
            medidas: '',
            material: '',
            notas: `${seccion.filas.length} ${seccion.filas.length === 1 ? 'componente' : 'componentes'}`,
            pagina: seccion.pagina,
            revisar: false,
            meta: seccion.cantidad * p.cantidad,
            hechas: 0,
            trabajo: null,
          })
        )
        continue
      }

      // Piezas iguales dentro del mismo subensamble se juntan en un solo paso
      const delArea = new Map<string, PasoDespiece>()
      for (const f of seccion.filas) {
        if (!esDelArea(f.area) || f.total <= 0) continue
        const clave = clavePieza(seccion.nombre, f)
        const previo = delArea.get(clave)
        if (previo) {
          previo.meta += f.total
          continue
        }
        delArea.set(clave, {
          ...base,
          clave,
          tipo: 'pieza',
          subensamble: seccion.nombre,
          nombre: f.descripcion,
          medidas: medidas(f.largo, f.ancho),
          material: f.material,
          notas: f.notas,
          pagina: f.pagina,
          revisar: f.revisar,
          meta: f.total,
          hechas: 0,
          trabajo: null,
        })
      }
      for (const paso of delArea.values()) pasos.push(conRegistro(paso))
    }
  }

  const resumen: PartidaResumen[] = conPlano
    .map((p) => {
      const suyos = pasos.filter((x) => x.partidaId === p.id)
      return {
        id: p.id,
        clave: p.clave,
        nombre: p.nombre,
        cantidad: p.cantidad,
        meta: suyos.reduce((s, x) => s + x.meta, 0),
        hechas: suyos.reduce((s, x) => s + x.hechas, 0),
      }
    })
    .filter((p) => p.meta > 0)

  return { unidad, partidas: resumen, pasos, sinPlano }
}

async function nombreArea(supabase: Supabase, areaId: string) {
  const { data } = await supabase.from('areas').select('nombre').eq('id', areaId).maybeSingle()
  return (data?.nombre as string | undefined) ?? null
}

const SIN_ACCESO = 'Esta área está bloqueada en este dispositivo. Regresa y entra con su clave.'

export async function getDespieceArea(
  proyectoId: string,
  areaId: string
): Promise<{ data?: DespieceArea; error?: string }> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  const supabase = await createClient()
  if (!(await tieneAccesoArea(supabase, usuario, areaId))) return { error: SIN_ACCESO }

  const [area, proyectoRes] = await Promise.all([
    nombreArea(supabase, areaId),
    supabase.from('proyectos').select('codigo, nombre').eq('id', proyectoId).maybeSingle(),
  ])
  if (!area) return { error: 'No se encontró el área.' }
  if (!proyectoRes.data) return { error: 'No se encontró el proyecto.' }

  const { unidad, partidas, pasos, sinPlano } = await cargarPasos(supabase, usuario, proyectoId, areaId, area)

  return {
    data: {
      proyectoCodigo: (proyectoRes.data.codigo as string | null) ?? '',
      proyectoNombre: proyectoRes.data.nombre as string,
      areaNombre: area,
      unidad,
      partidas,
      pasos,
      sinPlano,
      ahora: new Date().toISOString(),
    },
  }
}

/** Busca el paso en el plano (no se confía en lo que mande la pantalla) */
async function buscarPaso(
  supabase: Supabase,
  usuario: UsuarioSesion,
  proyectoId: string,
  areaId: string,
  partidaId: string,
  clave: string
): Promise<{ paso?: PasoDespiece; error?: string }> {
  if (!(await tieneAccesoArea(supabase, usuario, areaId))) return { error: SIN_ACCESO }
  const area = await nombreArea(supabase, areaId)
  if (!area) return { error: 'No se encontró el área.' }
  const { pasos } = await cargarPasos(supabase, usuario, proyectoId, areaId, area)
  const paso = pasos.find((p) => p.partidaId === partidaId && p.clave === clave)
  return paso ? { paso } : { error: 'No se encontró este paso en tu área.' }
}

/** ▶ Iniciar: arranca el reloj del paso */
export async function iniciarPaso(
  proyectoId: string,
  areaId: string,
  partidaId: string,
  clave: string
): Promise<{ error?: string }> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  const supabase = await createClient()
  const { paso, error } = await buscarPaso(supabase, usuario, proyectoId, areaId, partidaId, clave)
  if (!paso) return { error }
  if (paso.hechas >= paso.meta) return { error: 'Este paso ya está terminado.' }
  if (paso.trabajo) return { error: paso.trabajo.mio ? 'Ya lo tienes iniciado.' : 'Otro operador ya lo está haciendo.' }

  const { error: errorAlta } = await supabase.from('prueba_despiece_trabajos').insert({
    proyecto_id: proyectoId,
    area_id: areaId,
    partida_id: partidaId,
    pieza_clave: clave,
    operador_id: usuario.id,
    dispositivo: dispositivoDe(usuario),
  })
  if (errorAlta) {
    console.error('Error al iniciar en la prueba de despiece:', errorAlta)
    return { error: `No se pudo iniciar (${errorAlta.message}).` }
  }
  return {}
}

/** ■ Finalizar: detiene el reloj y suma las piezas hechas (nunca más de las que faltan) */
export async function finalizarPaso(
  proyectoId: string,
  areaId: string,
  partidaId: string,
  clave: string,
  cantidad: number
): Promise<{ error?: string; terminado?: boolean }> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }
  if (!Number.isInteger(cantidad) || cantidad <= 0) return { error: 'Escribe cuántas hiciste.' }

  const supabase = await createClient()
  const { paso, error } = await buscarPaso(supabase, usuario, proyectoId, areaId, partidaId, clave)
  if (!paso) return { error }
  if (!paso.trabajo) return { error: 'Este paso no tiene el reloj corriendo.' }

  const faltan = paso.meta - paso.hechas
  if (cantidad > faltan) return { error: `Solo faltan ${faltan}.` }

  const { error: errorAvance } = await supabase.from('prueba_despiece_avance').insert({
    proyecto_id: proyectoId,
    area_id: areaId,
    partida_id: partidaId,
    pieza_clave: clave,
    piezas: cantidad,
    operador_id: usuario.id,
    dispositivo: dispositivoDe(usuario),
  })
  if (errorAvance) {
    console.error('Error al registrar en la prueba de despiece:', errorAvance)
    return { error: `No se pudo registrar (${errorAvance.message}).` }
  }

  const { error: errorReloj } = await supabase
    .from('prueba_despiece_trabajos')
    .update({ estado: 'finalizado', fin: new Date().toISOString(), piezas: cantidad })
    .eq('id', paso.trabajo.id)
  if (errorReloj) console.error('Se registraron las piezas, pero no se cerró el reloj:', errorReloj)

  return { terminado: cantidad >= faltan }
}

/** Cancelar un inicio hecho por error: borra el reloj sin registrar piezas */
export async function cancelarPaso(
  proyectoId: string,
  areaId: string,
  partidaId: string,
  clave: string
): Promise<{ error?: string }> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  const supabase = await createClient()
  const { paso, error } = await buscarPaso(supabase, usuario, proyectoId, areaId, partidaId, clave)
  if (!paso) return { error }
  if (!paso.trabajo) return {}

  const { error: errorBaja } = await supabase.from('prueba_despiece_trabajos').delete().eq('id', paso.trabajo.id)
  if (errorBaja) return { error: 'No se pudo cancelar.' }
  return {}
}

/** Quita el último registro que hizo ESTE dispositivo en ese paso (para corregir un error) */
export async function deshacerPaso(
  proyectoId: string,
  areaId: string,
  partidaId: string,
  clave: string
): Promise<{ error?: string }> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  const supabase = await createClient()
  if (!(await tieneAccesoArea(supabase, usuario, areaId))) return { error: SIN_ACCESO }

  const { data: ultimo } = await supabase
    .from('prueba_despiece_avance')
    .select('id')
    .eq('proyecto_id', proyectoId)
    .eq('area_id', areaId)
    .eq('partida_id', partidaId)
    .eq('pieza_clave', clave)
    .eq('dispositivo', dispositivoDe(usuario))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!ultimo) return { error: 'Solo se puede deshacer lo que se registró desde este dispositivo.' }

  const { error } = await supabase.from('prueba_despiece_avance').delete().eq('id', ultimo.id)
  if (error) return { error: 'No se pudo deshacer.' }
  return {}
}
