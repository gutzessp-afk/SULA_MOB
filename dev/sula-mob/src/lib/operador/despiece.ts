// src/lib/operador/despiece.ts
// Despiece del plano → piezas del operador por área. Solo se importa desde acciones de servidor.
//
// Cuando el admin analiza el plano de una partida (plantilla_despiece), sus piezas se reparten
// solas en piezas_proyecto, una fila por pieza y área (origen = 'despiece'). Así el operador las
// registra con el flujo oficial (reloj, pausas, reportes, evidencia en PDF).
//   - Áreas a las que el plano les asigna piezas (corte, doblez...): una fila por pieza.
//   - Áreas sin piezas en el plano (punteado, soldadura, pintura...): una fila por subensamble.
// Cada registro también actualiza producto_area_avance, partida y proyecto, que es lo que lee el
// administrador: así lo ve en automático sin cambiar sus pantallas.
//
// Para quitarlo: sql/despiece_operador.sql trae el bloque que borra estas piezas.

import { construirMatriz } from '@/lib/matriz-corte'
import type { createClient } from '@/lib/supabase/server'
import type { PlantillaBOM } from '@/lib/types'

type Supabase = Awaited<ReturnType<typeof createClient>>

export const ORIGEN_DESPIECE = 'despiece'
const SEPARADOR = ' › '

const norm = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** "1508 × 900 mm", o el perfil si es tubo */
function medidas(largo: number | null, ancho: string) {
  const a = ancho?.trim()
  const anchoTxt = a ? (/^\d+(\.\d+)?$/.test(a) ? `${a} mm` : a) : ''
  if (largo === null) return anchoTxt
  return anchoTxt ? `${largo} × ${anchoTxt}` : `${largo} mm`
}

/** "ESCRIT. MB-01: ESCRITORIO CON PEDESTAL..." → "ESCRIT. MB-01" */
function nombreCorto(texto: string) {
  const i = texto.indexOf(':')
  return i > 0 ? texto.slice(0, i).trim() : texto.trim()
}

/** La clave de partida va al inicio de origen_clave: "2-1-0072-0001#..." */
export const partidaDeOrigen = (origenClave: string) => origenClave.slice(0, origenClave.indexOf('#'))

/** "ESCRIT. MB-01 ×3 › FALDON ARMADO" → { producto: "ESCRIT. MB-01 ×3", subensamble: "FALDON ARMADO" } */
export function partirModulo(modulo: string | null) {
  const texto = modulo ?? ''
  const i = texto.indexOf(SEPARADOR)
  return i < 0
    ? { producto: texto || 'Sin producto', subensamble: '' }
    : { producto: texto.slice(0, i), subensamble: texto.slice(i + SEPARADOR.length) }
}

interface FilaDeseada {
  area_id: string
  origen_clave: string
  descripcion: string
  modulo: string
  material: string | null
  medidas: string | null
  notas: string | null
  meta: number
  orden: number
}

/** Calcula las piezas por área que deben existir según los planos analizados del proyecto */
async function piezasDelPlano(supabase: Supabase, proyectoId: string): Promise<FilaDeseada[] | null> {
  const [partidasRes, areasRes] = await Promise.all([
    supabase.from('partidas').select('clave, descripcion, cantidad').eq('proyecto_id', proyectoId).order('orden'),
    supabase.from('areas').select('id, nombre').eq('activo', true),
  ])
  const partidas = (partidasRes.data ?? []) as { clave: string; descripcion: string | null; cantidad: number | null }[]
  if (partidas.length === 0) return null

  const { data: plantillas } = await supabase
    .from('plantilla_despiece')
    .select('clave, bom')
    .in('clave', [...new Set(partidas.map((p) => p.clave))])
  const bomPorClave = new Map<string, PlantillaBOM>()
  ;(plantillas ?? []).forEach((f) => bomPorClave.set(f.clave as string, f.bom as PlantillaBOM))
  if (bomPorClave.size === 0) return null

  const productos = partidas
    .filter((p) => bomPorClave.has(p.clave))
    .map((p) => {
      const bom = bomPorClave.get(p.clave)!
      const cantidad = Math.max(1, p.cantidad ?? 1)
      const descripcion = p.descripcion ?? bom.descripcion ?? ''
      return {
        clave: p.clave,
        etiqueta: `${nombreCorto(descripcion)} ×${cantidad}`,
        cantidad,
        matriz: construirMatriz(bom, { clave: p.clave, descripcion, cantidad, cliente: '', proyecto: '', fecha: '' }),
      }
    })

  const filas: FilaDeseada[] = []
  for (const area of (areasRes.data ?? []) as { id: string; nombre: string }[]) {
    const esDelArea = (a: string) => norm(a) === norm(area.nombre)
    const porPieza = productos.some((p) => p.matriz.secciones.some((s) => s.filas.some((f) => esDelArea(f.area) && f.total > 0)))
    let orden = 0

    for (const p of productos) {
      for (const seccion of p.matriz.secciones) {
        if (!porPieza) {
          // Área sin piezas en el plano: avanza por subensamble
          if (seccion.nombre === 'HERRAJE DE ARMADO') continue
          filas.push({
            area_id: area.id,
            origen_clave: `${p.clave}#SUB|${seccion.nombre}`,
            descripcion: seccion.nombre,
            modulo: p.etiqueta,
            material: null,
            medidas: null,
            notas: [`${seccion.filas.length} componentes`, seccion.pagina !== null ? `hoja ${seccion.pagina}` : '']
              .filter(Boolean)
              .join(' · '),
            meta: seccion.cantidad * p.cantidad,
            orden: ++orden,
          })
          continue
        }

        // Piezas iguales dentro del mismo subensamble se juntan en una sola fila
        const delArea = new Map<string, FilaDeseada>()
        for (const f of seccion.filas) {
          if (!esDelArea(f.area) || f.total <= 0) continue
          const origen = `${p.clave}#${[seccion.nombre, f.descripcion, f.material, f.largo ?? '', f.ancho].join('|')}`
          const previa = delArea.get(origen)
          if (previa) {
            previa.meta += f.total
            continue
          }
          delArea.set(origen, {
            area_id: area.id,
            origen_clave: origen,
            descripcion: f.descripcion,
            modulo: `${p.etiqueta}${SEPARADOR}${seccion.nombre}`,
            material: f.material || null,
            medidas: medidas(f.largo, f.ancho) || null,
            notas: [f.notas, f.pagina !== null ? `hoja ${f.pagina}` : '', f.revisar ? 'REVISAR MEDIDA: no viene impresa en el plano' : '']
              .filter(Boolean)
              .join(' · ') || null,
            meta: f.total,
            orden: ++orden,
          })
        }
        filas.push(...delArea.values())
      }
    }
  }
  return filas
}

/**
 * Deja piezas_proyecto igual al plano: agrega lo nuevo, actualiza lo que cambió y quita lo que
 * ya no está (si nadie lo ha trabajado). No hace nada si el proyecto tiene piezas cargadas a mano
 * (Matriz de Corte en PDF) o si ninguna partida tiene plano analizado.
 */
export async function sincronizarDespiece(supabase: Supabase, proyectoId: string): Promise<void> {
  const { count: aMano } = await supabase
    .from('piezas_proyecto')
    .select('id', { count: 'exact', head: true })
    .eq('proyecto_id', proyectoId)
    .is('origen', null)
  if (aMano) return

  const deseadas = await piezasDelPlano(supabase, proyectoId)
  if (!deseadas) return

  const { data: actuales, error } = await supabase
    .from('piezas_proyecto')
    .select('id, area_id, origen_clave, descripcion, modulo, material, medidas, notas, meta, orden')
    .eq('proyecto_id', proyectoId)
    .eq('origen', ORIGEN_DESPIECE)
  if (error) {
    console.error('Error al leer piezas del despiece (¿ya corriste sql/despiece_operador.sql?):', error)
    return
  }

  const llave = (f: { area_id: string; origen_clave: string }) => `${f.area_id}#${f.origen_clave}`
  const porLlave = new Map((actuales ?? []).map((f) => [llave(f as FilaDeseada), f]))
  const campos = ['descripcion', 'modulo', 'material', 'medidas', 'notas', 'meta', 'orden'] as const

  const cambios = deseadas.filter((d) => {
    const a = porLlave.get(llave(d)) as Record<string, unknown> | undefined
    return !a || campos.some((c) => (a[c] ?? null) !== (d[c] ?? null))
  })

  if (cambios.length > 0) {
    const { error: errorAlta } = await supabase
      .from('piezas_proyecto')
      .upsert(
        cambios.map((d) => ({ ...d, proyecto_id: proyectoId, origen: ORIGEN_DESPIECE })),
        { onConflict: 'proyecto_id,area_id,origen_clave' }
      )
    if (errorAlta) {
      console.error('Error al repartir el despiece por área:', errorAlta)
      return
    }
  }

  // Piezas que ya no vienen en el plano: se quitan solo si nadie las ha trabajado
  const vigentes = new Set(deseadas.map(llave))
  const sobrantes = (actuales ?? []).filter((f) => !vigentes.has(llave(f as FilaDeseada))).map((f) => f.id as string)
  if (sobrantes.length > 0) {
    const { data: usadas } = await supabase.from('trabajos_pieza').select('pieza_id').in('pieza_id', sobrantes)
    const conTrabajo = new Set((usadas ?? []).map((t) => t.pieza_id as string))
    const borrar = sobrantes.filter((id) => !conTrabajo.has(id))
    if (borrar.length > 0) await supabase.from('piezas_proyecto').delete().in('id', borrar)
  }

  if (cambios.length > 0 || sobrantes.length > 0) await actualizarAvanceAdmin(supabase, proyectoId)
}

/** Producto del admin (proyecto_productos) al que pertenece una pieza del despiece */
async function productoDeOrigen(supabase: Supabase, proyectoId: string, origenClave: string) {
  const clave = partidaDeOrigen(origenClave)
  const { data } = await supabase
    .from('proyecto_productos')
    .select('id')
    .eq('proyecto_id', proyectoId)
    .like('nombre', `[${clave}]%`)
    .limit(1)
    .maybeSingle()
  return data ? { id: data.id as string } : null
}

/** Si la pieza salió del plano: el producto del admin al que pertenece (si no, null) */
export async function productoDePiezaDespiece(supabase: Supabase, proyectoId: string, piezaId: string) {
  const { data: pieza } = await supabase
    .from('piezas_proyecto')
    .select('origen, origen_clave')
    .eq('id', piezaId)
    .maybeSingle()
  if (pieza?.origen !== ORIGEN_DESPIECE || !pieza.origen_clave) return null
  return (await productoDeOrigen(supabase, proyectoId, pieza.origen_clave as string))?.id ?? null
}

/**
 * Al finalizar una pieza del despiece: deja el registro en "avances" (lo que el admin ve en el
 * seguimiento del proyecto) y actualiza su avance. No hace nada con piezas cargadas a mano.
 */
export async function registrarEnAdmin(
  supabase: Supabase,
  datos: { proyectoId: string; areaId: string; piezaId: string; piezas: number; inicio: string; fin: string; operadorId: string }
): Promise<void> {
  const { data: pieza } = await supabase
    .from('piezas_proyecto')
    .select('origen, origen_clave')
    .eq('id', datos.piezaId)
    .maybeSingle()
  if (pieza?.origen !== ORIGEN_DESPIECE || !pieza.origen_clave) return

  const producto = await productoDeOrigen(supabase, datos.proyectoId, pieza.origen_clave as string)

  if (producto) {
    const { error } = await supabase.from('avances').insert({
      proyecto_id: datos.proyectoId,
      area_id: datos.areaId,
      producto_id: producto.id,
      operador_id: datos.operadorId,
      estado: 'terminado',
      iniciado_at: datos.inicio,
      terminado_at: datos.fin,
      piezas: datos.piezas,
      porcentaje: 0,
      operacion: '',
      actividad: '',
    })
    if (error) console.error('No se pudo escribir en avances:', error)
  }

  await actualizarAvanceAdmin(supabase, datos.proyectoId)
}

/** ¿El proyecto trabaja con el despiece del plano? */
export async function usaDespiece(supabase: Supabase, proyectoId: string) {
  const { count } = await supabase
    .from('piezas_proyecto')
    .select('id', { count: 'exact', head: true })
    .eq('proyecto_id', proyectoId)
    .eq('origen', ORIGEN_DESPIECE)
  return Boolean(count)
}

/**
 * Pasa lo registrado en las piezas del despiece a lo que lee el administrador:
 * producto_area_avance (avance por producto y área), proyecto_productos.progreso,
 * partidas.progreso y proyectos.progreso (misma fórmula ponderada por área de siempre).
 */
export async function actualizarAvanceAdmin(supabase: Supabase, proyectoId: string): Promise<void> {
  const [piezasRes, productosRes, partidasRes, areasRes] = await Promise.all([
    supabase.from('piezas_proyecto').select('id, area_id, origen_clave, meta').eq('proyecto_id', proyectoId).eq('origen', ORIGEN_DESPIECE),
    supabase.from('proyecto_productos').select('id, nombre').eq('proyecto_id', proyectoId),
    supabase.from('partidas').select('id, clave').eq('proyecto_id', proyectoId),
    supabase.from('areas').select('id, peso'),
  ])
  const piezas = (piezasRes.data ?? []) as { id: string; area_id: string; origen_clave: string; meta: number }[]
  if (piezas.length === 0) return

  // Producto del admin de cada partida: su nombre empieza con "[clave]"
  const productos = (productosRes.data ?? []) as { id: string; nombre: string }[]
  const productoDe = (clave: string) => productos.find((p) => p.nombre?.startsWith(`[${clave}]`))?.id ?? null

  const { data: trabajos } = await supabase
    .from('trabajos_pieza')
    .select('pieza_id, piezas_hechas')
    .eq('estado', 'finalizado')
    .in('pieza_id', piezas.map((p) => p.id))
  const hechasPor = new Map<string, number>()
  ;(trabajos ?? []).forEach((t) =>
    hechasPor.set(t.pieza_id as string, (hechasPor.get(t.pieza_id as string) ?? 0) + ((t.piezas_hechas as number | null) ?? 0))
  )

  // Suma por producto y área
  const suma = new Map<string, { producto: string; area: string; hechas: number; meta: number }>()
  for (const p of piezas) {
    const producto = productoDe(partidaDeOrigen(p.origen_clave))
    if (!producto) continue
    const k = `${producto}|${p.area_id}`
    const s = suma.get(k) ?? { producto, area: p.area_id, hechas: 0, meta: 0 }
    s.hechas += Math.min(hechasPor.get(p.id) ?? 0, p.meta)
    s.meta += p.meta
    suma.set(k, s)
  }

  const idsProducto = [...new Set([...suma.values()].map((s) => s.producto))]
  if (idsProducto.length === 0) return

  const { data: existentes } = await supabase
    .from('producto_area_avance')
    .select('id, producto_id, area_id, piezas_completadas, piezas_totales')
    .in('producto_id', idsProducto)
  const filaDe = new Map((existentes ?? []).map((f) => [`${f.producto_id}|${f.area_id}`, f]))

  for (const [k, s] of suma) {
    const porcentaje = s.meta > 0 ? Math.min(100, Math.round((s.hechas / s.meta) * 100)) : 0
    const valores = { piezas_completadas: s.hechas, piezas_totales: s.meta, porcentaje, completado: porcentaje >= 100 }
    const fila = filaDe.get(k)
    if (fila) {
      if (fila.piezas_completadas !== s.hechas || fila.piezas_totales !== s.meta) {
        await supabase.from('producto_area_avance').update(valores).eq('id', fila.id)
      }
    } else {
      await supabase.from('producto_area_avance').insert({ producto_id: s.producto, area_id: s.area, ...valores })
    }
  }

  // Avance por producto que no corresponde al plano (registros viejos por producto): se quita
  const sobrantes = (existentes ?? []).filter((f) => !suma.has(`${f.producto_id}|${f.area_id}`)).map((f) => f.id as string)
  if (sobrantes.length > 0) await supabase.from('producto_area_avance').delete().in('id', sobrantes)

  // % por producto y del proyecto, con el peso de cada área (igual que el admin)
  const peso = new Map(((areasRes.data ?? []) as { id: string; peso: number }[]).map((a) => [a.id, Number(a.peso)]))
  const pctProducto = new Map<string, number>()
  for (const producto of idsProducto) {
    let pesoTotal = 0
    let pesoAvanzado = 0
    for (const s of suma.values()) {
      if (s.producto !== producto) continue
      const w = peso.get(s.area) ?? 14.28
      pesoTotal += w
      pesoAvanzado += w * (s.meta > 0 ? Math.min(1, s.hechas / s.meta) : 0)
    }
    pctProducto.set(producto, pesoTotal > 0 ? Math.round((pesoAvanzado / pesoTotal) * 100) : 0)
  }

  for (const [producto, pct] of pctProducto) {
    await supabase.from('proyecto_productos').update({ progreso: pct }).eq('id', producto)
  }
  for (const partida of (partidasRes.data ?? []) as { id: string; clave: string }[]) {
    const producto = productoDe(partida.clave)
    if (producto && pctProducto.has(producto)) {
      await supabase.from('partidas').update({ progreso: pctProducto.get(producto) }).eq('id', partida.id)
    }
  }

  const todos = productos.map((p) => pctProducto.get(p.id) ?? 0)
  const progreso = todos.length > 0 ? Math.min(100, Math.round(todos.reduce((a, b) => a + b, 0) / todos.length)) : 0
  await supabase.from('proyectos').update({ progreso }).eq('id', proyectoId)
}
