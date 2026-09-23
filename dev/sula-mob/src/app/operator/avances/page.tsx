
'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  Plus,
  Trash2,
  Pencil,
  Download,
  ClipboardList,
} from 'lucide-react'
import jsPDF from 'jspdf'

const PROCESOS = [
  'Corte de Tubo',
  'Doblez',
  'Corte de Lámina',
  'Soldadura',
  'Alambrón',
  'Pulido',
  'Pintura',
  'Empaque',
] as const

type Proceso = (typeof PROCESOS)[number]

interface Avance {
  id: string
  fecha: string
  horaInicio: string
  horaTermino: string
  proyecto: string
  operacion: string
  descripcion: string
  piezas: string
}

function horaActual() {
  return new Date().toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fechaActual() {
  return new Date().toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// Genera un solo PDF con todos los avances del día, de todos los procesos,
// igual que la hoja física de "Control Productivo".
// TODO: cuando se conecte a Supabase, "operador" vendrá de la sesión real
// (usuario_id del usuario logueado), no de este texto fijo.
function generarPDFDelDia(
  avancesPorProceso: Record<Proceso, Avance[]>,
  operador: string,
  fecha: string
) {
  // Junta todos los avances de hoy, de todos los procesos, con su nombre de proceso
  const todos: (Avance & { proceso: Proceso })[] = []
  PROCESOS.forEach((proceso) => {
    avancesPorProceso[proceso]
      .filter((a) => a.fecha === fecha)
      .forEach((a) => todos.push({ ...a, proceso }))
  })

  if (todos.length === 0) {
    alert('No hay registros de hoy todavía para generar el PDF.')
    return
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  // Encabezado
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

  // Datos generales
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

  // Tabla
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
  todos.forEach((a) => {
    if (y > 275) {
      doc.addPage()
      y = 20
      encabezadoTabla()
      doc.setFont('helvetica', 'normal')
    }

    total += Number(a.piezas) || 0

    doc.setFontSize(8)
    doc.text(a.proceso, colX.proceso, y, { maxWidth: 36 })
    doc.text(a.horaInicio, colX.inicio, y)
    doc.text(a.horaTermino, colX.termino, y)
    doc.text(a.proyecto, colX.proyecto, y, { maxWidth: 28 })
    doc.text(a.operacion, colX.operacion, y, { maxWidth: 28 })
    doc.text(a.descripcion || '—', colX.desc, y, { maxWidth: 42 })
    doc.text(String(a.piezas), colX.piezas, y)

    doc.setDrawColor(220, 220, 220)
    doc.line(10, y + 2, 200, y + 2)
    y += 7
  })

  // Total
  y += 2
  doc.setFont('helvetica', 'bold')
  doc.text(`Total de piezas: ${total}`, colX.desc, y)

  // Firmas
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
  const [avances, setAvances] = useState<Record<Proceso, Avance[]>>(() =>
    PROCESOS.reduce((acc, p) => {
      acc[p] = []
      return acc
    }, {} as Record<Proceso, Avance[]>)
  )

  const [registroEnCurso, setRegistroEnCurso] = useState<{
    proceso: Proceso
    editId: string | null
    fecha: string
    horaInicio: string
    horaTermino: string
    proyecto: string
    operacion: string
    descripcion: string
    piezas: string
  } | null>(null)
  const [error, setError] = useState('')

  const operador = 'Nombre del Operador' // TODO: vendrá de la sesión real

  function iniciarRegistro(proceso: Proceso) {
    setRegistroEnCurso({
      proceso,
      editId: null,
      fecha: fechaActual(),
      horaInicio: horaActual(),
      horaTermino: '',
      proyecto: '',
      operacion: '',
      descripcion: '',
      piezas: '',
    })
    setError('')
  }

  function iniciarEdicion(proceso: Proceso, avance: Avance) {
    setRegistroEnCurso({
      proceso,
      editId: avance.id,
      fecha: avance.fecha,
      horaInicio: avance.horaInicio,
      horaTermino: avance.horaTermino,
      proyecto: avance.proyecto,
      operacion: avance.operacion,
      descripcion: avance.descripcion,
      piezas: avance.piezas,
    })
    setError('')
  }

  function cancelarRegistro() {
    setRegistroEnCurso(null)
    setError('')
  }

  function guardarAvance() {
    if (!registroEnCurso) return

    if (
      !registroEnCurso.proyecto.trim() ||
      !registroEnCurso.operacion.trim() ||
      !registroEnCurso.piezas.trim()
    ) {
      setError('Proyecto, operación y número de piezas son obligatorios.')
      return
    }

    if (registroEnCurso.editId) {
      setAvances((prev) => ({
        ...prev,
        [registroEnCurso.proceso]: prev[registroEnCurso.proceso].map((a) =>
          a.id === registroEnCurso.editId
            ? {
                ...a,
                proyecto: registroEnCurso.proyecto,
                operacion: registroEnCurso.operacion,
                descripcion: registroEnCurso.descripcion,
                piezas: registroEnCurso.piezas,
              }
            : a
        ),
      }))
      // TODO: Supabase -> UPDATE en la tabla "avances" donde id = editId
    } else {
      const nuevo: Avance = {
        id: crypto.randomUUID(),
        fecha: registroEnCurso.fecha,
        horaInicio: registroEnCurso.horaInicio,
        horaTermino: horaActual(),
        proyecto: registroEnCurso.proyecto,
        operacion: registroEnCurso.operacion,
        descripcion: registroEnCurso.descripcion,
        piezas: registroEnCurso.piezas,
      }

      setAvances((prev) => ({
        ...prev,
        [registroEnCurso.proceso]: [...prev[registroEnCurso.proceso], nuevo],
      }))
      // TODO: Supabase -> INSERT en la tabla "avances"
      // (usuario_id de la sesion, proceso, fecha, hora_inicio, hora_termino,
      //  proyecto_id, operacion, descripcion, piezas)
    }

    setRegistroEnCurso(null)
    setError('')
  }

  function eliminarAvance(proceso: Proceso, id: string) {
    setAvances((prev) => ({
      ...prev,
      [proceso]: prev[proceso].filter((a) => a.id !== id),
    }))
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
          onClick={() => generarPDFDelDia(avances, operador, fechaActual())}
          className="flex items-center gap-2 bg-red-700 hover:bg-red-600 text-white text-xs font-bold uppercase tracking-wide px-4 py-2.5 rounded-xl transition self-start sm:self-auto"
        >
          <Download className="w-4 h-4" />
          Descargar PDF del día
        </button>
      </div>

      {PROCESOS.map((proceso) => {
        const formularioAbierto = registroEnCurso?.proceso === proceso

        return (
          <div
            key={proceso}
            className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                {proceso}
              </h2>
              {!formularioAbierto && (
                <button
                  onClick={() => iniciarRegistro(proceso)}
                  className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-red-500 hover:text-red-400 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar registro
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
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
                  {avances[proceso].length === 0 && !formularioAbierto && (
                    <tr>
                      <td colSpan={8} className="px-6 py-6 text-center text-slate-600">
                        Sin registros todavía
                      </td>
                    </tr>
                  )}

                  {avances[proceso].map((a) => (
                    <tr key={a.id} className="border-b border-slate-800/40 last:border-0 text-slate-300">
                      <td className="px-6 py-2.5">{a.fecha}</td>
                      <td className="px-3 py-2.5">{a.horaInicio}</td>
                      <td className="px-3 py-2.5">{a.horaTermino}</td>
                      <td className="px-3 py-2.5 font-semibold text-white">{a.proyecto}</td>
                      <td className="px-3 py-2.5 text-red-400">{a.operacion}</td>
                      <td className="px-3 py-2.5 text-slate-400">{a.descripcion || '—'}</td>
                      <td className="px-3 py-2.5">{a.piezas}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-2.5">
                          <button
                            onClick={() => iniciarEdicion(proceso, a)}
                            className="text-slate-500 hover:text-amber-400 transition"
                            title="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => eliminarAvance(proceso, a.id)}
                            className="text-slate-500 hover:text-red-500 transition"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {formularioAbierto && registroEnCurso && (
                    <tr className="bg-[#08090d]/60">
                      <td className="px-6 py-2.5 text-slate-500">{registroEnCurso.fecha}</td>
                      <td className="px-3 py-2.5 text-slate-500">{registroEnCurso.horaInicio}</td>
                      <td className="px-3 py-2.5 text-slate-600 italic">
                        {registroEnCurso.editId ? registroEnCurso.horaTermino : 'al guardar'}
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="text"
                          value={registroEnCurso.proyecto}
                          onChange={(e) =>
                            setRegistroEnCurso((r) => (r ? { ...r, proyecto: e.target.value } : r))
                          }
                          placeholder="Proyecto"
                          className="w-full bg-[#08090d] border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-red-700"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="text"
                          value={registroEnCurso.operacion}
                          onChange={(e) =>
                            setRegistroEnCurso((r) => (r ? { ...r, operacion: e.target.value } : r))
                          }
                          placeholder="Operación"
                          className="w-full bg-[#08090d] border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-red-700"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="text"
                          value={registroEnCurso.descripcion}
                          onChange={(e) =>
                            setRegistroEnCurso((r) => (r ? { ...r, descripcion: e.target.value } : r))
                          }
                          placeholder="Descripción"
                          className="w-full bg-[#08090d] border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-red-700"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number"
                          value={registroEnCurso.piezas}
                          onChange={(e) =>
                            setRegistroEnCurso((r) => (r ? { ...r, piezas: e.target.value } : r))
                          }
                          placeholder="0"
                          className="w-full bg-[#08090d] border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-red-700"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={guardarAvance} className="text-emerald-500 hover:text-emerald-400 transition" title="Guardar">
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button onClick={cancelarRegistro} className="text-slate-600 hover:text-slate-400 transition text-[10px] font-bold uppercase">
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {formularioAbierto && error && (
                <p className="text-[11px] text-red-500 px-6 pb-3">{error}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}