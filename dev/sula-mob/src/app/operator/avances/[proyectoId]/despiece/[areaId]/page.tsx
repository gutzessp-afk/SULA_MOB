'use client'

/**
 * PRUEBA — Trabajo por pasos
 * /operator/avances/[proyectoId]/despiece/[areaId]#<clave de partida>  (el #clave pone esa partida en "AHORA")
 *
 * El área ve una sola tarea grande ("AHORA"): la pieza (o el subensamble) que toca, en el orden del
 * plano: producto → subensamble → pieza. Como el registro de siempre: ▶ Iniciar arranca el reloj y
 * ■ Finalizar pregunta cuántas se hicieron. Si se hicieron todas, la tarea baja a "Terminadas" y
 * sube la siguiente. Usa sus propias tablas (sql/prueba_despiece.sql); no cambia el registro oficial.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Loader2,
  Minus,
  Play,
  Plus,
  SkipForward,
  Square,
  Undo2,
} from 'lucide-react'
import {
  cancelarPaso,
  deshacerPaso,
  finalizarPaso,
  getDespieceArea,
  iniciarPaso,
  type DespieceArea,
  type PasoDespiece,
} from '../actions'

const pct = (hechas: number, meta: number) => (meta > 0 ? Math.min(100, Math.round((hechas / meta) * 100)) : 0)
const llave = (p: PasoDespiece) => `${p.partidaId}#${p.clave}`
const subDe = (p: PasoDespiece) => `${p.partidaId}#${p.subensamble}`

/** 3725 s → "1:02:05" */
function reloj(segundos: number) {
  const s = Math.max(0, Math.floor(segundos))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

function Barra({ hechas, meta, alto = 'h-1.5' }: { hechas: number; meta: number; alto?: string }) {
  const p = pct(hechas, meta)
  return (
    <div className={`${alto} w-full rounded-full bg-slate-800 overflow-hidden`}>
      <div className={`h-full rounded-full transition-all ${p >= 100 ? 'bg-emerald-500' : 'bg-teal-400'}`} style={{ width: `${p}%` }} />
    </div>
  )
}

/** "ESCRIT. MB-01 ×3 › FALDON ARMADO" */
function Ruta({ paso }: { paso: PasoDespiece }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 truncate">
      {paso.partidaNombre} <span className="text-slate-500">×{paso.partidaCantidad}</span>
      {paso.tipo === 'pieza' && (
        <>
          <span className="text-slate-600"> › </span>
          {paso.subensamble.replace(' — ', ' › ')}
        </>
      )}
    </p>
  )
}

/* ---------------- Tarjeta grande: lo que toca AHORA ---------------- */

function TareaActual({
  paso,
  unidad,
  ahora,
  ocupado,
  haySiguiente,
  onIniciar,
  onFinalizar,
  onCancelar,
  onSaltar,
}: {
  paso: PasoDespiece
  unidad: string
  ahora: number
  ocupado: boolean
  haySiguiente: boolean
  onIniciar: () => void
  onFinalizar: (cantidad: number) => void
  onCancelar: () => void
  onSaltar: () => void
}) {
  const faltan = paso.meta - paso.hechas
  const corriendo = Boolean(paso.trabajo?.mio)
  // Al tocar Finalizar el reloj se congela mientras se escribe la cantidad
  const [finalizando, setFinalizando] = useState<number | null>(null)
  const [cantidad, setCantidad] = useState(1)

  const segundos = paso.trabajo ? ((finalizando ?? ahora) - new Date(paso.trabajo.inicio).getTime()) / 1000 : 0

  return (
    <section
      className={`rounded-2xl border-2 p-4 sm:p-6 shadow-xl bg-gradient-to-b to-[#0b0e16] ${
        corriendo ? 'border-teal-400/70 from-[#062a2a] shadow-teal-950/30' : 'border-blue-500/60 from-[#0f1b3d] shadow-blue-950/30'
      }`}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-widest text-white ${corriendo ? 'bg-teal-600' : 'bg-blue-600'}`}>
          {corriendo ? '● En curso' : 'Ahora'}
        </span>
        {paso.pagina !== null && <span className="text-[11px] text-slate-500">Plano · hoja {paso.pagina}</span>}
      </div>

      <Ruta paso={paso} />
      <h2 className="mt-1 text-2xl sm:text-3xl font-black text-white leading-tight">{paso.nombre}</h2>
      {paso.medidas && <p className="mt-2 text-xl sm:text-2xl font-mono font-bold text-sky-300">{paso.medidas}</p>}
      {paso.material && <p className="mt-1 text-sm text-slate-300">{paso.material}</p>}
      {paso.notas && <p className="mt-1 text-sm text-slate-400">{paso.notas}</p>}
      {paso.revisar && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5" /> Esta medida no viene impresa en el plano: compruébala antes de cortar
        </p>
      )}

      <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-4">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-slate-400">
              Hechas <span className="font-mono font-black text-white text-lg">{paso.hechas}</span> de{' '}
              <span className="font-mono font-bold text-white">{paso.meta}</span>
            </span>
            <span className="text-sm font-bold text-amber-300">Faltan {faltan}</span>
          </div>
          <Barra hechas={paso.hechas} meta={paso.meta} alto="h-2.5" />
        </div>
        {corriendo && (
          <span className="font-mono text-3xl sm:text-4xl font-black text-teal-300 tabular-nums leading-none" aria-label="Tiempo trabajado">
            {reloj(segundos)}
          </span>
        )}
      </div>

      {/* Botón principal: Iniciar o Finalizar */}
      {!corriendo ? (
        <button
          type="button"
          disabled={ocupado}
          onClick={onIniciar}
          className="mt-5 w-full min-h-[60px] rounded-xl bg-blue-600 text-white text-lg font-black inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {ocupado ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-6 h-6" fill="currentColor" />}
          Iniciar
        </button>
      ) : finalizando === null ? (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => {
            setCantidad(faltan)
            setFinalizando(ahora)
          }}
          className="mt-5 w-full min-h-[60px] rounded-xl bg-emerald-500 text-[#03261b] text-lg font-black inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Square className="w-5 h-5" fill="currentColor" />
          Finalizar
        </button>
      ) : (
        <div className="mt-5 rounded-xl border border-slate-700 bg-black/25 p-3 space-y-3">
          <p className="text-sm font-bold text-white">¿Cuántas {unidad === 'pieza' ? 'piezas' : ''} hiciste?</p>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onFinalizar(faltan)}
            className="w-full min-h-[58px] rounded-xl bg-emerald-500 text-[#03261b] text-lg font-black inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {ocupado ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-6 h-6" strokeWidth={3} />}
            Todas ({faltan})
          </button>
          {faltan > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 flex-1">Solo hice:</span>
              <button
                type="button"
                onClick={() => setCantidad((c) => Math.max(1, Math.min(c, faltan) - 1))}
                className="w-12 h-12 inline-flex items-center justify-center rounded-xl border border-slate-600 text-white"
                aria-label="Una menos"
              >
                <Minus className="w-5 h-5" />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={faltan}
                value={cantidad}
                onChange={(e) => setCantidad(Math.max(1, Math.min(faltan, Math.floor(Number(e.target.value) || 1))))}
                className="w-16 h-12 rounded-xl border border-slate-600 bg-[#0b0e16] text-center text-xl font-black text-white outline-none focus:border-teal-400"
                aria-label="Cuántas hiciste"
              />
              <button
                type="button"
                onClick={() => setCantidad((c) => Math.min(faltan, c + 1))}
                className="w-12 h-12 inline-flex items-center justify-center rounded-xl border border-slate-600 text-white"
                aria-label="Una más"
              >
                <Plus className="w-5 h-5" />
              </button>
              <button
                type="button"
                disabled={ocupado || cantidad >= faltan}
                onClick={() => onFinalizar(cantidad)}
                className="h-12 px-4 rounded-xl bg-teal-500 text-[#04221f] text-sm font-black disabled:opacity-40"
              >
                Guardar {cantidad}
              </button>
            </div>
          )}
          <button type="button" onClick={() => setFinalizando(null)} className="w-full min-h-[44px] text-xs text-slate-400 hover:text-white">
            Seguir trabajando
          </button>
        </div>
      )}

      {/* Acciones secundarias, pequeñas para no estorbar */}
      {finalizando === null && (
        <div className="mt-2 flex flex-wrap gap-x-5">
          {corriendo && (
            <button type="button" disabled={ocupado} onClick={onCancelar} className="min-h-[44px] text-xs text-slate-500 hover:text-slate-200">
              Cancelar inicio (lo inicié por error)
            </button>
          )}
          {!corriendo && haySiguiente && (
            <button
              type="button"
              disabled={ocupado}
              onClick={onSaltar}
              className="inline-flex items-center gap-1.5 min-h-[44px] text-xs text-slate-500 hover:text-slate-200"
            >
              <SkipForward className="w-3.5 h-3.5" /> Dejar para después
            </button>
          )}
        </div>
      )}
    </section>
  )
}

/* ---------------- Pantalla ---------------- */

interface GrupoProducto {
  partidaId: string
  nombre: string
  cantidad: number
  meta: number
  hechas: number
  /** Pendientes del producto, agrupados por subensamble y en orden de trabajo */
  subensambles: { nombre: string; pasos: PasoDespiece[] }[]
  pendientes: number
}

export default function TrabajoPorPasosPage() {
  const params = useParams<{ proyectoId: string; areaId: string }>()
  const { proyectoId, areaId } = params

  const [datos, setDatos] = useState<DespieceArea | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  /** Paso que el operador eligió hacer ahora (si no, el que sigue) */
  const [elegido, setElegido] = useState<string | null>(null)
  /** Pasos que se dejaron para después: se van al final de la fila */
  const [saltados, setSaltados] = useState<string[]>([])
  /** Productos abiertos en la lista de pendientes (si no se ha tocado ninguno, se abre el de "AHORA") */
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({})
  const [verTerminadas, setVerTerminadas] = useState(false)
  // Reloj: hora del servidor + segundos que pasan en la pantalla
  const [desfase, setDesfase] = useState(0)
  const [tic, setTic] = useState(() => Date.now())
  // El enlace de una pieza (#clave de partida) solo se aplica en la primera carga
  const [hashAplicado, setHashAplicado] = useState(false)

  const cargar = useCallback(() => {
    return getDespieceArea(proyectoId, areaId).then((r) => {
      if (r.data) {
        setDatos(r.data)
        setDesfase(new Date(r.data.ahora).getTime() - Date.now())
      } else {
        setError(r.error ?? 'No se pudo cargar el trabajo del área.')
      }
      setCargando(false)
    })
  }, [proyectoId, areaId])

  // Se actualiza cada 20 s para ver lo que hacen otros operadores de la misma área
  useEffect(() => {
    void cargar()
    const intervalo = setInterval(() => void cargar(), 20000)
    return () => clearInterval(intervalo)
  }, [cargar])

  useEffect(() => {
    const intervalo = setInterval(() => setTic(Date.now()), 1000)
    return () => clearInterval(intervalo)
  }, [])

  // Si se llegó desde una partida del área (#clave), "AHORA" es su primera pieza pendiente.
  // No se esconde nada: el resto del área sigue en la lista.
  if (datos && !hashAplicado) {
    setHashAplicado(true)
    const pedida = decodeURIComponent(window.location.hash.slice(1))
    const primera = datos.pasos.find((p) => p.partidaClave === pedida && p.hechas < p.meta && (!p.trabajo || p.trabajo.mio))
    if (primera) setElegido(llave(primera))
  }

  const fila = useMemo(() => {
    const pasos = datos?.pasos ?? []
    const pendientesEnOrden = pasos.filter((p) => p.hechas < p.meta)
    const pendientes = [
      ...pendientesEnOrden.filter((p) => !saltados.includes(llave(p))),
      ...saltados.map((k) => pendientesEnOrden.find((p) => llave(p) === k)).filter((p): p is PasoDespiece => Boolean(p)),
    ]
    // Primero lo que tengo corriendo, luego lo libre; lo que tiene otro operador no se ofrece
    const elegible = [...pendientes.filter((p) => p.trabajo?.mio), ...pendientes.filter((p) => !p.trabajo)]
    const actual = elegible.find((p) => llave(p) === elegido) ?? elegible[0] ?? null

    // Lista completa de pendientes: producto → subensamble → pieza (sin la de "AHORA")
    const grupos: GrupoProducto[] = (datos?.partidas ?? []).map((partida) => {
      const suyos = pendientesEnOrden.filter((p) => p.partidaId === partida.id && p !== actual)
      const subs = new Map<string, PasoDespiece[]>()
      suyos.forEach((p) => subs.set(p.subensamble, [...(subs.get(p.subensamble) ?? []), p]))
      return {
        partidaId: partida.id,
        nombre: partida.nombre,
        cantidad: partida.cantidad,
        meta: partida.meta,
        hechas: partida.hechas,
        subensambles: [...subs.entries()].map(([nombre, lista]) => ({ nombre, pasos: lista })),
        pendientes: suyos.length,
      }
    })

    return {
      actual,
      grupos,
      pendientes: pendientesEnOrden.length - (actual ? 1 : 0),
      terminadas: pasos.filter((p) => p.hechas >= p.meta),
      meta: pasos.reduce((s, p) => s + p.meta, 0),
      hechas: pasos.reduce((s, p) => s + p.hechas, 0),
      total: pasos.length,
    }
  }, [datos, saltados, elegido])

  const unidad = datos?.unidad ?? 'pieza'
  const plural = unidad === 'pieza' ? 'piezas' : 'subensambles'

  async function ejecutar(accion: () => Promise<{ error?: string }>, exito?: string) {
    setError('')
    setAviso('')
    setOcupado(true)
    const r = await accion()
    if (r.error) setError(r.error)
    else if (exito) setAviso(exito)
    await cargar()
    setOcupado(false)
    return !r.error
  }

  function iniciar(paso: PasoDespiece) {
    setElegido(llave(paso))
    void ejecutar(() => iniciarPaso(proyectoId, areaId, paso.partidaId, paso.clave))
  }

  async function finalizar(paso: PasoDespiece, cantidad: number) {
    setError('')
    setAviso('')
    setOcupado(true)
    const r = await finalizarPaso(proyectoId, areaId, paso.partidaId, paso.clave, cantidad)
    if (r.error) {
      setError(r.error)
    } else if (r.terminado) {
      // Si con esto se acabó el subensamble, se avisa
      const quedanEnSub = (datos?.pasos ?? []).some(
        (p) => subDe(p) === subDe(paso) && llave(p) !== llave(paso) && p.hechas < p.meta
      )
      setAviso(
        paso.tipo === 'pieza' && !quedanEnSub
          ? `✓ ${paso.nombre} terminada. ¡Subensamble ${paso.subensamble} completo!`
          : `✓ ${paso.nombre} terminad${paso.tipo === 'pieza' ? 'a' : 'o'}. Sigue la próxima.`
      )
      setElegido(null)
      setSaltados((prev) => prev.filter((k) => k !== llave(paso)))
    } else {
      setAviso(`✓ ${cantidad} guardada${cantidad === 1 ? '' : 's'}. Faltan ${paso.meta - paso.hechas - cantidad}: toca Iniciar cuando sigas.`)
    }
    await cargar()
    setOcupado(false)
  }

  function cancelar(paso: PasoDespiece) {
    void ejecutar(() => cancelarPaso(proyectoId, areaId, paso.partidaId, paso.clave), 'Se canceló el inicio. No se registró nada.')
  }

  function deshacer(paso: PasoDespiece) {
    void ejecutar(
      () => deshacerPaso(proyectoId, areaId, paso.partidaId, paso.clave),
      `Se deshizo el último registro de ${paso.nombre}. Regresó a la lista.`
    )
  }

  function saltar(paso: PasoDespiece) {
    setAviso('')
    setElegido(null)
    setSaltados((prev) => [...prev.filter((k) => k !== llave(paso)), llave(paso)])
  }

  function hacerAhora(paso: PasoDespiece) {
    if (paso.trabajo && !paso.trabajo.mio) {
      setError('Esa pieza la está haciendo otro operador.')
      return
    }
    setError('')
    setAviso('')
    setElegido(llave(paso))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const volver = (
    <Link href={`/operator/avances/${proyectoId}`} className="inline-flex items-center gap-1.5 min-h-[44px] text-sm text-slate-400 hover:text-white">
      <ArrowLeft className="w-4 h-4" /> Volver al área
    </Link>
  )

  if (cargando) {
    return (
      <div className="flex items-center gap-3 bg-[#0e1017]/80 border border-slate-800 p-6 rounded-2xl text-slate-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando trabajo del área...
      </div>
    )
  }

  if (!datos) {
    return (
      <div className="space-y-3">
        {volver}
        <p className="rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">{error}</p>
      </div>
    )
  }

  // Abierto: lo que el operador abrió; si no ha tocado ese producto, solo el de "AHORA"
  const estaAbierto = (g: GrupoProducto) => abiertos[g.partidaId] ?? g.partidaId === fila.actual?.partidaId

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-16">
      <div className="flex items-center justify-between gap-2">
        {volver}
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300">
          <FlaskConical className="w-3 h-3" /> Prueba
        </span>
      </div>

      {/* Encabezado: área y avance */}
      <div className="rounded-2xl border border-slate-800 bg-[#0e1017]/80 p-4 space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-blue-400 truncate">
              {datos.proyectoCodigo} · {datos.proyectoNombre}
            </p>
            <h1 className="text-xl font-black text-white">{datos.areaNombre}</h1>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-black font-mono text-white leading-none">{pct(fila.hechas, fila.meta)}%</p>
            <p className="text-[11px] text-slate-500 mt-1">
              {fila.terminadas.length} de {fila.total} {plural}
            </p>
          </div>
        </div>
        <Barra hechas={fila.hechas} meta={fila.meta} alto="h-2" />
      </div>

      {/* Mensajes */}
      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}
      {aviso && (
        <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm font-semibold text-emerald-200">
          {aviso}
        </p>
      )}

      {/* AHORA */}
      {fila.total === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-[#0e1017]/80 p-8 text-center text-sm text-slate-400">
          {datos.partidas.length === 0 && datos.sinPlano > 0
            ? 'Este proyecto todavía no tiene planos analizados.'
            : `No hay trabajo de ${datos.areaNombre} en este proyecto.`}
        </div>
      ) : fila.actual ? (
        <TareaActual
          key={llave(fila.actual)}
          paso={fila.actual}
          unidad={unidad}
          ahora={tic + desfase}
          ocupado={ocupado}
          haySiguiente={fila.pendientes > 0}
          onIniciar={() => iniciar(fila.actual!)}
          onFinalizar={(n) => finalizar(fila.actual!, n)}
          onCancelar={() => cancelar(fila.actual!)}
          onSaltar={() => saltar(fila.actual!)}
        />
      ) : fila.pendientes > 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-[#0e1017]/80 p-6 text-center text-sm text-slate-400">
          Lo que falta lo están haciendo otros operadores.
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-emerald-500/50 bg-emerald-950/20 p-8 text-center space-y-1">
          <p className="text-3xl">✓</p>
          <p className="text-lg font-black text-emerald-300">Terminaste todo {datos.areaNombre}</p>
          <p className="text-sm text-emerald-200/70">No quedan pendientes en este proyecto.</p>
        </div>
      )}

      {/* PENDIENTES: todo el área, por producto → subensamble */}
      {fila.pendientes > 0 && (
        <section className="space-y-2">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
            Pendientes de {datos.areaNombre} <span className="text-slate-600">· {fila.pendientes}</span>
          </h3>

          {fila.grupos
            .filter((g) => g.pendientes > 0)
            .map((g) => {
              const abierto = estaAbierto(g)
              return (
                <div key={g.partidaId} className="rounded-2xl border border-slate-800 bg-[#0e1017]/80 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setAbiertos((prev) => ({ ...prev, [g.partidaId]: !abierto }))}
                    aria-expanded={abierto}
                    className="w-full min-h-[60px] px-3 sm:px-4 py-2.5 flex items-center gap-3 text-left hover:bg-white/[0.03]"
                  >
                    {abierto ? <ChevronDown className="w-5 h-5 text-slate-500 flex-shrink-0" /> : <ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0" />}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-black text-white truncate">
                        {g.nombre} <span className="text-slate-500 font-semibold">×{g.cantidad}</span>
                      </span>
                      <span className="mt-1 block w-full max-w-[220px]">
                        <Barra hechas={g.hechas} meta={g.meta} alto="h-1" />
                      </span>
                    </span>
                    <span className="flex-shrink-0 text-right">
                      <span className="block text-sm font-mono font-bold text-amber-300">{g.pendientes}</span>
                      <span className="block text-[10px] text-slate-500">{g.pendientes === 1 ? 'pendiente' : 'pendientes'}</span>
                    </span>
                  </button>

                  {abierto && (
                    <div className="border-t border-slate-800">
                      {g.subensambles.map((s) => (
                        <div key={s.nombre}>
                          {unidad === 'pieza' && (
                            <p className="px-4 pt-3 pb-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                              {s.nombre.replace(' — ', ' › ')}
                            </p>
                          )}
                          <ul>
                            {s.pasos.map((p) => {
                              const deOtro = Boolean(p.trabajo && !p.trabajo.mio)
                              return (
                                <li key={llave(p)}>
                                  <button
                                    type="button"
                                    onClick={() => hacerAhora(p)}
                                    className={`w-full min-h-[52px] px-4 py-2 flex items-center gap-3 text-left border-t border-slate-800/50 first:border-t-0 ${
                                      deOtro ? 'opacity-50' : 'hover:bg-white/[0.04]'
                                    }`}
                                  >
                                    <span className="flex-1 min-w-0">
                                      <span className="block text-sm font-bold text-slate-100 truncate">{p.nombre}</span>
                                      {(p.medidas || p.trabajo) && (
                                        <span className="block text-[11px] truncate">
                                          {p.medidas && <span className="font-mono text-sky-300/80">{p.medidas}</span>}
                                          {p.trabajo && (
                                            <span className="font-bold text-teal-300">
                                              {p.medidas ? ' · ' : ''}● en curso{p.trabajo.mio ? ' (tuyo)' : ' · otro operador'}
                                            </span>
                                          )}
                                        </span>
                                      )}
                                    </span>
                                    {saltados.includes(llave(p)) && (
                                      <SkipForward className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" aria-label="La dejaste para después" />
                                    )}
                                    <span className="flex-shrink-0 font-mono text-sm font-bold text-amber-300">{p.meta - p.hechas}</span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
        </section>
      )}

      {/* TERMINADAS */}
      {fila.terminadas.length > 0 && (
        <section className="rounded-2xl border border-slate-800 bg-[#0e1017]/60 overflow-hidden">
          <button
            type="button"
            onClick={() => setVerTerminadas((v) => !v)}
            aria-expanded={verTerminadas}
            className="w-full min-h-[52px] px-4 flex items-center gap-2 text-left"
          >
            {verTerminadas ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
            <span className="flex-1 text-[11px] font-black uppercase tracking-widest text-emerald-400/80">Terminadas · {fila.terminadas.length}</span>
          </button>
          {verTerminadas && (
            <ul className="divide-y divide-slate-800/70 border-t border-slate-800">
              {fila.terminadas.map((p) => (
                <li key={llave(p)} className="px-4 py-2.5 flex items-center gap-3">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span className="flex-1 min-w-0">
                    <Ruta paso={p} />
                    <span className="block text-sm text-slate-300 truncate">
                      {p.nombre} <span className="font-mono text-slate-500">· {p.meta}</span>
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => deshacer(p)}
                    className="flex-shrink-0 inline-flex items-center gap-1 min-h-[40px] px-2.5 rounded-lg border border-slate-800 text-[11px] text-slate-400 hover:text-white disabled:opacity-50"
                  >
                    <Undo2 className="w-3.5 h-3.5" /> Deshacer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {datos.sinPlano > 0 && (
        <p className="text-[11px] text-slate-500">
          {datos.sinPlano} {datos.sinPlano === 1 ? 'partida no tiene' : 'partidas no tienen'} plano analizado todavía: no aparecen aquí.
          Aparecen solas en cuanto el administrador analice su plano.
        </p>
      )}
      <p className="text-[11px] text-slate-600">
        Vista de prueba: estos registros se guardan aparte y todavía no cambian el avance oficial del proyecto.
      </p>
    </div>
  )
}
