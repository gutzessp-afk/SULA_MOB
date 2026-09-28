
'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Plus, Trash2, Download, ClipboardList } from 'lucide-react'
import jsPDF from 'jspdf'
import {
  getUsuarioActual,
  getModulosDeProduccion,
  getAvancesDeHoy,
  registrarAvance,
  eliminarAvance,
  type AreaDelOperador,
  type AvanceRegistrado,
} from '../actions'

interface RegistroEnCurso {
  areaId: string
  horaInicio: string
  productoId: string
  operacion: string
  descripcion: string
  piezas: string
}

const inputClass =
  'w-full bg-[#08090d] border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-red-700'

function horaActual() {
  return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function fechaActual() {
  return new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fechaDeISO(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function horaDeISO(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function inicioDelDiaISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function generarPDFDelDia(avances: AvanceRegistrado[], operador: string, fecha: string) {
  if (avances.length === 0) {
    alert('No hay registros de hoy todavía para generar el PDF.')
    return
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  doc.setFillColor(15, 15, 20)
  doc.rect(0, 0, 210, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('SULA MOB', 12, 10)
  doc.setTextColor(220, 38, 38)
  doc.setFontSize(10)
  doc.text('CONTROL PRODUCTIVO', 12, 17)

  doc.setTextColor(20, 20, 20)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Generado digitalmente · ${fecha}`, 150, 12)

  let y = 32
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Operador:', 12, y)
  doc.setFont('helvetica', 'normal')
  doc.text(operador, 32, y)
  doc.setFont('helvetica', 'bold')
  doc.text('Fecha:', 130, y)
  doc.setFont('helvetica', 'normal')
  doc.text(fecha, 145, y)

  y += 8
  const colX = { proceso: 12, inicio: 50, termino: 68, proyecto: 86, operacion: 116, desc: 146, piezas: 190 }

  function encabezadoTabla() {
    doc.setFillColor(240, 240, 240)
    doc.rect(10, y - 4, 190, 7, 'F')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('Proceso', colX.proceso, y)
    doc.text('Inicio', colX.inicio, y)
    doc.text('Término', colX.termino, y)
    doc.text('Proyecto', colX.proyecto, y)
    doc.text('Operación', colX.operacion, y)
    doc.text('Descripción', colX.desc, y)
    doc.text('Piezas', colX.piezas, y)
    y += 6
  }

  encabezadoTabla()
  doc.setFont('helvetica', 'normal')

  let total = 0
  avances.forEach((a) => {
    if (y > 275) {
      doc.addPage()
      y = 20
      encabezadoTabla()
      doc.setFont('helvetica', 'normal')
    }

    total += a.piezas

    doc.setFontSize(8)
    doc.text(a.areaNombre, colX.proceso, y, { maxWidth: 36 })
    doc.text(a.horaInicio, colX.inicio, y)
    doc.text(horaDeISO(a.createdAt), colX.termino, y)
    doc.text(a.proyectoNombre, colX.proyecto, y, { maxWidth: 28 })
    doc.text(a.operacion, colX.operacion, y, { maxWidth: 28 })
    doc.text(a.descripcion || '—', colX.desc, y, { maxWidth: 42 })
    doc.text(String(a.piezas), colX.piezas, y)

    doc.setDrawColor(220, 220, 220)
    doc.line(10, y + 2, 200, y + 2)
    y += 7
  })

  y += 2
  doc.setFont('helvetica', 'bold')
  doc.text(`Total de piezas: ${total}`, colX.desc, y)

  y += 25
  doc.setDrawColor(150, 150, 150)
  doc.line(12, y, 80, y)
  doc.line(120, y, 188, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('Supervisor de Área', 12, y + 5)
  doc.text('Gerente de Producción', 120, y + 5)

  doc.save(`control_productivo_${operador.replace(/\s+/g, '_')}_${fecha.replace(/\//g, '-')}.pdf`)
}

export default function AvancesPage() {
  const [cargando, setCargando] = useState(true)
  const [operador, setOperador] = useState('')
  const [areas, setAreas] = useState<AreaDelOperador[]>([])
  const [avancesHoy, setAvancesHoy] = useState<AvanceRegistrado[]>([])
  const [registro, setRegistro] = useState<RegistroEnCurso | null>(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  async function cargarTodo() {
    const [usuario, areasData, avancesData] = await Promise.all([
      getUsuarioActual(),
      getModulosDeProduccion(),
      getAvancesDeHoy(inicioDelDiaISO()),
    ])
    setOperador(usuario?.nombre ?? 'Operador')
    setAreas(areasData)
    setAvancesHoy(avancesData)
    setCargando(false)
  }

  useEffect(() => {
    cargarTodo()
  }, [])

  function iniciarRegistro(areaId: string) {
    setRegistro({
      areaId,
      horaInicio: horaActual(),
      productoId: '',
      operacion: '',
      descripcion: '',
      piezas: '',
    })
    setError('')
  }

  function cancelarRegistro() {
    setRegistro(null)
    setError('')
  }

  function cambiar(campo: keyof RegistroEnCurso, valor: string) {
    setRegistro((r) => (r ? { ...r, [campo]: valor } : r))
  }

  async function guardar() {
    if (!registro) return

    const piezas = Number(registro.piezas)
    if (!registro.productoId || !registro.operacion.trim() || !piezas || piezas <= 0) {
      setError('Producto, operación y número de piezas son obligatorios.')
      return
    }

    const area = areas.find((a) => a.areaId === registro.areaId)
    const producto = area?.productos.find((p) => p.productoId === registro.productoId)
    if (!area || !producto) {
      setError('Selecciona un producto válido.')
      return
    }

    setGuardando(true)
    const resultado = await registrarAvance({
      proyectoId: producto.proyectoId,
      areaId: area.areaId,
      productoId: producto.productoId,
      piezas,
      operacion: registro.operacion.trim(),
      descripcion: registro.descripcion.trim(),
      horaInicio: registro.horaInicio,
    })
    setGuardando(false)

    if (resultado.error) {
      setError(resultado.error)
      return
    }

    setRegistro(null)
    setError('')
    await cargarTodo()
  }

  async function borrar(id: string) {
    if (!window.confirm('¿Eliminar este registro? Se restarán sus piezas del avance del proyecto.')) {
      return
    }
    setEliminandoId(id)
    const resultado = await eliminarAvance(id)
    setEliminandoId(null)

    if (resultado.error) {
      alert(resultado.error)
      return
    }
    await cargarTodo()
  }

  if (cargando) {
    return (
      <div className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl text-slate-400 text-sm">
        Cargando módulos...
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div>
          <h1 className="text-xl font-black text-white tracking-wider uppercase flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-red-600" />
            Control <span className="text-red-600">Productivo</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">{operador}</p>
        </div>

        <button
          onClick={() => generarPDFDelDia(avancesHoy, operador, fechaActual())}
          className="flex items-center gap-2 bg-red-700 hover:bg-red-600 text-white text-xs font-bold uppercase tracking-wide px-4 py-2.5 rounded-xl transition self-start sm:self-auto"
        >
          <Download className="w-4 h-4" />
          Descargar PDF del día
        </button>
      </div>

      {areas.length === 0 && (
        <div className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl text-slate-400 text-sm text-center">
          No hay módulos disponibles todavía.
        </div>
      )}

      {areas.map((area) => {
        const formularioAbierto = registro?.areaId === area.areaId
        const registros = avancesHoy.filter((a) => a.areaId === area.areaId)

        return (
          <div
            key={area.areaId}
            className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                {area.areaNombre}
              </h2>
              {!formularioAbierto && (
                <button
                  onClick={() => iniciarRegistro(area.areaId)}
                  className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-red-500 hover:text-red-400 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar registro
                </button>
              )}
            </div>

            {/* Tabla: tablet y laptop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-800/60">
                    <th className="text-left font-bold px-6 py-2.5">Fecha</th>
                    <th className="text-left font-bold px-3 py-2.5">Inicio</th>
                    <th className="text-left font-bold px-3 py-2.5">Término</th>
                    <th className="text-left font-bold px-3 py-2.5">Proyecto</th>
                    <th className="text-left font-bold px-3 py-2.5">Operación</th>
                    <th className="text-left font-bold px-3 py-2.5">Descripción</th>
                    <th className="text-left font-bold px-3 py-2.5">No. Piezas</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {registros.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-6 text-center text-slate-600">
                        Sin registros todavía
                      </td>
                    </tr>
                  )}
                  {registros.map((a) => (
                    <tr key={a.id} className="border-b border-slate-800/40 last:border-0 text-slate-300">
                      <td className="px-6 py-2.5">{fechaDeISO(a.createdAt)}</td>
                      <td className="px-3 py-2.5">{a.horaInicio}</td>
                      <td className="px-3 py-2.5">{horaDeISO(a.createdAt)}</td>
                      <td className="px-3 py-2.5 font-semibold text-white">{a.proyectoNombre}</td>
                      <td className="px-3 py-2.5 text-red-400">{a.operacion}</td>
                      <td className="px-3 py-2.5 text-slate-400">{a.descripcion || '—'}</td>
                      <td className="px-3 py-2.5">{a.piezas}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => borrar(a.id)}
                            disabled={eliminandoId === a.id}
                            className="text-slate-500 hover:text-red-500 disabled:opacity-40 transition"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tarjetas: celular */}
            <div className="md:hidden divide-y divide-slate-800/40">
              {registros.length === 0 && (
                <p className="px-6 py-6 text-center text-slate-600 text-xs">Sin registros todavía</p>
              )}
              {registros.map((a) => (
                <div key={a.id} className="px-5 py-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">{a.proyectoNombre}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-white font-bold text-xs">{a.piezas} pzs</span>
                      <button
                        onClick={() => borrar(a.id)}
                        disabled={eliminandoId === a.id}
                        className="text-slate-500 hover:text-red-500 disabled:opacity-40 transition"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-red-400 font-semibold">{a.operacion}</p>
                  {a.descripcion && <p className="text-xs text-slate-400">{a.descripcion}</p>}
                  <p className="text-[11px] text-slate-500">
                    {fechaDeISO(a.createdAt)} · {a.horaInicio} – {horaDeISO(a.createdAt)}
                  </p>
                </div>
              ))}
            </div>

            {formularioAbierto && registro && (
              <div className="px-6 pb-5 pt-4 space-y-3 bg-[#08090d]/60 border-t border-slate-800/60">
                <p className="text-[11px] text-slate-500">
                  Fecha {fechaActual()} · Inicio {registro.horaInicio} · Término: al guardar
                </p>

                {area.productos.length === 0 ? (
                  <p className="text-xs text-amber-500">
                    El administrador todavía no ha cargado proyectos.
                  </p>
                ) : (
                  <select
                    value={registro.productoId}
                    onChange={(e) => cambiar('productoId', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Selecciona el proyecto / producto</option>
                    {area.productos.map((p) => (
                      <option key={p.productoId} value={p.productoId}>
                        {p.proyectoNombre} · {p.productoNombre} ({p.piezasCompletadas}/{p.piezasTotales} pzs)
                      </option>
                    ))}
                  </select>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={registro.operacion}
                    onChange={(e) => cambiar('operacion', e.target.value)}
                    placeholder="Operación"
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={registro.descripcion}
                    onChange={(e) => cambiar('descripcion', e.target.value)}
                    placeholder="Descripción"
                    className={inputClass}
                  />
                  <input
                    type="number"
                    value={registro.piezas}
                    onChange={(e) => cambiar('piezas', e.target.value)}
                    placeholder="No. de piezas"
                    className={inputClass}
                  />
                </div>

                {error && <p className="text-[11px] text-red-500">{error}</p>}

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={guardar}
                    disabled={guardando || area.productos.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold uppercase py-2.5 rounded-xl transition"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {guardando ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button
                    onClick={cancelarRegistro}
                    className="text-slate-500 hover:text-slate-300 text-xs font-bold uppercase px-3"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}