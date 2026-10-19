
import type { EvidenciaDia, EvidenciaFila, ResumenAreaDia } from './pieza-actions'

const ZONA = 'America/Mexico_City'

// Logo que ya existe en la carpeta "public". Si no se puede cargar, se dibuja "SULA MOB" con letras.
const LOGOS = ['/SULA_MOB_logo_transparente.png']

type RGB = [number, number, number]
const AZUL: RGB = [37, 99, 235]
const NAVY: RGB = [15, 27, 61]
const GRIS: RGB = [100, 116, 139]
const CLARO: RGB = [241, 245, 249]
const BORDE: RGB = [226, 232, 240]
const AMBAR: RGB = [180, 83, 9]
const VERDE: RGB = [4, 120, 87]

function duracion(seg: number) {
  const s = Math.max(0, Math.round(seg))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`
  return m > 0 ? `${m} min` : s > 0 ? '<1 min' : '0 min'
}

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: ZONA,
  })
}

async function cargarLogo(): Promise<{ data: string; w: number; h: number; fmt: 'PNG' | 'JPEG' } | null> {
  for (const ruta of LOGOS) {
    try {
      const res = await fetch(ruta)
      const tipo = res.headers.get('content-type') ?? ''
      if (!res.ok || !tipo.startsWith('image/') || tipo.includes('svg')) continue
      const blob = await res.blob()
      const data = await new Promise<string>((ok, mal) => {
        const r = new FileReader()
        r.onload = () => ok(String(r.result))
        r.onerror = () => mal(new Error('logo'))
        r.readAsDataURL(blob)
      })
      const dim = await new Promise<{ w: number; h: number }>((ok, mal) => {
        const i = new Image()
        i.onload = () => ok({ w: i.width, h: i.height })
        i.onerror = () => mal(new Error('logo'))
        i.src = data
      })
      return { data, ...dim, fmt: tipo.includes('jpeg') || tipo.includes('jpg') ? 'JPEG' : 'PNG' }
    } catch {
      /* probar el siguiente */
    }
  }
  return null
}

export async function crearPdfDia(ev: EvidenciaDia): Promise<{ blob: Blob; nombre: string }> {
  const { jsPDF } = await import('jspdf')
  const logo = await cargarLogo()
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })

  const W = 216
  const H = 279
  const M = 12
  const util = W - M * 2
  const pieY = 268
  let y = 0

  const fijar = (c: RGB) => doc.setTextColor(c[0], c[1], c[2])
  const relleno = (c: RGB) => doc.setFillColor(c[0], c[1], c[2])
  const trazo = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2])

  const fechaLarga = new Date(`${ev.fecha}T12:00:00-06:00`).toLocaleDateString('es-MX', {
    dateStyle: 'full',
    timeZone: ZONA,
  })
  const generado = new Date().toLocaleString('es-MX', { timeZone: ZONA })

  /* ---------- encabezado (en cada pagina) ---------- */
  function encabezado(primera: boolean) {
    relleno(NAVY)
    doc.rect(0, 0, W, primera ? 34 : 18, 'F')
    relleno(AZUL)
    doc.rect(0, primera ? 34 : 18, W, 1.4, 'F')

    // logo
    let xTexto = M
    if (logo) {
      const alto = primera ? 20 : 11
      const ancho = Math.min((logo.w / logo.h) * alto, 60)
      doc.addImage(logo.data, logo.fmt, M, primera ? 7 : 3.5, ancho, ancho / (logo.w / logo.h))
      xTexto = M + ancho + 6
    } else {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(primera ? 24 : 14)
      fijar([255, 255, 255])
      doc.text('SULA', M, primera ? 19 : 11.5)
      const wSula = doc.getTextWidth('SULA')
      fijar([96, 165, 250])
      doc.text(' MOB', M + wSula, primera ? 19 : 11.5)
      xTexto = M + wSula + doc.getTextWidth(' MOB') + 8
    }

    doc.setFont('helvetica', 'bold')
    fijar([255, 255, 255])
    if (primera) {
      doc.setFontSize(15)
      doc.text('EVIDENCIA DE PRODUCCIÓN', W - M, 15, { align: 'right' })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      fijar([186, 200, 230])
      doc.text(`Reporte diario · ${fechaLarga}`, W - M, 22, { align: 'right' })
      doc.text(
        ev.proyecto ? `Proyecto: ${ev.codigo ? ev.codigo + ' · ' : ''}${ev.proyecto}` : 'Todos los proyectos',
        W - M,
        27.5,
        { align: 'right' }
      )
    } else {
      doc.setFontSize(9)
      fijar([186, 200, 230])
      doc.text(`Evidencia de producción · ${ev.fecha}`, W - M, 11.5, { align: 'right' })
    }
    void xTexto
    y = primera ? 42 : 25
  }

  function nuevaPagina() {
    doc.addPage()
    encabezado(false)
  }

  function asegurar(alto: number) {
    if (y + alto > pieY - 4) nuevaPagina()
  }

  encabezado(true)

  /* ---------- tarjetas de resumen ---------- */
  const totalPiezas = ev.filas.reduce((s, f) => s + f.piezas, 0)
  const totalTrabajado = ev.filas.reduce((s, f) => s + f.segTrabajado, 0)
  const totalPausas = ev.filas.reduce((s, f) => s + f.segPausa, 0)
  const totalReportes = ev.filas.reduce((s, f) => s + f.segReporte, 0)

  const tarjetas: { t: string; v: string; c: RGB }[] = [
    { t: 'REGISTROS', v: String(ev.filas.length), c: NAVY },
    { t: 'PIEZAS HECHAS', v: String(totalPiezas), c: VERDE },
    { t: 'TIEMPO TRABAJADO', v: duracion(totalTrabajado), c: AZUL },
    { t: 'EN PAUSAS', v: duracion(totalPausas), c: GRIS },
    { t: 'PERDIDO POR REPORTES', v: duracion(totalReportes), c: AMBAR },
  ]
  const gap = 3
  const anchoT = (util - gap * (tarjetas.length - 1)) / tarjetas.length
  tarjetas.forEach((t, i) => {
    const x = M + i * (anchoT + gap)
    relleno(CLARO)
    trazo(BORDE)
    doc.roundedRect(x, y, anchoT, 19, 2, 2, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    fijar(GRIS)
    doc.text(t.t, x + 3, y + 6)
    doc.setFontSize(t.v.length > 8 ? 11 : 15)
    fijar(t.c)
    doc.text(t.v, x + 3, y + 14.5)
  })
  y += 26

  /* ---------- utilidades de seccion ---------- */
  function titulo(txt: string, nota?: string) {
    asegurar(18)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    fijar(NAVY)
    doc.text(txt, M, y + 4)
    relleno(AZUL)
    doc.rect(M, y + 6, 18, 0.9, 'F')
    if (nota) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      fijar(GRIS)
      doc.text(nota, W - M, y + 4, { align: 'right' })
    }
    y += 10
  }

  type Col = { t: string; w: number; a: 'left' | 'center' | 'right' }
  function escalar(cs: Col[]) {
    const suma = cs.reduce((a, c) => a + c.w, 0)
    return cs.map((c) => ({ ...c, w: (c.w * util) / suma }))
  }
  function cabecera(cs: Col[]) {
    relleno(NAVY)
    doc.rect(M, y, util, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    fijar([255, 255, 255])
    let x = M
    cs.forEach((c) => {
      const tx = c.a === 'left' ? x + 2 : c.a === 'right' ? x + c.w - 2 : x + c.w / 2
      doc.text(c.t, tx, y + 4.7, { align: c.a })
      x += c.w
    })
    y += 7
  }
  function celda(cs: Col[], i: number, x: number, txt: string, yy: number) {
    const c = cs[i]
    const tx = c.a === 'left' ? x + 2 : c.a === 'right' ? x + c.w - 2 : x + c.w / 2
    doc.text(txt, tx, yy, { align: c.a })
    return x + c.w
  }

  const horasDe = (f: EvidenciaFila) =>
    Number(
      new Date(f.fin).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: ZONA }).slice(0, 2)
    )

  /* ---------- resumen por area (todas) ---------- */
  const nombresAreas: string[] =
    ev.areas.length > 0 ? ev.areas.map((a) => a.area) : Array.from(new Set(ev.filas.map((f) => f.area)))
  const infoArea = new Map<string, ResumenAreaDia>(ev.areas.map((a) => [a.area, a]))

  const colsRes = escalar([
    { t: 'Área', w: 34, a: 'left' },
    { t: 'Avance del proyecto', w: 34, a: 'left' },
    { t: 'Hechas / Meta', w: 21, a: 'center' },
    { t: 'Hoy', w: 11, a: 'center' },
    { t: 'Trabajado', w: 21, a: 'right' },
    { t: 'Pausas', w: 18, a: 'right' },
    { t: 'Reportes', w: 18, a: 'right' },
    { t: 'Pzas/h', w: 13, a: 'center' },
    { t: 'Estado', w: 22, a: 'left' },
  ])

  titulo('RESUMEN POR ÁREA', 'Todas las áreas del proyecto')
  asegurar(7 + 9)
  cabecera(colsRes)
  nombresAreas.forEach((nombre, idx) => {
    asegurar(9)
    const hechos = ev.filas.filter((f) => f.area === nombre)
    const info = infoArea.get(nombre)
    const piezasHoy = hechos.reduce((a, f) => a + f.piezas, 0)
    const trab = hechos.reduce((a, f) => a + f.segTrabajado, 0)
    const pau = hechos.reduce((a, f) => a + f.segPausa, 0)
    const rep = hechos.reduce((a, f) => a + f.segReporte, 0)
    const pzH = trab > 0 ? piezasHoy / (trab / 3600) : 0
    const sinPiezas = info ? info.piezasMeta === 0 : hechos.length === 0

    if (idx % 2 === 1) {
      relleno([248, 250, 252])
      doc.rect(M, y, util, 8, 'F')
    }
    let x = M
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    fijar(NAVY)
    x = celda(colsRes, 0, x, nombre, y + 5.2)

    // barra de avance
    const pct = Math.max(0, Math.min(100, info?.porcentaje ?? 0))
    const bw = colsRes[1].w - 16
    relleno(BORDE)
    doc.roundedRect(x + 2, y + 2.8, bw, 2.6, 1.2, 1.2, 'F')
    if (pct > 0) {
      relleno([20, 184, 166])
      doc.roundedRect(x + 2, y + 2.8, Math.max(2.4, (bw * pct) / 100), 2.6, 1.2, 1.2, 'F')
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    fijar([51, 65, 85])
    doc.text(`${pct}%`, x + bw + 4, y + 5.2)
    x += colsRes[1].w

    fijar([51, 65, 85])
    x = celda(colsRes, 2, x, sinPiezas ? '—' : `${info?.piezasHechas ?? 0} / ${info?.piezasMeta ?? 0}`, y + 5.2)
    doc.setFont('helvetica', 'bold')
    fijar(piezasHoy > 0 ? VERDE : GRIS)
    x = celda(colsRes, 3, x, String(piezasHoy), y + 5.2)
    doc.setFont('helvetica', 'normal')
    fijar([51, 65, 85])
    x = celda(colsRes, 4, x, hechos.length ? duracion(trab) : '—', y + 5.2)
    x = celda(colsRes, 5, x, hechos.length ? duracion(pau) : '—', y + 5.2)
    fijar(rep > 0 ? AMBAR : [51, 65, 85])
    x = celda(colsRes, 6, x, hechos.length ? duracion(rep) : '—', y + 5.2)
    fijar([51, 65, 85])
    x = celda(colsRes, 7, x, pzH > 0 ? pzH.toFixed(1) : '—', y + 5.2)

    let estado = 'Sin actividad'
    let ce: RGB = GRIS
    if (sinPiezas) estado = 'Sin piezas'
    else if (info?.pausa) {
      estado = `Pausa: ${info.pausa}`
      ce = AMBAR
    } else if ((info?.enCurso ?? 0) > 0) {
      estado = `${info?.enCurso} en curso`
      ce = VERDE
    } else if (info && info.porcentaje >= 100) {
      estado = 'Terminada'
      ce = VERDE
    }
    doc.setFontSize(7.5)
    fijar(ce)
    const est = doc.splitTextToSize(estado, colsRes[8].w - 3) as string[]
    doc.text(est[0], x + 2, y + 5.2)

    y += 8
    trazo(BORDE)
    doc.line(M, y, M + util, y)
  })
  y += 7

  /* ---------- produccion por hora ---------- */
  titulo('PRODUCCIÓN POR HORA', 'Piezas registradas en la hora en que se finalizaron')
  if (ev.filas.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    fijar(GRIS)
    doc.text('Sin piezas finalizadas en esta fecha.', M, y + 3)
    y += 9
  } else {
    const porHora = new Map<number, Map<string, number>>()
    ev.filas.forEach((f) => {
      const h = horasDe(f)
      const m = porHora.get(h) ?? new Map<string, number>()
      m.set(f.area, (m.get(f.area) ?? 0) + f.piezas)
      porHora.set(h, m)
    })
    const hs = Array.from(porHora.keys())
    const h0 = Math.min(...hs)
    const h1 = Math.max(...hs)
    const maxHora = Math.max(
      ...hs.map((h) => Array.from(porHora.get(h)!.values()).reduce((a, b) => a + b, 0))
    )
    const colsHora = escalar([
      { t: 'Hora', w: 26, a: 'left' },
      { t: 'Piezas', w: 14, a: 'center' },
      { t: '', w: 52, a: 'left' },
      { t: 'Detalle por área', w: 100, a: 'left' },
    ])
    asegurar(7 + 8)
    cabecera(colsHora)
    for (let h = h0; h <= h1; h++) {
      asegurar(8)
      const m = porHora.get(h)
      const total = m ? Array.from(m.values()).reduce((a, b) => a + b, 0) : 0
      if ((h - h0) % 2 === 1) {
        relleno([248, 250, 252])
        doc.rect(M, y, util, 7, 'F')
      }
      let x = M
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      fijar([51, 65, 85])
      x = celda(colsHora, 0, x, `${String(h).padStart(2, '0')}:00 – ${String((h + 1) % 24).padStart(2, '0')}:00`, y + 4.8)
      doc.setFont('helvetica', 'bold')
      fijar(total > 0 ? VERDE : GRIS)
      x = celda(colsHora, 1, x, String(total), y + 4.8)
      if (total > 0) {
        relleno(AZUL)
        doc.roundedRect(x + 2, y + 2, Math.max(1.5, ((colsHora[2].w - 6) * total) / maxHora), 3.2, 1, 1, 'F')
      }
      x += colsHora[2].w
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      fijar(GRIS)
      const det = m
        ? Array.from(m.entries())
            .map(([a, n]) => `${a} ${n}`)
            .join('  ·  ')
        : ''
      const l = doc.splitTextToSize(det, colsHora[3].w - 3) as string[]
      doc.text(l[0] ?? '', x + 2, y + 4.8)
      y += 7
      trazo(BORDE)
      doc.line(M, y, M + util, y)
    }
    asegurar(8)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    fijar(NAVY)
    doc.text(`Total del día: ${totalPiezas} piezas`, M + 2, y + 5.2)
    const horasTrab = totalTrabajado / 3600
    doc.text(
      `Promedio: ${horasTrab > 0 ? (totalPiezas / horasTrab).toFixed(1) : '0'} piezas por hora trabajada`,
      W - M - 2,
      y + 5.2,
      { align: 'right' }
    )
    y += 12
  }

  /* ---------- reportes al administrador ---------- */
  titulo('REPORTES AL ADMINISTRADOR', 'Problemas avisados durante el día')
  if (ev.reportes.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    fijar(GRIS)
    doc.text('Sin reportes en esta fecha.', M, y + 3)
    y += 10
  } else {
    const colsRep = escalar([
      { t: 'Hora', w: 12, a: 'center' },
      { t: 'Área', w: 30, a: 'left' },
      { t: 'Motivo', w: 40, a: 'left' },
      { t: 'Operador', w: 28, a: 'left' },
      { t: 'Perdido', w: 18, a: 'right' },
      { t: 'Descripción', w: 64, a: 'left' },
    ])
    asegurar(7 + 9)
    cabecera(colsRep)
    ev.reportes.forEach((r, idx) => {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      const desc = doc.splitTextToSize(
        `${r.nota ?? '—'}${r.fotoUrl ? '  [con foto]' : ''}`,
        colsRep[5].w - 3
      ) as string[]
      const alto = Math.max(7, desc.length * 3.6 + 3)
      asegurar(alto + 1)
      if (idx % 2 === 1) {
        relleno([248, 250, 252])
        doc.rect(M, y, util, alto, 'F')
      }
      let x = M
      doc.setFontSize(8)
      fijar([51, 65, 85])
      x = celda(colsRep, 0, x, hora(r.hora), y + 4.8)
      x = celda(colsRep, 1, x, (doc.splitTextToSize(r.area, colsRep[1].w - 3) as string[])[0], y + 4.8)
      doc.setFont('helvetica', 'bold')
      fijar(AMBAR)
      x = celda(colsRep, 2, x, (doc.splitTextToSize(r.motivo, colsRep[2].w - 3) as string[])[0], y + 4.8)
      doc.setFont('helvetica', 'normal')
      fijar([51, 65, 85])
      x = celda(colsRep, 3, x, (doc.splitTextToSize(r.operador, colsRep[3].w - 3) as string[])[0], y + 4.8)
      x = celda(colsRep, 4, x, r.horasPerdidas > 0 ? duracion(r.horasPerdidas * 3600) : 'en curso', y + 4.8)
      doc.setFontSize(7.5)
      fijar(GRIS)
      desc.forEach((l, i) => doc.text(l, x + 2, y + 4.6 + i * 3.6))
      y += alto
      trazo(BORDE)
      doc.line(M, y, M + util, y)
    })
    y += 8
  }

  titulo('DETALLE POR ÁREA', 'Cada pieza finalizada')

  if (ev.filas.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    fijar(GRIS)
    doc.text('No hay piezas finalizadas en esta fecha.', M, y + 3)
    y += 10
  }

  /* ---------- tabla por area ---------- */
  const columnas = [
    { t: 'Pieza', w: 74, a: 'left' as const },
    { t: 'Operador', w: 30, a: 'left' as const },
    { t: 'Inicio', w: 13, a: 'center' as const },
    { t: 'Fin', w: 13, a: 'center' as const },
    { t: 'Pzas', w: 11, a: 'center' as const },
    { t: 'Trabajado', w: 23, a: 'right' as const },
    { t: 'Pausas', w: 20, a: 'right' as const },
  ]
  const sumaW = columnas.reduce((s, c) => s + c.w, 0)
  const esc = util / sumaW
  const cols = columnas.map((c) => ({ ...c, w: c.w * esc }))

  function cabeceraTabla() {
    relleno(NAVY)
    doc.rect(M, y, util, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    fijar([255, 255, 255])
    let x = M
    cols.forEach((c) => {
      const tx = c.a === 'left' ? x + 2 : c.a === 'right' ? x + c.w - 2 : x + c.w / 2
      doc.text(c.t, tx, y + 4.8, { align: c.a })
      x += c.w
    })
    y += 7
  }

  const porArea = new Map<string, EvidenciaFila[]>()
  ev.filas.forEach((f) => {
    const l = porArea.get(f.area) ?? []
    l.push(f)
    porArea.set(f.area, l)
  })

  porArea.forEach((filas, area) => {
    asegurar(7 + 8 + 14)
    // franja del area
    relleno(AZUL)
    doc.rect(M, y, util, 7.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    fijar([255, 255, 255])
    doc.text(area.toUpperCase(), M + 3, y + 5.2)
    const piezasArea = filas.reduce((s, f) => s + f.piezas, 0)
    doc.setFontSize(8.5)
    doc.text(
      `${filas.length} ${filas.length === 1 ? 'registro' : 'registros'} · ${piezasArea} piezas · ${duracion(
        filas.reduce((s, f) => s + f.segTrabajado, 0)
      )}`,
      W - M - 3,
      y + 5.2,
      { align: 'right' }
    )
    y += 7.5
    cabeceraTabla()

    filas.forEach((f, idx) => {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      const nombre = doc.splitTextToSize(f.pieza, cols[0].w - 6) as string[]
      const proy = ev.proyecto ? [] : [`Proyecto: ${f.proyecto}`]
      const detalles: { txt: string; c: RGB }[] = [
        ...f.pausas.map((p) => ({ txt: `Pausa: ${p.motivo} (${duracion(p.seg)})`, c: GRIS })),
        ...f.reportes.map((r) => ({
          txt: `Reporte al administrador: ${r.motivo} (${duracion(r.seg)})`,
          c: AMBAR,
        })),
      ]
      const lineasNombre = nombre.slice(0, 4)
      const alto = Math.max(8, 2.5 + lineasNombre.length * 4 + (proy.length ? 3.6 : 0)) + detalles.length * 3.8

      asegurar(alto + 1)

      if (idx % 2 === 1) {
        relleno([248, 250, 252])
        doc.rect(M, y, util, alto, 'F')
      }

      let x = M
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      fijar(NAVY)
      lineasNombre.forEach((l, i) => doc.text(l, x + 2, y + 4.6 + i * 4))
      if (proy.length) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        fijar(GRIS)
        doc.text(proy[0], x + 2, y + 4.6 + lineasNombre.length * 4)
      }
      x += cols[0].w

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      fijar([51, 65, 85])
      const op = doc.splitTextToSize(f.operador, cols[1].w - 3) as string[]
      doc.text(op[0] ?? '', x + 2, y + 4.6)
      x += cols[1].w
      doc.text(hora(f.inicio), x + cols[2].w / 2, y + 4.6, { align: 'center' })
      x += cols[2].w
      doc.text(hora(f.fin), x + cols[3].w / 2, y + 4.6, { align: 'center' })
      x += cols[3].w
      doc.setFont('helvetica', 'bold')
      fijar(VERDE)
      doc.text(String(f.piezas), x + cols[4].w / 2, y + 4.6, { align: 'center' })
      x += cols[4].w
      doc.setFont('helvetica', 'normal')
      fijar([51, 65, 85])
      doc.text(duracion(f.segTrabajado), x + cols[5].w - 2, y + 4.6, { align: 'right' })
      x += cols[5].w
      doc.text(duracion(f.segPausa + f.segReporte), x + cols[6].w - 2, y + 4.6, { align: 'right' })

      const baseDet = y + Math.max(8, 2.5 + lineasNombre.length * 4 + (proy.length ? 3.6 : 0))
      doc.setFontSize(7.5)
      detalles.forEach((d, i) => {
        fijar(d.c)
        doc.text(`• ${d.txt}`, M + 4, baseDet + 1 + i * 3.8)
      })

      y += alto
      trazo(BORDE)
      doc.line(M, y, M + util, y)
    })
    y += 5
  })

  /* ---------- firmas ---------- */
  asegurar(34)
  y += 16
  trazo(GRIS)
  doc.line(M, y, M + 70, y)
  doc.line(W - M - 70, y, W - M, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  fijar(GRIS)
  doc.text('Firma del operador', M, y + 5)
  doc.text('Firma del supervisor', W - M - 70, y + 5)

  /* ---------- pie en todas las paginas ---------- */
  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    trazo(BORDE)
    doc.line(M, pieY, W - M, pieY)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    fijar(GRIS)
    doc.text(`SULA MOB · Generado ${generado}`, M, pieY + 5)
    doc.text(`Página ${i} de ${paginas}`, W - M, pieY + 5, { align: 'right' })
  }
  void H

  return { blob: doc.output('blob'), nombre: `evidencia-${ev.fecha}.pdf` }
}

export async function descargarPdfDia(ev: EvidenciaDia) {
  const { blob, nombre } = await crearPdfDia(ev)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}