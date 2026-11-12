/**
 * /api/bom/exportar/route.ts
 * ──────────────────────────
 * Exporta una explosión de material en Excel (.xlsx) o en HTML imprimible (Guardar como PDF).
 *
 *   GET ?id=UUID&formato=xlsx                     → descarga Excel
 *   GET ?id=UUID&formato=pdf                      → HTML con botón "Imprimir / Guardar como PDF"
 *   GET ?id=UUID&formato=pdf&tipo=estatus         → reporte de problemas: por qué no se puede
 *                                                   explosionar (sin tiempos ni materiales)
 *   GET ?id=UUID&formato=xlsx&partidas=ID1,ID2    → solo las partidas elegidas
 *                                                   ('general' = materiales sin partida)
 *
 * Incluye el estatus del pedido (motivos por los que no se podía explosionar y su descripción),
 * los tiempos de inicio a término y los materiales por partida.
 * Solo administradores.
 *
 * RUTA DEL ARCHIVO: src/app/api/bom/exportar/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'
import { motivosDe } from '@/lib/bom-motivos'
import { ESTATUS_BOM, duracionLegible, estatusBom, pausasDe, segundosTrabajados, textoDias } from '@/lib/bom-tiempo'

const ZONA = 'America/Mexico_City'
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const ESTADOS: Record<string, string> = { pendiente: 'PENDIENTE', en_proceso: 'EN PROCESO', completado: 'COMPLETADO' }

interface Detalle {
  partida_id: string | null
  clave: string | null
  material: string
  descripcion: string
  cantidad: number
  unidad: string
  checked: boolean
}

function formatTiempo(seg: number): string {
  const total = Math.max(0, seg || 0)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** "11 Nov 2026 14:32" en hora de México (el servidor puede estar en UTC) */
function fechaLegible(iso: string | null): string {
  if (!iso) return '—'
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: ZONA, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(iso)).map(p => [p.type, p.value]),
  )
  return `${partes.day} ${MESES[Number(partes.month) - 1]} ${partes.year} ${partes.hour}:${partes.minute}`
}

/** "Martes 11 de Noviembre" en hora de México */
function diaYMes(iso: string | null): string {
  if (!iso) return '—'
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' })
      .formatToParts(new Date(iso)).map(p => [p.type, p.value]),
  )
  const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
  return `${mayuscula(partes.weekday)} ${partes.day} de ${mayuscula(partes.month)}`
}

function escaparHtml(texto: unknown): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function GET(request: NextRequest) {
  if (!(await esAdmin()))
    return NextResponse.json({ error: 'Solo administradores.' }, { status: 403 })

  const params = request.nextUrl.searchParams
  const id = params.get('id')
  const formato = params.get('formato') || 'xlsx'
  const filtroPartidas = (params.get('partidas') || '').split(',').filter(Boolean)
  const soloEstatus = params.get('tipo') === 'estatus'

  if (!id) return NextResponse.json({ error: 'Falta id.' }, { status: 400 })
  if (formato !== 'xlsx' && formato !== 'pdf')
    return NextResponse.json({ error: 'Formato no válido. Usa xlsx o pdf.' }, { status: 400 })

  const supabase = supabaseServidor()

  const { data: explosion } = await supabase.from('bom_explosiones').select('*').eq('id', id).maybeSingle()
  if (!explosion) return NextResponse.json({ error: 'Explosión no encontrada.' }, { status: 404 })

  const [{ data: proyecto }, { data: partidas }, { data: detalles }] = await Promise.all([
    supabase.from('proyectos').select('codigo, nombre, referencia_sucursal').eq('id', explosion.proyecto_id).maybeSingle(),
    supabase.from('partidas').select('id, clave, descripcion, cantidad, orden').eq('proyecto_id', explosion.proyecto_id).order('orden', { ascending: true }),
    supabase.from('bom_detalles').select('partida_id, clave, material, descripcion, cantidad, unidad, checked').eq('explosion_id', id).order('orden', { ascending: true }),
  ])

  const incluye = (clave: string) => filtroPartidas.length === 0 || filtroPartidas.includes(clave)
  const detallesDe = (partidaId: string | null) => ((detalles ?? []) as Detalle[]).filter(d => d.partida_id === partidaId)

  // Una sección por partida, más los materiales generales (sin partida) si hay
  const secciones = (partidas ?? [])
    .filter(p => incluye(p.id))
    .map(p => ({ titulo: `▸ ${p.clave} — ${p.descripcion} (x${p.cantidad})`, dets: detallesDe(p.id) }))
  // Sin partida: una sección por clave propia y otra para los generales
  if (incluye('general')) {
    const sinPartida = detallesDe(null)
    const claves = [...new Set(sinPartida.map(d => d.clave?.trim() || ''))].sort()
    const extra = claves.map(clave => ({
      titulo: clave ? `▸ ${clave}` : '▸ Materiales generales',
      dets: sinPartida.filter(d => (d.clave?.trim() || '') === clave),
    }))
    secciones.unshift(...extra)
  }
  // El reporte de problemas no lleva materiales
  if (soloEstatus) secciones.length = 0

  // Tiempos: trabajado (sin pausas) y total de inicio a término (con pausas).
  // Si todavía está en proceso, se calcula hasta ahora.
  const ahora = new Date()
  const terminada = explosion.estado === 'completado'
  const trabajado = segundosTrabajados(explosion, ahora.getTime())
  const finCuenta = terminada && explosion.fecha_termino ? new Date(explosion.fecha_termino) : ahora
  const total = explosion.fecha_inicio ? Math.max(0, Math.round((finCuenta.getTime() - new Date(explosion.fecha_inicio).getTime()) / 1000)) : 0
  const pausas = Math.max(0, total - trabajado)
  const sinIniciar = !explosion.fecha_inicio

  const infoExplosion: [string, string, string, string][] = [
    ['Código:', proyecto?.codigo || '—', 'Sucursal:', proyecto?.referencia_sucursal || '—'],
    ['Nombre:', proyecto?.nombre || '—', 'Estado:', ESTADOS[explosion.estado] || String(explosion.estado).toUpperCase()],
    ['Fecha de inicio:', fechaLegible(explosion.fecha_inicio), 'Fecha de término:', terminada ? fechaLegible(explosion.fecha_termino) : sinIniciar ? '—' : 'En proceso'],
    ['Día:', diaYMes(explosion.fecha_inicio), 'Realizado por:', explosion.usuario_nombre || 'Admin'],
    ['Tiempo total trabajado:', sinIniciar ? '—' : `${formatTiempo(trabajado)} (${duracionLegible(trabajado)})`, 'Del inicio al término:', sinIniciar ? '—' : `${formatTiempo(total)} (${duracionLegible(total)})`],
    ['Días que tomó:', terminada ? textoDias(explosion.fecha_inicio, explosion.fecha_termino) : '—', 'Pausas realizadas:', sinIniciar ? '—' : String(pausasDe(explosion.checklist))],
    ['Tiempo en pausa:', sinIniciar ? '—' : `${formatTiempo(pausas)} (${duracionLegible(pausas)})`, '', ''],
  ]
  // Estatus del pedido: motivo, detalle, cuándo se reportó y cuándo se resolvió
  const motivos = motivosDe(explosion.checklist)
  const filasEstatus = motivos.map(m => [
    m.texto,
    m.detalle || '',
    `${fechaLegible(m.reportado_en)}${m.reportado_por ? ` · ${m.reportado_por}` : ''}`,
    m.resuelto ? fechaLegible(m.resuelto_en) : 'PENDIENTE',
  ])
  const descripcion = (explosion.notas || '').trim()

  // Reporte de problemas: estatus, cuántos faltan y desde cuándo está bloqueado
  const pendientesEstatus = motivos.filter(m => !m.resuelto)
  const est = estatusBom(explosion)
  const bloqueadoDesde = pendientesEstatus.map(m => m.reportado_en).filter(Boolean).sort()[0] ?? null
  const segBloqueado = bloqueadoDesde ? Math.max(0, Math.round((ahora.getTime() - new Date(bloqueadoDesde).getTime()) / 1000)) : 0
  const infoEstatus: [string, string, string, string][] = [
    ['Código:', proyecto?.codigo || '—', 'Sucursal:', proyecto?.referencia_sucursal || '—'],
    ['Nombre:', proyecto?.nombre || '—', 'Estatus:', est === 'bloqueado' ? 'BLOQUEADO — no se puede explosionar' : est === 'pendiente' ? 'LISTO PARA EXPLOSIONAR' : ESTATUS_BOM[est].txt],
    ['Problemas pendientes:', `${pendientesEstatus.length} de ${motivos.length}`, 'Bloqueado desde:', bloqueadoDesde ? `${fechaLegible(bloqueadoDesde)} (${duracionLegible(segBloqueado)})` : '—'],
    ['Fecha del reporte:', fechaLegible(ahora.toISOString()), '', ''],
  ]
  const info = soloEstatus ? infoEstatus : infoExplosion
  const tituloReporte = soloEstatus ? 'REPORTE DE PROBLEMAS — ¿POR QUÉ NO SE PUEDE EXPLOSIONAR?' : 'EXPLOSIÓN DE MATERIAL — BOM'
  const tituloEstatus = soloEstatus ? '▸ Problemas reportados' : '▸ Estatus del pedido — motivos por los que no se podía explosionar'
  const conEstatus = soloEstatus || filasEstatus.length > 0 || !!descripcion

  const nombreArchivo = `${soloEstatus ? 'REPORTE-PROBLEMAS' : 'BOM'}-${(proyecto?.codigo || 'explosion').replace(/[^\w.-]+/g, '_')}`

  /* ═══ EXCEL ═══ */
  if (formato === 'xlsx') {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'SULA MOB'
    wb.created = new Date()
    const ws = wb.addWorksheet('Explosión de Material')

    ws.mergeCells('A1:F1')
    const titulo = ws.getCell('A1')
    titulo.value = tituloReporte
    titulo.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1A1A2E' } }
    titulo.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(1).height = 40

    let row = 3
    for (const [l1, v1, l2, v2] of info) {
      const r = ws.getRow(row++)
      r.getCell(1).value = l1
      r.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF555555' } }
      r.getCell(2).value = v1
      r.getCell(2).font = { name: 'Arial', size: 10 }
      r.getCell(4).value = l2
      r.getCell(4).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF555555' } }
      r.getCell(5).value = v2
      r.getCell(5).font = { name: 'Arial', size: 10 }
    }
    row++

    const bordeFino = (argb?: string) => {
      const lado = { style: 'thin' as const, ...(argb ? { color: { argb } } : {}) }
      return { top: lado, bottom: lado, left: lado, right: lado }
    }

    // ── Estatus del pedido ──
    if (conEstatus) {
      ws.mergeCells(`A${row}:F${row}`)
      const celdaEstatus = ws.getCell(`A${row}`)
      celdaEstatus.value = tituloEstatus.toUpperCase()
      celdaEstatus.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF7F1D1D' } }
      celdaEstatus.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } }
      ws.getRow(row).height = 26
      row++
      if (filasEstatus.length > 0) {
        const enc = ws.getRow(row++)
        ;[['Motivo', 2], ['Detalle', 3], ['Reportado', 4], ['Resuelto', 5]].forEach(([h, col]) => {
          const c = enc.getCell(col as number)
          c.value = h
          c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D3748' } }
          c.border = bordeFino()
        })
        for (const fila of filasEstatus) {
          const r = ws.getRow(row++)
          fila.forEach((v, i) => {
            const c = r.getCell(i + 2)
            c.value = v
            c.font = { name: 'Arial', size: 10, ...(i === 3 && v === 'PENDIENTE' ? { bold: true, color: { argb: 'FFDC2626' } } : {}) }
            c.alignment = { vertical: 'middle', wrapText: true }
            c.border = bordeFino('FFE2E8F0')
          })
        }
      }
      if (filasEstatus.length === 0) {
        ws.mergeCells(`A${row}:F${row}`)
        ws.getCell(`A${row}`).value = '(Sin problemas reportados)'
        ws.getCell(`A${row}`).font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF999999' } }
        row++
      }
      if (descripcion) {
        ws.getCell(`A${row}`).value = 'Descripción:'
        ws.getCell(`A${row}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF555555' } }
        ws.mergeCells(`B${row}:F${row}`)
        const c = ws.getCell(`B${row}`)
        c.value = descripcion
        c.font = { name: 'Arial', size: 10 }
        c.alignment = { wrapText: true, vertical: 'top' }
        ws.getRow(row).height = Math.min(120, 15 * Math.ceil(descripcion.length / 90 + (descripcion.match(/\n/g)?.length ?? 0)))
        row++
      }
      row++
    }

    for (const seccion of secciones) {
      ws.mergeCells(`A${row}:F${row}`)
      const celda = ws.getCell(`A${row}`)
      celda.value = seccion.titulo
      celda.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF1A1A2E' } }
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } }
      ws.getRow(row).height = 28
      row++

      const encabezado = ws.getRow(row)
      ;['#', 'Material', 'Descripción', 'Cantidad', 'Unidad', '✓'].forEach((h, i) => {
        const c = encabezado.getCell(i + 1)
        c.value = h
        c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D3748' } }
        c.alignment = { horizontal: 'center', vertical: 'middle' }
        c.border = bordeFino()
      })
      encabezado.height = 24
      row++

      const dets = seccion.dets
      if (dets.length === 0) {
        ws.mergeCells(`A${row}:F${row}`)
        ws.getCell(`A${row}`).value = '(Sin materiales registrados)'
        ws.getCell(`A${row}`).font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF999999' } }
        row++
      } else {
        dets.forEach((det, idx) => {
          const r = ws.getRow(row++)
          const valores = [idx + 1, det.material, det.descripcion, Number(det.cantidad), det.unidad, det.checked ? '✓' : '☐']
          valores.forEach((v, i) => {
            const c = r.getCell(i + 1)
            c.value = v
            c.font = i === 5 && det.checked
              ? { name: 'Arial', size: 12, bold: true, color: { argb: 'FF22C55E' } }
              : { name: 'Arial', size: 10 }
            c.alignment = { vertical: 'middle', horizontal: i === 0 || i >= 3 ? 'center' : 'left', wrapText: i === 2 }
            c.border = bordeFino('FFE2E8F0')
            if (idx % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
          })
        })
      }
      row++
    }

    ;[6, 28, 36, 12, 10, 6].forEach((w, i) => { ws.getColumn(i + 1).width = w })

    const buffer = await wb.xlsx.writeBuffer()
    return new Response(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nombreArchivo}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  /* ═══ PDF (HTML imprimible) ═══ */
  const e = escaparHtml
  const bloques = secciones.map(({ titulo, dets }) => {
    const cuerpo = dets.length === 0
      ? '<p class="empty">(Sin materiales registrados)</p>'
      : `<table><thead><tr><th>#</th><th>Material</th><th>Descripción</th><th>Cantidad</th><th>Unidad</th><th>✓</th></tr></thead><tbody>${
          dets.map((d, i) => `<tr><td>${i + 1}</td><td>${e(d.material)}</td><td>${e(d.descripcion)}</td><td class="c">${e(d.cantidad)}</td><td class="c">${e(d.unidad)}</td><td class="c ${d.checked ? 'check-green' : 'check-gray'}">${d.checked ? '✓' : '☐'}</td></tr>`).join('')
        }</tbody></table>`
    return `<div class="partida-title">${e(titulo)}</div>${cuerpo}`
  }).join('\n')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(nombreArchivo)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; padding: 24px; color: #1a1a2e; font-size: 11px; background: #fff; }
    .header { text-align: center; margin-bottom: 20px; border-bottom: 3px solid #1a1a2e; padding-bottom: 12px; }
    .header h1 { font-size: 20px; margin-bottom: 4px; }
    .header p { color: #666; font-size: 11px; }
    .info { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 20px; }
    .info .label { font-weight: bold; color: #555; }
    .partida-title { background: #f0f4ff; padding: 8px 12px; font-size: 13px; font-weight: bold; margin: 16px 0 8px; border-left: 4px solid #3b82f6; break-after: avoid; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th { background: #2d3748; color: #fff; padding: 6px 8px; font-size: 10px; text-align: left; }
    td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; }
    tr { break-inside: avoid; }
    tr:nth-child(even) { background: #f8fafc; }
    .c { text-align: center; }
    .check-green { color: #22c55e; font-weight: bold; font-size: 14px; }
    .check-gray { color: #ccc; font-size: 14px; }
    .empty { color: #999; font-style: italic; padding: 8px; }
    .estatus { background: #fef2f2; border-left-color: #dc2626; }
    .pendiente { color: #dc2626; font-weight: bold; }
    .descripcion { white-space: pre-wrap; margin: 6px 0 12px; font-size: 11px; }
    .descripcion .label { font-weight: bold; color: #555; }
    @media print {
      body { padding: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;margin-bottom:16px;">
    <button onclick="window.print()" style="padding:10px 24px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;">
      Imprimir / Guardar como PDF
    </button>
  </div>
  <div class="header">
    <h1>${e(tituloReporte)}</h1>
    <p>Generado por SULA MOB · ${e(fechaLegible(new Date().toISOString()))}</p>
  </div>
  <div class="info">
    ${info.flatMap(([l1, v1, l2, v2]) => [
      `<div><span class="label">${e(l1)}</span> ${e(v1)}</div>`,
      `<div><span class="label">${e(l2)}</span> ${e(v2)}</div>`,
    ]).join('\n    ')}
  </div>
  ${conEstatus ? `
  <div class="partida-title estatus">${e(tituloEstatus)}</div>
  ${filasEstatus.length > 0 ? `<table><thead><tr><th>Motivo</th><th>Detalle</th><th>Reportado</th><th>Resuelto</th></tr></thead><tbody>${
    filasEstatus.map(f => `<tr><td>${e(f[0])}</td><td>${e(f[1])}</td><td>${e(f[2])}</td><td class="${f[3] === 'PENDIENTE' ? 'pendiente' : ''}">${e(f[3])}</td></tr>`).join('')
  }</tbody></table>` : '<p class="empty">(Sin problemas reportados)</p>'}
  ${descripcion ? `<p class="descripcion"><span class="label">Descripción:</span> ${e(descripcion)}</p>` : ''}` : ''}
  ${bloques || (soloEstatus ? '' : '<p class="empty">(No hay partidas seleccionadas)</p>')}
</body>
</html>`

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
