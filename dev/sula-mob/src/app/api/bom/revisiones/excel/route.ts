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
 *
 * El archivo trae: hoja de explosión con colores de revisión + OC y Compra, hoja REPORTE
 * (tiempos, estatus del pedido, órdenes de compra, historial de revisiones) y las hojas REGISTRO y FORMATO DE CONTROL.
 * Solo administradores.
 *
 * RUTA DEL ARCHIVO: src/app/api/bom/revisiones/excel/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'
import { motivosDe } from '@/lib/bom-motivos'
import { duracionLegible, ESTATUS_BOM, estatusBom, formatTiempo, pausasDe, segundosTrabajados, textoDias } from '@/lib/bom-tiempo'
import { crearExcelExplosion } from '@/lib/explosion-excel'
import { errorJson } from '@/lib/explosion-servidor'
import { compararRevision, nombreArchivoExplosion, type LineaRev, type Revision } from '@/lib/explosion-revisiones'

export async function GET(request: NextRequest) {
  if (!(await esAdmin())) return errorJson('Solo administradores.', 403)
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
    supabase.from('bom_ordenes_compra').select('folio, referencia, proveedor, fecha, archivo_nombre, partidas').eq('explosion_id', explosionId).order('created_at'),
  ])

  const porRevision = new Map<string, LineaRev[]>()
  for (const l of (lineas ?? []) as LineaRev[]) {
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
  const codigo = String(proyecto?.codigo || '').trim()
  const nombrarPor = params.get('nombre') === 'sucursal' ? 'sucursal' : 'pedido'
  const nombre = nombreArchivoExplosion(revision.numero, nombrarPor === 'sucursal' ? sucursal || codigo : codigo || sucursal)

  const segundos = segundosTrabajados(explosion)
  const buffer = await crearExcelExplosion({
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
  })

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // filename= para navegadores viejos (sin acentos) y filename*= con el nombre completo
      'Content-Disposition': `attachment; filename="${nombre.normalize('NFD').replace(/[^\x20-\x7e]/g, '')}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'Cache-Control': 'no-store',
    },
  })
}
