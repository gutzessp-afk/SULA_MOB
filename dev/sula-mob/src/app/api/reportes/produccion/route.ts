/**
 * /api/reportes/produccion/route.ts
 * ─────────────────────────────────
 * Genera el Reporte de Producción en Excel con los datos actuales:
 *   - Hoja "Producción": indicadores generales y el detalle de cada proyecto
 *   - Hoja "Por Área": avance de cada área de producción
 *
 * GET /api/reportes/produccion → archivo .xlsx para descargar
 *
 * Un proyecto está atrasado cuando su fecha de entrega ya pasó y no está terminado.
 * El avance por área se calcula igual que en el dashboard.
 *
 * RUTA DEL ARCHIVO: src/app/api/reportes/produccion/route.ts
 */

import { NextResponse } from 'next/server'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'
import {
  COLOR, cajas, colorAvance, crearHoja, crearLibro, descargaExcel, diasEntre, fechaCorta, fechaHoy,
  fuente, relacion, seccion, tabla, todasLasFilas, type Columna,
} from '@/lib/reportes-excel'

interface ProyectoFila {
  id: string
  codigo: string | null
  nombre: string | null
  cliente: string | null
  descripcion: string | null
  progreso: number | null
  prioridad: string | null
  fecha_maxima: string | null
  estados: { nombre: string } | { nombre: string }[] | null
}

interface AvanceFila {
  area_id: string
  porcentaje: number | null
  completado: boolean | null
  piezas_completadas: number | null
  piezas_totales: number | null
}

type Estado = 'Completado' | 'Cancelado' | 'Atrasado' | 'En proceso' | 'Pendiente'

const COLOR_ESTADO: Record<Estado, string> = {
  Completado: COLOR.verde,
  Cancelado: COLOR.gris,
  Atrasado: COLOR.rojo,
  'En proceso': COLOR.azul,
  Pendiente: COLOR.gris,
}

const COLUMNAS_PROYECTOS: Columna[] = [
  { titulo: 'Código', ancho: 16 },
  { titulo: 'Proyecto', ancho: 34 },
  { titulo: 'Cliente', ancho: 26 },
  { titulo: 'Prioridad', ancho: 12, alineacion: 'center' },
  { titulo: 'Progreso', ancho: 11, alineacion: 'center', formato: '0%' },
  { titulo: 'Estado', ancho: 14, alineacion: 'center' },
  { titulo: 'Entrega', ancho: 13, alineacion: 'center' },
  { titulo: 'Días de atraso', ancho: 13, alineacion: 'center' },
]

const COLUMNAS_AREAS: Columna[] = [
  { titulo: 'Área', ancho: 26 },
  { titulo: 'Productos', ancho: 12, alineacion: 'center' },
  { titulo: 'Completados', ancho: 13, alineacion: 'center' },
  { titulo: 'En proceso', ancho: 13, alineacion: 'center' },
  { titulo: 'Pendientes', ancho: 13, alineacion: 'center' },
  { titulo: 'Piezas hechas', ancho: 14, alineacion: 'center' },
  { titulo: 'Piezas totales', ancho: 14, alineacion: 'center' },
  { titulo: 'Avance', ancho: 11, alineacion: 'center', formato: '0%' },
]

/** Porcentaje (0 a 100) de un producto en un área: por piezas si las tiene, si no el que está guardado */
function porcentajeDe(f: AvanceFila): number {
  if (f.piezas_totales && f.piezas_totales > 0) {
    return Math.min(100, Math.round(((f.piezas_completadas || 0) / f.piezas_totales) * 100))
  }
  return f.porcentaje || (f.completado ? 100 : 0)
}

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

export async function GET() {
  if (!(await esAdmin())) {
    return NextResponse.json({ error: 'Solo los administradores pueden generar reportes.' }, { status: 403 })
  }

  try {
    const supabase = supabaseServidor()
    const hoy = fechaHoy()

    const [filasProyectos, areasRes, avances] = await Promise.all([
      todasLasFilas<ProyectoFila>((desde, hasta) =>
        supabase
          .from('proyectos')
          .select('id, codigo, nombre, cliente, descripcion, progreso, prioridad, fecha_maxima, estados:estado_id ( nombre )')
          .order('created_at', { ascending: false })
          .order('id')
          .range(desde, hasta)
      ),
      supabase.from('areas').select('id, nombre').eq('activo', true).order('orden', { ascending: true }),
      todasLasFilas<AvanceFila>((desde, hasta) =>
        supabase
          .from('producto_area_avance')
          .select('area_id, porcentaje, completado, piezas_completadas, piezas_totales')
          .order('id')
          .range(desde, hasta)
      ),
    ])
    if (areasRes.error) throw new Error(areasRes.error.message)

    const proyectos = filasProyectos.map((p) => {
      const estadoBase = (relacion(p.estados)?.nombre || '').toLowerCase()
      // La fecha de entrega del pedido se guarda en la descripción ("Entrega: 2026-05-19")
      const entrega =
        (typeof p.fecha_maxima === 'string' && p.fecha_maxima.slice(0, 10)) ||
        p.descripcion?.match(/Entrega:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ||
        ''
      const progreso = Math.max(0, Math.min(100, Number(p.progreso) || 0))
      const diasAtraso = entrega && entrega < hoy ? diasEntre(entrega, hoy) : 0

      let estado: Estado
      if (progreso >= 100 || estadoBase === 'completado') estado = 'Completado'
      else if (estadoBase === 'cancelado') estado = 'Cancelado'
      else if (diasAtraso > 0) estado = 'Atrasado'
      else if (progreso > 0) estado = 'En proceso'
      else estado = 'Pendiente'

      return { ...p, entrega, progreso, estado, diasAtraso: estado === 'Atrasado' ? diasAtraso : 0 }
    })

    const cuenta = (estado: Estado) => proyectos.filter((p) => p.estado === estado).length
    const avancePromedio = proyectos.length
      ? Math.round(proyectos.reduce((suma, p) => suma + p.progreso, 0) / proyectos.length)
      : 0

    const wb = crearLibro()
    const generado = `Generado el ${fechaCorta(hoy)} · ${proyectos.length} proyectos · Avance promedio ${avancePromedio}%`

    // ── Hoja 1: proyectos ──
    const ws = await crearHoja(wb, 'Producción', 'REPORTE DE PRODUCCIÓN', generado, COLUMNAS_PROYECTOS)
    let fila = seccion(ws, 4, 'RESUMEN GENERAL')
    fila = cajas(ws, fila, [
      { etiqueta: 'Total de proyectos', valor: proyectos.length, color: COLOR.azul, columnas: [1, 2] },
      { etiqueta: 'Completados', valor: cuenta('Completado'), color: COLOR.verde, columnas: [3, 3] },
      { etiqueta: 'En proceso o pendientes', valor: cuenta('En proceso') + cuenta('Pendiente'), color: COLOR.amarillo, columnas: [4, 5] },
      { etiqueta: 'Atrasados', valor: cuenta('Atrasado'), color: COLOR.rojo, columnas: [6, 8] },
    ])
    fila = seccion(ws, fila, 'DETALLE POR PROYECTO')
    tabla(
      ws,
      fila,
      COLUMNAS_PROYECTOS,
      proyectos.map((p) => [
        p.codigo || '',
        p.nombre || '',
        p.cliente || 'No especificado',
        mayuscula(p.prioridad || 'media'),
        p.progreso / 100,
        p.estado,
        p.entrega ? fechaCorta(p.entrega) : 'Sin fecha',
        p.diasAtraso || '',
      ]),
      {
        vacio: 'No hay proyectos registrados.',
        estilo: (celda, i, j) => {
          const p = proyectos[i]
          if (j === 4) celda.font = fuente({ bold: true, color: { argb: colorAvance(p.progreso / 100) } })
          if (j === 5) celda.font = fuente({ bold: true, color: { argb: COLOR_ESTADO[p.estado] } })
          if (j >= 6 && p.estado === 'Atrasado') celda.font = fuente({ bold: true, color: { argb: COLOR.rojo } })
        },
      }
    )
    ws.views = [{ showGridLines: false, state: 'frozen', ySplit: fila }]

    // ── Hoja 2: áreas ──
    const porArea = (areasRes.data || []).map((area) => {
      const filas = avances.filter((f) => f.area_id === area.id)
      const pcts = filas.map(porcentajeDe)
      const conPiezas = filas.filter((f) => f.piezas_totales && f.piezas_totales > 0)
      return {
        nombre: area.nombre as string,
        productos: filas.length,
        completados: pcts.filter((p) => p >= 100).length,
        enProceso: pcts.filter((p) => p > 0 && p < 100).length,
        pendientes: pcts.filter((p) => p <= 0).length,
        hechas: conPiezas.reduce((suma, f) => suma + (f.piezas_completadas || 0), 0),
        totales: conPiezas.reduce((suma, f) => suma + (f.piezas_totales || 0), 0),
        avance: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) / 100 : 0,
      }
    })

    const wsAreas = await crearHoja(wb, 'Por Área', 'PROGRESO POR ÁREA DE PRODUCCIÓN', `Generado el ${fechaCorta(hoy)}`, COLUMNAS_AREAS)
    tabla(
      wsAreas,
      seccion(wsAreas, 4, 'AVANCE DE CADA ÁREA (todos los proyectos)'),
      COLUMNAS_AREAS,
      porArea.map((a) => [a.nombre, a.productos, a.completados, a.enProceso, a.pendientes, a.hechas, a.totales, a.avance]),
      {
        vacio: 'No hay áreas activas.',
        estilo: (celda, i, j) => {
          if (j === 7) celda.font = fuente({ bold: true, color: { argb: colorAvance(porArea[i].avance) } })
        },
      }
    )

    return await descargaExcel(wb, 'REPORTE_PRODUCCION_SULA')
  } catch (err) {
    console.error('[reportes/produccion] Error:', err)
    return NextResponse.json({ error: 'No se pudo generar el reporte de producción.' }, { status: 500 })
  }
}
