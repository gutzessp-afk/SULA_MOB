/**
 * /api/reportes/incidencias/route.ts
 * ──────────────────────────────────
 * Genera el Historial de Incidencias en Excel con los retrasos que reportan
 * los operadores (tabla retrasos):
 *   - Hoja "Incidencias": indicadores y el detalle de cada aviso
 *   - Hoja "Resumen": avisos y horas perdidas por área y por motivo
 *
 * GET /api/reportes/incidencias → archivo .xlsx para descargar
 *
 * RUTA DEL ARCHIVO: src/app/api/reportes/incidencias/route.ts
 */

import { NextResponse } from 'next/server'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'
import {
  COLOR, cajas, crearHoja, crearLibro, descargaExcel, fechaCorta, fechaHora, fechaHoy,
  fuente, relacion, seccion, tabla, todasLasFilas, type Columna,
} from '@/lib/reportes-excel'

interface RetrasoFila {
  motivo: string | null
  descripcion: string | null
  tiempo_estimado_retraso: number | null
  comentario: string | null
  evidencia_url: string | null
  operador_id: string | null
  created_at: string
  proyectos: { codigo: string | null; nombre: string | null } | { codigo: string | null; nombre: string | null }[] | null
  areas: { nombre: string | null } | { nombre: string | null }[] | null
}

const COLUMNAS_DETALLE: Columna[] = [
  { titulo: 'Fecha', ancho: 18, alineacion: 'center' },
  { titulo: 'Operador', ancho: 22 },
  { titulo: 'Proyecto', ancho: 30 },
  { titulo: 'Área', ancho: 20 },
  { titulo: 'Motivo', ancho: 22 },
  { titulo: 'Descripción', ancho: 40 },
  { titulo: 'Horas de retraso', ancho: 16, alineacion: 'center' },
  { titulo: 'Comentario', ancho: 30 },
  { titulo: 'Evidencia', ancho: 14, alineacion: 'center' },
]

const COLUMNAS_RESUMEN: Columna[] = [
  { titulo: 'Concepto', ancho: 32 },
  { titulo: 'Avisos', ancho: 12, alineacion: 'center' },
  { titulo: 'Horas perdidas', ancho: 16, alineacion: 'center' },
]

/** Agrupa los avisos por un concepto (área o motivo), de más a menos avisos */
function agrupar<T>(filas: T[], concepto: (f: T) => string, horas: (f: T) => number): (string | number)[][] {
  const grupos = new Map<string, { avisos: number; horas: number }>()
  for (const f of filas) {
    const grupo = grupos.get(concepto(f)) ?? { avisos: 0, horas: 0 }
    grupo.avisos++
    grupo.horas += horas(f)
    grupos.set(concepto(f), grupo)
  }
  return [...grupos.entries()]
    .sort((a, b) => b[1].avisos - a[1].avisos || b[1].horas - a[1].horas)
    .map(([nombre, g]) => [nombre, g.avisos, g.horas])
}

export async function GET() {
  if (!(await esAdmin())) {
    return NextResponse.json({ error: 'Solo los administradores pueden generar reportes.' }, { status: 403 })
  }

  try {
    const supabase = supabaseServidor()

    const filas = await todasLasFilas<RetrasoFila>((desde, hasta) =>
      supabase
        .from('retrasos')
        .select('motivo, descripcion, tiempo_estimado_retraso, comentario, evidencia_url, operador_id, created_at, proyectos ( codigo, nombre ), areas ( nombre )')
        .order('created_at', { ascending: false })
        .order('id')
        .range(desde, hasta)
    )

    // Nombres de operadores en una consulta aparte (no depende de relaciones)
    const ids = [...new Set(filas.map((r) => r.operador_id).filter((id): id is string => !!id))]
    const operadores = new Map<string, string>()
    if (ids.length) {
      const { data, error } = await supabase.from('usuarios').select('id, nombre, apellidos').in('id', ids)
      if (error) throw new Error(error.message)
      for (const u of data ?? []) operadores.set(u.id as string, `${u.nombre ?? ''} ${u.apellidos ?? ''}`.trim())
    }

    const retrasos = filas.map((r) => {
      const proyecto = relacion(r.proyectos)
      return {
        fecha: fechaHora(r.created_at),
        operador: (r.operador_id && operadores.get(r.operador_id)) || 'Operador',
        proyecto: [proyecto?.codigo, proyecto?.nombre].filter(Boolean).join(' — ') || 'Sin proyecto',
        area: relacion(r.areas)?.nombre || 'Sin área',
        motivo: r.motivo?.trim() || 'Sin motivo',
        descripcion: r.descripcion || '',
        horas: Number(r.tiempo_estimado_retraso) || 0,
        comentario: r.comentario || '',
        evidencia: r.evidencia_url && /^https?:\/\//i.test(r.evidencia_url) ? r.evidencia_url : '',
      }
    })

    const horasPerdidas = retrasos.reduce((suma, r) => suma + r.horas, 0)
    const hoy = fechaHoy()
    const generado = `Generado el ${fechaCorta(hoy)} · Todos los avisos registrados`

    const wb = crearLibro()

    // ── Hoja 1: detalle ──
    const ws = await crearHoja(wb, 'Incidencias', 'HISTORIAL DE INCIDENCIAS', generado, COLUMNAS_DETALLE)
    let fila = seccion(ws, 4, 'RESUMEN')
    fila = cajas(ws, fila, [
      { etiqueta: 'Total de avisos', valor: retrasos.length, color: COLOR.azul, columnas: [1, 2] },
      { etiqueta: 'Horas perdidas (estimadas)', valor: horasPerdidas, color: COLOR.rojo, columnas: [3, 4] },
      { etiqueta: 'Proyectos afectados', valor: new Set(retrasos.map((r) => r.proyecto)).size, color: COLOR.amarillo, columnas: [5, 6] },
      { etiqueta: 'Áreas afectadas', valor: new Set(retrasos.map((r) => r.area)).size, color: COLOR.azulOscuro, columnas: [7, 9] },
    ])
    fila = seccion(ws, fila, 'DETALLE (más recientes primero)')
    tabla(
      ws,
      fila,
      COLUMNAS_DETALLE,
      retrasos.map((r) => [
        r.fecha,
        r.operador,
        r.proyecto,
        r.area,
        r.motivo,
        r.descripcion,
        r.horas || '',
        r.comentario,
        r.evidencia ? { text: 'Ver foto', hyperlink: r.evidencia } : '',
      ]),
      {
        vacio: 'Todavía no hay retrasos reportados.',
        estilo: (celda, i, j) => {
          if (j === 4) celda.font = fuente({ bold: true, color: { argb: COLOR.rojo } })
          if (j === 8 && retrasos[i].evidencia) celda.font = fuente({ underline: true, color: { argb: COLOR.azul } })
        },
      }
    )
    ws.views = [{ showGridLines: false, state: 'frozen', ySplit: fila }]

    // ── Hoja 2: por área y por motivo ──
    const wsResumen = await crearHoja(wb, 'Resumen', 'INCIDENCIAS POR ÁREA Y MOTIVO', generado, COLUMNAS_RESUMEN)
    fila = seccion(wsResumen, 4, 'POR ÁREA')
    fila = tabla(wsResumen, fila, COLUMNAS_RESUMEN, agrupar(retrasos, (r) => r.area, (r) => r.horas))
    fila = seccion(wsResumen, fila, 'POR MOTIVO')
    tabla(wsResumen, fila, COLUMNAS_RESUMEN, agrupar(retrasos, (r) => r.motivo, (r) => r.horas))

    return await descargaExcel(wb, 'HISTORIAL_INCIDENCIAS_SULA')
  } catch (err) {
    console.error('[reportes/incidencias] Error:', err)
    return NextResponse.json({ error: 'No se pudo generar el historial de incidencias.' }, { status: 500 })
  }
}
