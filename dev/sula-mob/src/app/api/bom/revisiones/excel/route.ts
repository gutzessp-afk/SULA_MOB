/**
 * /api/bom/revisiones/excel/route.ts
 * ──────────────────────────────────
 * Descarga una revisión en el formato Excel de SULA.
 *
 *   GET ?explosion_id=UUID                      → la última revisión
 *   GET ?explosion_id=UUID&revision_id=UUID     → una revisión en particular
 *   GET …&nombre=pedido | sucursal              → cómo se llama el archivo:
 *        "EXPLOSION DE MATERIALES PED-3518 REV-01.xlsx"           (pedido, default)
 *        "EXPLOSION DE MATERIALES Chedraui Supercito REV-01.xlsx" (sucursal / referencia)
 *   GET …&completa=1                            → sesión de madera: todos los materiales (si no, solo Madera)
 *   GET …&formato=pdf                           → la misma revisión en PDF (carta horizontal,
 *        src/lib/explosion-pdf.ts) con la tabla de pagos de las OC
 *
 * El archivo trae: hoja de explosión con colores de revisión + OC y Compra, hoja REPORTE
 * (tiempos, estatus del pedido, órdenes de compra, historial de revisiones) y las hojas REGISTRO y FORMATO DE CONTROL.
 * Administradores, área de madera y perfiles ERP. Almacén (verCostos() = false) descarga sin costos:
 * en el Excel las columnas Costo y Costo Estimado van vacías y ocultas, y sin totales en $; el PDF sale
 * sin esas columnas ni el resumen de pagos.
 *
 * RUTA DEL ARCHIVO: src/app/api/bom/revisiones/excel/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { esClasifMadera, esSesionMadera, puedeVerBom, supabaseServidor, verCostos } from '@/lib/admin-api'
import { motivosDe } from '@/lib/bom-motivos'
import { duracionLegible, ESTATUS_BOM, estatusBom, formatTiempo, pausasDe, segundosTrabajados, textoDias } from '@/lib/bom-tiempo'
import { crearExcelExplosion, type DatosExcel } from '@/lib/explosion-excel'
import { crearPdfExplosion } from '@/lib/explosion-pdf'
import { errorJson } from '@/lib/explosion-servidor'
import { compararRevision, nombreArchivoExplosion, type LineaRev, type Revision } from '@/lib/explosion-revisiones'

export async function GET(request: NextRequest) {
  if (!(await puedeVerBom())) return errorJson('Sin permiso.', 403)
  const params = request.nextUrl.searchParams
  const explosionId = params.get('explosion_id')
  if (!explosionId) return errorJson('Falta explosion_id.', 400)

  const supabase = supabaseServidor()
  const { data: explosion } = await supabase.from('bom_explosiones').select('*').eq('id', explosionId).maybeSingle()
  if (!explosion) return errorJson('Explosión no encontrada.', 404)

  const [{ data: proyecto }, { data: revs }, { data: lineas }, { data: ordenes }] = await Promise.all([
    supabase.from('proyectos').select('codigo, nombre, referencia_sucursal').eq('id', explosion.proyecto_id).maybeSingle(),
    supabase.from('bom_revisiones').select('*').eq('explosion_id', explosionId).order('numero', { ascending: true }),
    supabase.from('bom_revision_lineas').select('*').eq('explosion_id', explosionId).order('orden', { ascending: true }),
    // select('*') para que funcione aunque todavía no existan las columnas de pago (sql/bom_pagos_oc.sql)
    supabase.from('bom_ordenes_compra').select('*').eq('explosion_id', explosionId).order('created_at'),
  ])

  // El área de madera descarga solo los materiales de madera, salvo &completa=1 (Subir archivos)
  const soloMadera = params.get('completa') !== '1' && (await esSesionMadera())
  const porRevision = new Map<string, LineaRev[]>()
  for (const l of (lineas ?? []) as LineaRev[]) {
    if (soloMadera && !esClasifMadera(l.clasificacion)) continue
    porRevision.set(l.revision_id, [...(porRevision.get(l.revision_id) ?? []), { ...l, costo: Number(l.costo), cantidad: Number(l.cantidad) }])
  }
  const revisiones: Revision[] = (revs ?? []).map(r => ({ ...r, lineas: porRevision.get(r.id) ?? [] }))
  if (!revisiones.length) return errorJson('Esta explosión todavía no tiene revisiones.', 404)

  const pedida = params.get('revision_id')
  const indice = pedida ? revisiones.findIndex(r => r.id === pedida) : revisiones.length - 1
  if (indice < 0) return errorJson('Revisión no encontrada.', 404)
  const revision = revisiones[indice]
  const { marcas, eliminadas } = compararRevision(revisiones, indice)

  const sucursal = String(proyecto?.referencia_sucursal || proyecto?.nombre || '').trim()
  // Explosión "sin alta" (sin proyecto): el código sale de su número de pedido
  const codigo = String(proyecto?.codigo || (explosion.pedido_numero ? `PED-${explosion.pedido_numero}` : '')).trim()
  const nombrarPor = params.get('nombre') === 'sucursal' ? 'sucursal' : 'pedido'
  const nombre = nombreArchivoExplosion(revision.numero, nombrarPor === 'sucursal' ? sucursal || codigo : codigo || sucursal)

  const segundos = segundosTrabajados(explosion)
  const sinCostos = !(await verCostos())
  const datos: DatosExcel = {
    sinCostos,
    revision,
    revisiones,
    marcas,
    eliminadas,
    referencia: [codigo, sucursal].filter(Boolean).join(' · '),
    ordenes: ordenes ?? [],
    reporte: {
      estado: ESTATUS_BOM[estatusBom(explosion)].txt,
      fecha_inicio: explosion.fecha_inicio,
      fecha_termino: explosion.fecha_termino,
      tiempo_trabajado: formatTiempo(segundos),
      tiempo_legible: duracionLegible(segundos),
      dias: textoDias(explosion.fecha_inicio, explosion.fecha_termino),
      pausas: pausasDe(explosion.checklist),
      motivos: motivosDe(explosion.checklist),
      notas: explosion.notas ?? '',
    },
  }

  /* ── PDF ── */
  if (params.get('formato') === 'pdf') {
    const pdf = crearPdfExplosion({
      ...datos,
      ordenesPago: sinCostos ? [] : (ordenes ?? []).map(o => ({ folio: o.folio, proveedor: o.proveedor ?? '', total: o.total ?? null, monto_pagado: o.monto_pagado ?? null, fecha_pago: o.fecha_pago ?? null })),
    })
    const nombrePdf = nombre.replace(/\.xlsx$/i, '.pdf')
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nombrePdf.normalize('NFD').replace(/[^\x20-\x7e]/g, '')}"; filename*=UTF-8''${encodeURIComponent(nombrePdf)}`,
        'Cache-Control': 'no-store',
      },
    })
  }

  const buffer = await crearExcelExplosion(datos)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // filename= para navegadores viejos (sin acentos) y filename*= con el nombre completo
      'Content-Disposition': `attachment; filename="${nombre.normalize('NFD').replace(/[^\x20-\x7e]/g, '')}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'Cache-Control': 'no-store',
    },
  })
}
