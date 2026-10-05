
'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertOctagon, Camera, CheckCircle2, Clock, ImagePlus, Send, X } from 'lucide-react'
import {
  crearRetraso,
  getAreasDeProyecto,
  getMisRetrasos,
  getProyectosRetraso,
  type OpcionArea,
  type OpcionProyecto,
  type RetrasoReciente,
} from '../retrasos-actions'

const vacio = { proyectoId: '', areaId: '', motivo: '', descripcion: '', horas: '' }

const campo =
  'w-full bg-[#08090d] border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-600 transition'
const etiqueta = 'text-[11px] font-bold text-slate-400 uppercase tracking-wider'

function fechaCorta(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// Reduce la foto a ~1280px para que suba rápido y no pase el límite del servidor.
async function comprimir(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file)
    const escala = Math.min(1, 1280 / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * escala)
    canvas.height = Math.round(bmp.height * escala)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.8))
    if (!blob) return file
    return new File([blob], 'evidencia.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export default function RetrasosPage() {
  const [cargando, setCargando] = useState(true)
  const [proyectos, setProyectos] = useState<OpcionProyecto[]>([])
  const [areas, setAreas] = useState<OpcionArea[]>([])
  const [cargandoAreas, setCargandoAreas] = useState(false)
  const [recientes, setRecientes] = useState<RetrasoReciente[]>([])
  const [form, setForm] = useState(vacio)
  const [foto, setFoto] = useState<File | null>(null)
  const [vista, setVista] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [guardado, setGuardado] = useState(false)

  const [camaraAbierta, setCamaraAbierta] = useState(false)
  const [errorCamara, setErrorCamara] = useState('')
  const inputCamara = useRef<HTMLInputElement>(null)
  const inputGaleria = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    async function cargar() {
      const [p, r] = await Promise.all([getProyectosRetraso(), getMisRetrasos(5)])
      setProyectos(p)
      setRecientes(r)
      setCargando(false)
    }
    cargar()
  }, [])

  function detenerCamara() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  // Apaga la cámara si sales de la pantalla
  useEffect(() => () => detenerCamara(), [])

  // Conecta la cámara al video cuando se abre el visor
  useEffect(() => {
    if (camaraAbierta && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [camaraAbierta])

  function cambiar(nombre: keyof typeof vacio, valor: string) {
    setForm((f) => ({ ...f, [nombre]: valor }))
    setGuardado(false)
    setError('')
  }

  async function elegirProyecto(id: string) {
    setForm((f) => ({ ...f, proyectoId: id, areaId: '' }))
    setGuardado(false)
    setError('')
    setAreas([])
    if (!id) return
    setCargandoAreas(true)
    setAreas(await getAreasDeProyecto(id))
    setCargandoAreas(false)
  }

  async function elegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const original = e.target.files?.[0]
    e.target.value = ''
    if (!original) return
    const archivo = await comprimir(original)
    if (vista) URL.revokeObjectURL(vista)
    setFoto(archivo)
    setVista(URL.createObjectURL(archivo))
    setGuardado(false)
  }

  function quitarFoto() {
    if (vista) URL.revokeObjectURL(vista)
    setFoto(null)
    setVista('')
  }

  async function abrirCamara() {
    setErrorCamara('')

    // Celular o tablet: cámara nativa del dispositivo
    const esMovil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    if (esMovil) {
      inputCamara.current?.click()
      return
    }

    // Computadora: cámara web
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setErrorCamara('La cámara solo funciona desde http://localhost:3000 o desde una dirección https.')
      return
    }

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      setCamaraAbierta(true)
    } catch (e) {
      const nombre = (e as DOMException).name
      if (nombre === 'NotAllowedError') {
        setErrorCamara(
          'El navegador bloqueó la cámara. Toca el candado junto a la dirección, permite la cámara y recarga la página.'
        )
      } else if (nombre === 'NotFoundError') {
        setErrorCamara('No se encontró ninguna cámara en este equipo.')
      } else if (nombre === 'NotReadableError') {
        setErrorCamara('La cámara está siendo usada por otra aplicación. Ciérrala e intenta de nuevo.')
      } else {
        setErrorCamara('No se pudo abrir la cámara.')
      }
    }
  }

  function cerrarCamara() {
    detenerCamara()
    setCamaraAbierta(false)
  }

  function capturar() {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const escala = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(v.videoWidth * escala)
    canvas.height = Math.round(v.videoHeight * escala)
    canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const archivo = new File([blob], 'evidencia.jpg', { type: 'image/jpeg' })
        if (vista) URL.revokeObjectURL(vista)
        setFoto(archivo)
        setVista(URL.createObjectURL(archivo))
        setGuardado(false)
        cerrarCamara()
      },
      'image/jpeg',
      0.8
    )
  }

  async function enviar() {
    if (!form.proyectoId) return setError('Elige el proyecto.')
    if (!form.motivo.trim()) return setError('El motivo es obligatorio.')

    const datos = new FormData()
    datos.append('proyectoId', form.proyectoId)
    datos.append('areaId', form.areaId)
    datos.append('motivo', form.motivo)
    datos.append('descripcion', form.descripcion)
    datos.append('horas', form.horas)
    if (foto) datos.append('evidencia', foto)

    setEnviando(true)
    const res = await crearRetraso(datos)
    setEnviando(false)

    if (!res.ok) {
      setError(res.error ?? 'No se pudo guardar.')
      return
    }

    setForm(vacio)
    setAreas([])
    quitarFoto()
    setGuardado(true)
    setRecientes(await getMisRetrasos(5))
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xl">
        <h1 className="text-xl font-black text-white tracking-wider uppercase flex items-center gap-2">
          <AlertOctagon className="w-5 h-5 text-red-600" />
          Reportar <span className="text-red-600">Retraso</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Registra un retraso en tu área. El motivo es obligatorio para notificar al administrador.
        </p>
      </div>

      {cargando ? (
        <div className="bg-[#0e1017]/80 border border-slate-800 p-6 rounded-2xl text-slate-400 text-sm">
          Cargando...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xl space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Nuevo retraso</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={etiqueta}>Proyecto *</label>
                <select
                  value={form.proyectoId}
                  onChange={(e) => elegirProyecto(e.target.value)}
                  className={`${campo} mt-1.5`}
                >
                  <option value="">
                    {proyectos.length === 0 ? 'No hay proyectos cargados' : 'Selecciona un proyecto'}
                  </option>
                  {proyectos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo ? `${p.codigo} · ` : ''}
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={etiqueta}>Área</label>
                <select
                  value={form.areaId}
                  onChange={(e) => cambiar('areaId', e.target.value)}
                  disabled={!form.proyectoId || cargandoAreas}
                  className={`${campo} mt-1.5 disabled:opacity-50`}
                >
                  <option value="">
                    {!form.proyectoId
                      ? 'Elige primero un proyecto'
                      : cargandoAreas
                        ? 'Cargando...'
                        : areas.length === 0
                          ? 'Este proyecto no tiene áreas'
                          : 'Selecciona un área'}
                  </option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={etiqueta}>Motivo del retraso *</label>
              <input
                type="text"
                value={form.motivo}
                onChange={(e) => cambiar('motivo', e.target.value)}
                placeholder="Ej: Falta de material, falla de maquinaria..."
                className={`${campo} mt-1.5`}
              />
            </div>

            <div>
              <label className={etiqueta}>Descripción</label>
              <textarea
                rows={3}
                value={form.descripcion}
                onChange={(e) => cambiar('descripcion', e.target.value)}
                placeholder="Detalla qué pasó..."
                className={`${campo} mt-1.5 resize-none`}
              />
            </div>

            <div>
              <label className={etiqueta}>Tiempo estimado de retraso (horas)</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={form.horas}
                onChange={(e) => cambiar('horas', e.target.value)}
                placeholder="Ej: 2"
                className={`${campo} mt-1.5`}
              />
            </div>

            <div>
              <label className={etiqueta}>Evidencia (foto)</label>
              <input
                ref={inputCamara}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={elegirFoto}
                className="hidden"
              />
              <input
                ref={inputGaleria}
                type="file"
                accept="image/*"
                onChange={elegirFoto}
                className="hidden"
              />

              {vista ? (
                <div className="mt-1.5 relative w-full sm:w-64">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={vista}
                    alt="Evidencia"
                    className="w-full rounded-xl border border-slate-800 object-cover"
                  />
                  <button
                    type="button"
                    onClick={quitarFoto}
                    className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white p-1.5 rounded-full"
                    aria-label="Quitar foto"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={abrirCamara}
                    className="flex items-center gap-2 border border-slate-800 hover:border-red-700 text-white text-xs font-bold uppercase tracking-wide px-4 py-2.5 rounded-xl transition"
                  >
                    <Camera className="w-4 h-4 text-red-500" />
                    Tomar foto
                  </button>
                  <button
                    type="button"
                    onClick={() => inputGaleria.current?.click()}
                    className="flex items-center gap-2 border border-slate-800 hover:border-red-700 text-white text-xs font-bold uppercase tracking-wide px-4 py-2.5 rounded-xl transition"
                  >
                    <ImagePlus className="w-4 h-4 text-red-500" />
                    Subir imagen
                  </button>
                </div>
              )}

              {errorCamara && <p className="text-xs text-amber-400 mt-2">{errorCamara}</p>}
            </div>

            {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

            {guardado && (
              <p className="text-xs text-emerald-500 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Retraso reportado correctamente.
              </p>
            )}

            <button
              onClick={enviar}
              disabled={enviando}
              className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wide px-6 py-3.5 rounded-xl transition"
            >
              <Send className="w-4 h-4" />
              {enviando ? 'Enviando...' : 'Notificar al administrador'}
            </button>
          </div>

          <div className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xl h-fit">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-5">
              <Clock className="w-4 h-4 text-red-600" />
              Retrasos reportados
            </h2>

            {recientes.length === 0 && (
              <p className="text-xs text-slate-600">Todavía no has reportado retrasos.</p>
            )}

            <div className="space-y-4">
              {recientes.map((r) => (
                <div key={r.id} className="pb-4 border-b border-slate-800/60 last:border-0 last:pb-0">
                  <div className="flex justify-between gap-2">
                    <p className="text-sm font-bold text-white truncate">{r.proyecto}</p>
                    <span className="text-[10px] text-slate-600 flex-shrink-0">
                      {fechaCorta(r.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-red-500 mt-0.5">{r.motivo}</p>
                  {r.descripcion && <p className="text-xs text-slate-400 mt-1">{r.descripcion}</p>}
                  <div className="flex justify-between gap-2 mt-1.5 text-[11px] text-red-500">
                    <span>{r.area}</span>
                    {r.horas !== null && <span className="text-slate-500">Retraso: {r.horas} h</span>}
                  </div>
                  {r.evidenciaUrl && (
                    <a
                      href={r.evidenciaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-blue-400 hover:text-blue-300"
                    >
                      <Camera className="w-3 h-3" />
                      Ver evidencia
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {camaraAbierta && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center gap-4 p-4">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="max-h-[70vh] w-full max-w-lg rounded-2xl border border-slate-800 bg-black object-contain"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={cerrarCamara}
              className="px-5 py-3 rounded-xl border border-slate-700 text-white text-xs font-bold uppercase tracking-wide"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={capturar}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wide"
            >
              <Camera className="w-4 h-4" />
              Capturar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}