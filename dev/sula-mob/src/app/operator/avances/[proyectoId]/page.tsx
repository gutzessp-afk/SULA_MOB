
'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useRealtimeAvances } from '@/hooks/useRealtimeAvances'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { marcarAreaTerminada } from '../../actions'
import {
  entrarConClave,
  finalizarPieza,
  getAreaOperador,
  getEvidenciaDia,
  getProyectoOperador,
  guardarEvidenciaDia,
  iniciarPieza,
  listarEvidencias,
  pausarArea,
  reanudarArea,
  reanudarPieza,
  reportarArea,
  salirArea,
  subirEvidenciaReporte,
  type AreaOperador,
  type AreaVista,
  type EvidenciaGuardada,
  type PiezaOperador,
  type ProyectoOperador,
  type TipoPieza,
  type TrabajoEnCurso,
} from '../pieza-actions'
import { crearPdfDia, descargarPdfDia } from '../evidencia-pdf'

/* ------------------------------------------------------------------ */
/*  Diseño (mismos colores del prototipo aprobado)                     */
/* ------------------------------------------------------------------ */

const card = '#10141f'
const card2 = '#141927'
const line = '#1e2433'
const blue = '#2563eb'
const bl = '#3b82f6'
const green = '#10b981'
const amber = '#f59e0b'
const teal = '#14b8a6'

const ZONA = 'America/Mexico_City'

const MOTIVOS_ADMIN = [
  'Falla de máquina',
  'Falta de material',
  'Falta de herramienta',
  'Material defectuoso',
  'Plano o medida con error',
  'Corte de energía',
  'Falla de equipo compartido',
  'Falta de material general',
  'Otro',
]
const MOTIVOS_PAUSA_AREA = ['Comida', 'Junta', 'Limpieza', 'Cambio de herramienta']
const MOTIVO_TURNO = 'Cambio de turno'

const gradiente: CSSProperties = {
  background: `linear-gradient(135deg,#0f1b3d,${card})`,
  border: `1px solid ${line}`,
  borderRadius: 16,
}

const chipAmber: CSSProperties = {
  background: '#1f1708',
  color: amber,
  border: `1px solid ${amber}66`,
  borderRadius: 18,
  padding: '7px 15px',
  fontSize: 12,
  cursor: 'pointer',
}

const chipAzul: CSSProperties = {
  background: '#0f1b3d',
  color: bl,
  border: `1px solid ${bl}66`,
  borderRadius: 18,
  padding: '7px 15px',
  fontSize: 12,
  cursor: 'pointer',
}

/* ------------------------------------------------------------------ */
/*  Estilos que se adaptan a cualquier pantalla (celular, tablet, PC)  */
/* ------------------------------------------------------------------ */

function EstilosOperador() {
  return (
    <style>{`
      .op-wrap{width:100%;margin:0 auto;padding:0 2px 56px;box-sizing:border-box}
      .op-wrap *{box-sizing:border-box}
      .op-wrap button{font-family:inherit;min-height:40px;touch-action:manipulation}
      .op-wrap input,.op-wrap textarea{font-family:inherit}
      .pz-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,460px),1fr));gap:14px}
      .ar-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:12px}
      .pz-top{display:flex;justify-content:space-between;gap:16px}
      .pz-side{display:flex;flex-direction:column;align-items:flex-end;gap:8px;min-width:150px}
      .pz-nombre{overflow-wrap:anywhere}
      .pz-fin{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
      .pz-fin input{flex:1 1 150px;min-width:0}
      .op-barra{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:9px;margin-bottom:12px}
      @media (max-width:640px){
        .pz-top{flex-direction:column}
        .pz-side{align-items:stretch;min-width:0;width:100%}
        .pz-pausa{text-align:left !important}
        .op-barra{display:grid;grid-template-columns:1fr 1fr;}
        .op-barra button:last-child{grid-column:1 / -1}
        .ar-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
        .op-cab{flex-direction:column;align-items:stretch !important}
        .op-cab button{width:100%}
      }
    `}</style>
  )
}

/* ------------------------------------------------------------------ */
/*  Utilidades de reloj (hora real de Mexico, calculada con el servidor) */
/* ------------------------------------------------------------------ */

function reloj(segundos: number) {
  const s = Math.max(0, Math.floor(segundos))
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((x) => String(x).padStart(2, '0'))
    .join(':')
}

function segundosTrabajo(t: TrabajoEnCurso, ahora: number) {
  const hasta = t.pausaAbierta ? new Date(t.pausaAbierta.inicio).getTime() : ahora
  return (hasta - new Date(t.inicio).getTime()) / 1000 - t.pausadoSeg
}

function hoyMexico() {
  return new Date().toLocaleDateString('en-CA', { timeZone: ZONA })
}

function IconoCandado({ abierto }: { abierto?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={abierto ? bl : '#64748b'}
      strokeWidth="2"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d={abierto ? 'M8 11V7a4 4 0 017.5-2' : 'M8 11V7a4 4 0 018 0v4'} />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/*  Teclado de clave (3 digitos, entra solo al completar)              */
/* ------------------------------------------------------------------ */

function Teclado({
  area,
  error,
  fallos,
  validando,
  onCerrar,
  onEntrar,
}: {
  area: string | null
  error: string
  fallos: number
  validando: boolean
  onCerrar: () => void
  onEntrar: (clave: string) => void
}) {
  const [d, setD] = useState('')

  useEffect(() => {
    if (fallos === 0) return
    const t = setTimeout(() => setD(''), 350)
    return () => clearTimeout(t)
  }, [fallos])

  function pulsar(k: string) {
    if (validando) return
    const n = (d + k).slice(0, 3)
    setD(n)
    if (n.length === 3) onEntrar(n)
  }

  const hayError = Boolean(error)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(4,6,12,.82)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 60,
      }}
    >
      <div
        style={{
          background: '#0d111c',
          border: `1px solid ${line}`,
          borderRadius: 18,
          padding: '22px 26px',
          width: 'min(320px, 92vw)',
          textAlign: 'center',
        }}
      >
        <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, marginBottom: area ? 0 : 14 }}>
          {area ? 'Contraseña del área' : 'Contraseña de tu área'}
        </div>
        {area && (
          <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 2, marginBottom: 14 }}>{area}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 44,
                height: 52,
                borderRadius: 11,
                background: card,
                border: `2px solid ${hayError ? '#ef4444' : d[i] ? bl : line}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 22,
              }}
            >
              {d[i] ? '•' : ''}
            </div>
          ))}
        </div>

        <div style={{ minHeight: 18, color: '#f87171', fontSize: 12, marginBottom: 6 }}>
          {validando ? 'Validando...' : error}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9 }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) =>
            k === '' ? (
              <div key={i} />
            ) : (
              <button
                key={i}
                onClick={() => (k === '⌫' ? setD((x) => x.slice(0, -1)) : pulsar(k))}
                style={{
                  height: 48,
                  borderRadius: 11,
                  background: card,
                  border: `1px solid ${line}`,
                  color: '#fff',
                  fontSize: 17,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {k}
              </button>
            )
          )}
        </div>

        <button
          onClick={onCerrar}
          style={{
            marginTop: 14,
            background: 'none',
            border: 'none',
            color: '#64748b',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tarjeta de pieza                                                   */
/* ------------------------------------------------------------------ */

function Estadistica({ etiqueta, valor, color }: { etiqueta: string; valor: number; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>{etiqueta}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{valor}</div>
    </div>
  )
}

function PiezaCard({
  p,
  ahora,
  ocupado,
  onIniciar,
  onFinalizar,
  onReanudar,
  despieceHref,
}: {
  p: PiezaOperador
  ahora: number
  ocupado: string | null
  onIniciar: (id: string, tipo: TipoPieza) => void
  onFinalizar: (trabajoId: string, cantidad: number) => void
  onReanudar: (trabajoId: string) => void
  /** PRUEBA: abre los ensambles y piezas del plano de esta partida */
  despieceHref?: string
}) {
  const [fin, setFin] = useState(false)
  const [q, setQ] = useState('')
  const [congelado, setCongelado] = useState<number | null>(null)

  const t = p.trabajo
  const pausaReporte = t?.pausaAbierta?.tipo === 'reporte_pieza' ? t.pausaAbierta : null
  const pausaArea = t?.pausaAbierta && t.pausaAbierta.tipo !== 'reporte_pieza' ? t.pausaAbierta : null
  const corriendo = Boolean(t && !t.pausaAbierta)
  const seg = t ? segundosTrabajo(t, congelado ?? ahora) : 0

  const medidasYNotas = [p.medidas, p.notas].filter(Boolean).join(' · ')

  function abrirFinalizar() {
    setCongelado(ahora)
    setFin(true)
  }

  function cerrarFinalizar() {
    setFin(false)
    setCongelado(null)
    setQ('')
  }

  function guardar() {
    if (!t) return
    const n = Number(q)
    if (!Number.isInteger(n) || n <= 0) return
    onFinalizar(t.id, n)
    cerrarFinalizar()
  }

  const boton = (fondo: string, color: string): CSSProperties => ({
    width: '100%',
    background: fondo,
    color,
    border: 'none',
    borderRadius: 10,
    padding: '13px 0',
    fontSize: 16,
    fontWeight: 800,
    cursor: 'pointer',
  })

  return (
    <div
      style={{
        background: card,
        borderRadius: 16,
        padding: '16px 18px',
        border: `1.5px solid ${pausaReporte || pausaArea ? amber : corriendo ? bl : line}`,
      }}
    >
      <div className="pz-top">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="pz-nombre" style={{ color: '#fff', fontSize: 17, fontWeight: 800, lineHeight: 1.3 }}>{p.nombre}</span>
            {p.modulo && (
              <span
                style={{
                  color: '#94a3b8',
                  fontSize: 10.5,
                  background: card2,
                  padding: '2px 8px',
                  borderRadius: 6,
                }}
              >
                {p.modulo}
              </span>
            )}
          </div>
          {p.material && (
            <div style={{ color: '#cbd5e1', fontSize: 13.5, marginTop: 6 }}>{p.material}</div>
          )}
          {medidasYNotas && (
            <div style={{ color: '#7c8aa5', fontSize: 13, marginTop: 2 }}>{medidasYNotas}</div>
          )}
          {/* PRUEBA: ensambles y subensambles (quitar este Link si no se queda) */}
          {despieceHref && (
            <Link
              href={despieceHref}
              style={{
                display: 'inline-block',
                marginTop: 8,
                padding: '6px 0',
                color: bl,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Trabajar por pasos ▸
            </Link>
          )}
          <div style={{ display: 'flex', gap: 26, marginTop: 12 }}>
            <Estadistica etiqueta="Meta" valor={p.meta} color="#e2e8f0" />
            <Estadistica etiqueta="Hechas" valor={p.hechas} color={teal} />
            <Estadistica etiqueta="Faltan" valor={p.faltan} color={p.faltan ? amber : green} />
          </div>
        </div>

        <div className="pz-side">
          {t && corriendo && (
            <span
              style={{
                color: bl,
                fontSize: 24,
                fontWeight: 800,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {reloj(seg)}
            </span>
          )}

          {t && (pausaReporte || pausaArea) && (
            <div className="pz-pausa" style={{ textAlign: 'right' }}>
              <span
                style={{
                  color: amber,
                  fontSize: 16,
                  fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {reloj(seg)}
              </span>
              <div style={{ color: amber, fontSize: 11.5 }}>
                {pausaReporte
                  ? `⏸ Reporte enviado: ${pausaReporte.motivo}`
                  : `⏸ Pausa: ${pausaArea?.motivo}`}
              </div>
            </div>
          )}

          {!t && p.faltan > 0 && (
            <button
              onClick={() => onIniciar(p.id, p.tipo)}
              disabled={ocupado === `iniciar|${p.id}`}
              style={{ ...boton(blue, '#fff'), opacity: ocupado === `iniciar|${p.id}` ? 0.5 : 1 }}
            >
              Iniciar
            </button>
          )}

          {t && corriendo && (
            <button onClick={abrirFinalizar} style={boton('#fff', '#0a0e1a')}>
              Finalizar
            </button>
          )}

          {t && pausaReporte && (
            <button
              onClick={() => onReanudar(t.id)}
              disabled={ocupado === `reanudar|${t.id}`}
              style={{
                ...boton(green, '#042c2a'),
                padding: '10px 0',
                fontSize: 13,
                opacity: ocupado === `reanudar|${t.id}` ? 0.5 : 1,
              }}
            >
              Reanudar
            </button>
          )}

          {!t && p.faltan === 0 && (
            <span style={{ color: green, fontSize: 12, fontWeight: 800 }}>✓ Completo</span>
          )}
        </div>
      </div>

      {fin && t && (
        <div className="pz-fin">
          <input
            type="number"
            inputMode="numeric"
            autoFocus
            min={1}
            max={p.faltan}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="¿Cuántas piezas hiciste?"
            style={{
              minWidth: 0,
              background: '#08090d',
              border: `1px solid ${line}`,
              borderRadius: 10,
              padding: '11px 12px',
              fontSize: 15,
              color: '#fff',
            }}
          />
          <button
            onClick={() => setQ(String(p.faltan))}
            style={{
              background: 'none',
              color: '#94a3b8',
              border: `1px solid ${line}`,
              borderRadius: 10,
              padding: '0 12px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Todas
          </button>
          <button
            onClick={guardar}
            disabled={ocupado === `finalizar|${t.id}`}
            style={{
              background: green,
              color: '#042c2a',
              border: 'none',
              borderRadius: 10,
              padding: '0 18px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            ✓ Guardar
          </button>
          <button
            onClick={cerrarFinalizar}
            aria-label="Seguir trabajando"
            style={{
              background: 'none',
              color: '#94a3b8',
              border: `1px solid ${line}`,
              borderRadius: 10,
              padding: '0 12px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      )}

    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Reporte al administrador (motivo, descripcion y foto)              */
/* ------------------------------------------------------------------ */

// Reduce la foto para que suba rapido aunque haya mala señal
async function comprimirFoto(archivo: File): Promise<Blob> {
  const url = URL.createObjectURL(archivo)
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => mal(new Error('No se pudo leer la foto'))
      i.src = url
    })
    const max = 1280
    const escala = Math.min(1, max / Math.max(img.width, img.height))
    const lienzo = document.createElement('canvas')
    lienzo.width = Math.round(img.width * escala)
    lienzo.height = Math.round(img.height * escala)
    lienzo.getContext('2d')?.drawImage(img, 0, 0, lienzo.width, lienzo.height)
    return await new Promise<Blob>((ok, mal) =>
      lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo preparar la foto'))), 'image/jpeg', 0.72)
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

function PanelAdmin({
  enviando,
  onEnviar,
}: {
  enviando: boolean
  onEnviar: (motivo: string, nota: string, foto: Blob | null) => void
}) {
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')
  const [foto, setFoto] = useState<Blob | null>(null)
  const [vistaFoto, setVistaFoto] = useState('')
  const [fallo, setFallo] = useState('')

  useEffect(() => {
    return () => {
      if (vistaFoto) URL.revokeObjectURL(vistaFoto)
    }
  }, [vistaFoto])

  async function elegirFoto(archivo: File | undefined) {
    if (!archivo) return
    setFallo('')
    try {
      const b = await comprimirFoto(archivo)
      setFoto(b)
      setVistaFoto(URL.createObjectURL(b))
    } catch {
      setFallo('No se pudo preparar la foto. Intenta con otra.')
    }
  }

  function quitarFoto() {
    setFoto(null)
    setVistaFoto('')
  }

  const falta = motivo === '' ? 'Elige qué pasó.' : motivo === 'Otro' && !nota.trim() ? 'Describe qué pasó.' : ''

  const chip = (activo: boolean): CSSProperties => ({
    ...chipAmber,
    padding: '9px 15px',
    fontSize: 13.5,
    background: activo ? amber : '#1f1708',
    color: activo ? '#1a1204' : amber,
    fontWeight: activo ? 800 : 500,
  })

  return (
    <div
      style={{
        background: card,
        border: `1px solid ${line}`,
        borderRadius: 14,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <div style={{ color: '#94a3b8', fontSize: 12.5, marginBottom: 10 }}>
        Le llega al administrador y se detienen los relojes del área. Cuando se resuelva, toca "Reanudar área".
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {MOTIVOS_ADMIN.map((m) => (
          <button key={m} onClick={() => setMotivo(m)} style={chip(motivo === m)}>
            {m}
          </button>
        ))}
      </div>

      <textarea
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        rows={3}
        placeholder={
          motivo === 'Otro' ? 'Describe qué pasó (obligatorio)' : 'Describe el problema (opcional)'
        }
        style={{
          width: '100%',
          marginTop: 12,
          background: '#08090d',
          border: `1px solid ${motivo === 'Otro' && !nota.trim() ? amber : line}`,
          borderRadius: 10,
          padding: '10px 12px',
          fontSize: 15,
          color: '#fff',
          resize: 'vertical',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
        <label
          style={{
            background: '#0f1b3d',
            color: bl,
            border: `1px solid ${bl}66`,
            borderRadius: 10,
            padding: '10px 16px',
            fontSize: 13.5,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          📷 {foto ? 'Cambiar foto' : 'Tomar foto'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              void elegirFoto(e.target.files?.[0])
              e.target.value = ''
            }}
            style={{ display: 'none' }}
          />
        </label>

        {vistaFoto && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={vistaFoto}
              alt="Evidencia"
              style={{ height: 56, borderRadius: 8, border: `1px solid ${line}` }}
            />
            <button
              onClick={quitarFoto}
              style={{
                background: 'none',
                color: '#94a3b8',
                border: `1px solid ${line}`,
                borderRadius: 10,
                padding: '8px 12px',
                fontSize: 12.5,
                cursor: 'pointer',
              }}
            >
              Quitar
            </button>
          </>
        )}
      </div>

      {fallo && <div style={{ color: '#f87171', fontSize: 12.5, marginTop: 8 }}>{fallo}</div>}

      <button
        onClick={() => onEnviar(motivo, nota, foto)}
        disabled={enviando || falta !== ''}
        style={{
          width: '100%',
          marginTop: 14,
          background: falta ? '#2a2f3d' : amber,
          color: falta ? '#64748b' : '#1a1204',
          border: 'none',
          borderRadius: 11,
          padding: '13px 0',
          fontSize: 15,
          fontWeight: 800,
          cursor: falta ? 'default' : 'pointer',
          opacity: enviando ? 0.6 : 1,
        }}
      >
        {enviando ? 'Enviando...' : falta ? falta : 'Enviar reporte al administrador'}
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Pantalla                                                           */
/* ------------------------------------------------------------------ */

type Panel = 'pausa' | 'admin' | null

export default function ProyectoPage() {
  const params = useParams<{ proyectoId: string }>()
  const proyectoId = params.proyectoId

  const [detalle, setDetalle] = useState<ProyectoOperador | null>(null)
  const [vista, setVista] = useState<AreaVista | null>(null)
  const [areaId, setAreaId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  const [offset, setOffset] = useState(0)
  const [tic, setTic] = useState(() => Date.now())

  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)

  // null = cerrado; areaId null = botón "Entrar a mi área" (la clave dice cuál es el área)
  const [teclado, setTeclado] = useState<{ areaId: string | null; nombre: string | null } | null>(null)
  const [errorClave, setErrorClave] = useState('')
  const [fallos, setFallos] = useState(0)
  const [validando, setValidando] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)

  const [fechaPdf, setFechaPdf] = useState(hoyMexico)
  const [historial, setHistorial] = useState<EvidenciaGuardada[]>([])

  const ahora = tic + offset

  const cargar = useCallback(
    async (area: string | null) => {
      const d = await getProyectoOperador(proyectoId)
      if (d) {
        setDetalle(d)
        setOffset(new Date(d.ahora).getTime() - Date.now())
      }
      if (area) {
        const r = await getAreaOperador(proyectoId, area)
        if (r.vista) {
          setVista(r.vista)
          setOffset(new Date(r.vista.ahora).getTime() - Date.now())
        } else {
          setVista(null)
          setAreaId(null)
          if (r.error) setError(r.error)
        }
      } else {
        setVista(null)
      }
      setCargando(false)
    },
    [proyectoId]
  )

  // carga inicial y actualizacion cada 15 s (asi ves lo que hacen otros operadores)
  useEffect(() => {
    void cargar(areaId)
    const intervalo = setInterval(() => void cargar(areaId), 15000)
    return () => clearInterval(intervalo)
  }, [cargar, areaId])

  // En vivo: además de cada 15 s, se recarga al instante cuando cambia el avance de este proyecto
  useRealtimeAvances(() => void cargar(areaId), { proyectoId })

  const cargarHistorial = useCallback(async () => {
    setHistorial(await listarEvidencias(proyectoId))
  }, [proyectoId])

  useEffect(() => {
    void cargarHistorial()
  }, [cargarHistorial])

  // el reloj de la pantalla se mueve cada segundo
  useEffect(() => {
    const intervalo = setInterval(() => setTic(Date.now()), 1000)
    return () => clearInterval(intervalo)
  }, [])

  async function ejecutar(
    clave: string,
    accion: () => Promise<{ error?: string }>,
    mensaje?: string
  ) {
    setError('')
    setAviso('')
    setOcupado(clave)
    const r = await accion()
    setOcupado(null)
    if (r.error) {
      setError(r.error)
      await cargar(areaId)
      return false
    }
    if (mensaje) setAviso(mensaje)
    await cargar(areaId)
    return true
  }

  /* ---- Entrar / salir ---- */

  async function enviarClave(clave: string) {
    if (!teclado) return
    setValidando(true)
    setErrorClave('')
    const r = await entrarConClave(clave, teclado.areaId ?? undefined)
    setValidando(false)

    if (r.error || !r.areaId) {
      setErrorClave(r.error ?? 'No se pudo entrar.')
      setFallos((n) => n + 1)
      return
    }

    setError('')
    setPanel(null)
    setAreaId(r.areaId)
    setTeclado(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function salir() {
    if (!areaId) return
    await salirArea(areaId)
    setAreaId(null)
    setVista(null)
    setPanel(null)
    setAviso('Saliste del área. Los relojes que dejaste corriendo siguen avanzando.')
    await cargar(null)
  }

  function abrirTeclado(areaId: string | null, nombre: string | null) {
    setError('')
    setAviso('')
    setErrorClave('')
    setFallos(0)
    setTeclado({ areaId, nombre })
  }

  // Área abierta en este dispositivo: entra directo. Bloqueada: pide su clave de 3 dígitos
  function tocarArea(a: AreaOperador) {
    if (a.cerrada) return
    if (a.desbloqueada) {
      setError('')
      setAviso('')
      setAreaId(a.areaId)
      return
    }
    abrirTeclado(a.areaId, a.nombre)
  }

  /* ---- Piezas ---- */

  async function iniciar(id: string, tipo: TipoPieza) {
    if (!areaId) return
    await ejecutar(`iniciar|${id}`, () => iniciarPieza(proyectoId, areaId, id, tipo))
  }

  async function finalizar(trabajoId: string, cantidad: number) {
    await ejecutar(
      `finalizar|${trabajoId}`,
      () => finalizarPieza(trabajoId, cantidad),
      '✓ Avance guardado'
    )
  }

  async function reanudar(trabajoId: string) {
    await ejecutar(`reanudar|${trabajoId}`, () => reanudarPieza(trabajoId), '▶ Reloj reanudado')
  }

  /* ---- Area ---- */

  async function pausaDelArea(motivo: string) {
    if (!areaId) return
    setPanel(null)
    const turno = motivo === MOTIVO_TURNO
    const ok = await ejecutar('area', () =>
      pausarArea(proyectoId, areaId, turno ? 'cambio_turno' : 'pausa_area', motivo)
    )
    if (!ok) return
    if (turno) {
      void enviarEvidencia(true)
      await salirArea(areaId)
      setAreaId(null)
      setVista(null)
      setAviso(
        'Cambio de turno: los relojes quedaron en pausa y la evidencia del día se envió al historial y al administrador. El siguiente operador entra con su clave y los reanuda.'
      )
      await cargar(null)
    } else {
      setAviso(`⏸ Área en pausa: ${motivo}.`)
    }
  }

  async function enviarAdmin(motivo: string, nota: string, foto: Blob | null) {
    if (!areaId) return
    let evidenciaUrl: string | undefined
    if (foto) {
      setOcupado('admin')
      const fd = new FormData()
      fd.append('foto', foto, 'evidencia.jpg')
      const r = await subirEvidenciaReporte(fd)
      if (r.error || !r.url) {
        setOcupado(null)
        setError(r.error ?? 'No se pudo subir la foto.')
        return
      }
      evidenciaUrl = r.url
    }
    const ok = await ejecutar(
      'admin',
      () => reportarArea(proyectoId, areaId, motivo, nota, evidenciaUrl),
      `⏸ Administrador notificado: ${motivo}. Los relojes están detenidos; toca "Reanudar área" cuando se resuelva.`
    )
    if (ok) setPanel(null)
  }

  async function reanudarElArea() {
    if (!areaId) return
    await ejecutar('reanudar-area', () => reanudarArea(proyectoId, areaId), '▶ Área reanudada')
  }

  async function marcarTerminada() {
    if (!areaId || !vista) return
    if (
      !window.confirm(
        `¿Marcar ${vista.areaNombre} como terminada? Se enviará al historial y se avisará al administrador.`
      )
    ) {
      return
    }
    const ok = await ejecutar('marcar', () => marcarAreaTerminada(proyectoId, areaId))
    if (ok) {
      setAreaId(null)
      setVista(null)
      setAviso('El área quedó terminada y el administrador ya fue notificado.')
      await cargar(null)
    }
  }

  /* ---- PDF ---- */

  async function bajarPdf() {
    setError('')
    setOcupado('pdf')
    const r = await getEvidenciaDia(proyectoId, fechaPdf)
    if (r.error || !r.data) {
      setOcupado(null)
      setError(r.error ?? 'No se pudo generar el PDF.')
      return
    }
    try {
      await descargarPdfDia(r.data)
    } catch (e) {
      console.error('Error al crear PDF:', e)
      setError('No se pudo crear el PDF.')
    }
    setOcupado(null)
  }

  async function enviarEvidencia(silencioso = false) {
    if (!silencioso) setError('')
    setOcupado('evidencia')
    try {
      const fecha = hoyMexico()
      const r = await getEvidenciaDia(proyectoId, fecha)
      if (r.error || !r.data) throw new Error(r.error ?? 'No se pudo preparar la evidencia.')
      const { blob } = await crearPdfDia(r.data)
      if (blob.size > 20 * 1024 * 1024) throw new Error('El PDF es demasiado pesado.')

      // Se sube directo a Storage: las acciones de servidor solo aceptan 1 MB
      const ruta = `evidencia-dia/${proyectoId}/${fecha}-${Date.now()}.pdf`
      const { error: errorSubida } = await supabase.storage
        .from('evidencias')
        .upload(ruta, blob, { contentType: 'application/pdf', upsert: false })
      if (errorSubida) throw new Error(`No se pudo subir el PDF (${errorSubida.message}).`)

      const g = await guardarEvidenciaDia(proyectoId, fecha, ruta)
      if (g.error) throw new Error(g.error)
      await cargarHistorial()
      if (!silencioso) setAviso('✓ Evidencia del día guardada en el historial y enviada al administrador.')
    } catch (e) {
      console.error('Error al enviar evidencia:', e)
      setError(e instanceof Error ? e.message : 'No se pudo enviar la evidencia.')
    }
    setOcupado(null)
  }

  /* ---- Pintar ---- */

  if (cargando) {
    return (
      <div style={{ color: '#94a3b8', fontSize: 13, padding: 24 }}>Cargando proyecto...</div>
    )
  }

  if (!detalle) {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <Link
          href="/operator/avances"
          style={{ color: '#94a3b8', fontSize: 12.5, display: 'inline-block', marginBottom: 8 }}
        >
          ← Proyectos
        </Link>
        <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: '34px 0' }}>
          No se encontró el proyecto.
        </div>
      </div>
    )
  }

  const enArea = areaId !== null && vista !== null
  const todasCompletas =
    vista !== null &&
    !vista.usaPdf &&
    vista.piezas.length > 0 &&
    vista.piezas.every((p) => p.faltan === 0 && !p.trabajo)

  const banners = (
    <>
      {aviso && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            background: aviso.startsWith('⏸') ? '#2a1f08' : '#0a2e24',
            color: aviso.startsWith('⏸') ? amber : '#6ee7b7',
            fontSize: 12,
            padding: '8px 12px',
            borderRadius: 9,
            marginBottom: 12,
          }}
        >
          <span>{aviso}</span>
          <button
            onClick={() => setAviso('')}
            aria-label="Cerrar aviso"
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}
      {error && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            background: '#2a0d10',
            color: '#fca5a5',
            fontSize: 12,
            padding: '8px 12px',
            borderRadius: 9,
            marginBottom: 12,
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError('')}
            aria-label="Cerrar aviso"
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}
    </>
  )

  /* ---------------- Pantalla del area ---------------- */
  if (enArea && vista) {
    return (
      <div className="op-wrap" style={{ maxWidth: 1500 }}>
        <EstilosOperador />
        {banners}

        <div
          style={{
            ...gradiente,
            padding: '14px 18px',
            marginBottom: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
          }}
          className="op-cab"
        >
          <div>
            <div style={{ color: bl, fontSize: 10.5, fontWeight: 700 }}>
              {detalle.codigo}
              {detalle.cliente ? ` · ${detalle.cliente}` : ''}
            </div>
            <div style={{ color: '#fff', fontSize: 15, fontWeight: 800 }}>{detalle.nombre}</div>
          </div>
          <span
            style={{
              background: '#0f1b3d',
              color: bl,
              fontSize: 12,
              fontWeight: 800,
              padding: '6px 14px',
              borderRadius: 20,
              whiteSpace: 'nowrap',
            }}
          >
            {vista.areaNombre}
          </span>
        </div>

        <div className="op-barra">
          {/* PRUEBA: registro por ensambles y subensambles (quitar este Link si no se queda) */}
          <Link
            href={`/operator/avances/${proyectoId}/despiece/${areaId}`}
            style={{
              background: '#0f1b3d',
              color: bl,
              border: `1px solid ${bl}55`,
              borderRadius: 10,
              padding: '10px 15px',
              fontSize: 14,
              fontWeight: 700,
              textAlign: 'center',
            }}
          >
            Trabajar por pasos (prueba)
          </Link>
          <button
            onClick={() => setPanel((v) => (v === 'pausa' ? null : 'pausa'))}
            style={{
              background: 'none',
              color: '#cbd5e1',
              border: `1px solid ${line}`,
              borderRadius: 10,
              padding: '10px 15px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reporte del área
          </button>
          <button
            onClick={() => setPanel((v) => (v === 'admin' ? null : 'admin'))}
            style={{
              background: 'none',
              color: amber,
              border: `1px solid ${amber}66`,
              borderRadius: 10,
              padding: '10px 15px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reporte al administrador
          </button>
          <button
            onClick={salir}
            style={{
              background: 'none',
              color: '#94a3b8',
              border: `1px solid ${line}`,
              borderRadius: 10,
              padding: '10px 15px',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Salir
          </button>
        </div>

        {panel === 'pausa' && (
          <div
            style={{
              background: card,
              border: `1px solid ${line}`,
              borderRadius: 14,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ color: '#64748b', fontSize: 11, marginBottom: 8 }}>
              Detiene los relojes del área. No se avisa al administrador.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {MOTIVOS_PAUSA_AREA.map((m) => (
                <button key={m} onClick={() => pausaDelArea(m)} style={chipAmber}>
                  {m}
                </button>
              ))}
              <button onClick={() => pausaDelArea(MOTIVO_TURNO)} style={chipAzul}>
                {MOTIVO_TURNO}
              </button>
            </div>
          </div>
        )}

        {panel === 'admin' && (
          <PanelAdmin enviando={ocupado === 'admin'} onEnviar={enviarAdmin} />
        )}

        {vista.pausa && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              background: '#2a1f08',
              border: `1px solid ${amber}66`,
              borderRadius: 12,
              padding: '10px 14px',
              marginBottom: 12,
            }}
          >
            <span style={{ color: amber, fontSize: 12.5, fontWeight: 700 }}>
              ⏸ Área en pausa: {vista.pausa.motivo}
            </span>
            <button
              onClick={reanudarElArea}
              disabled={ocupado === 'reanudar-area'}
              style={{
                background: green,
                color: '#042c2a',
                border: 'none',
                borderRadius: 10,
                padding: '8px 16px',
                fontSize: 12.5,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Reanudar área
            </button>
          </div>
        )}

        <div
          style={{
            color: '#64748b',
            fontSize: 11,
            letterSpacing: '.08em',
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          PIEZAS DE ESTA ÁREA
        </div>

        {vista.piezas.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: '34px 0' }}>
            Todavía no hay piezas cargadas para esta área en este proyecto.
          </div>
        ) : (
          <div className="pz-grid">
            {vista.piezas.map((p) => (
              <PiezaCard
                key={p.id}
                p={p}
                ahora={ahora}
                ocupado={ocupado}
                onIniciar={iniciar}
                onFinalizar={finalizar}
                onReanudar={reanudar}
                despieceHref={
                  p.tipo === 'producto' && /^\[[^\]]+\]/.test(p.nombre)
                    ? `/operator/avances/${proyectoId}/despiece/${areaId}#${encodeURIComponent(p.nombre.slice(1, p.nombre.indexOf(']')))}`
                    : undefined
                }
              />
            ))}
          </div>
        )}

        {todasCompletas && !vista.cerrada && (
          <button
            onClick={marcarTerminada}
            disabled={ocupado === 'marcar'}
            style={{
              width: '100%',
              marginTop: 16,
              background: green,
              color: '#042c2a',
              border: 'none',
              borderRadius: 12,
              padding: '14px 0',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Marcar área terminada
          </button>
        )}
      </div>
    )
  }

  /* ---------------- Pantalla del proyecto ---------------- */
  return (
    <div className="op-wrap" style={{ maxWidth: 1500 }}>
      <EstilosOperador />
      {teclado && (
        <Teclado
          area={teclado.nombre}
          error={errorClave}
          fallos={fallos}
          validando={validando}
          onCerrar={() => setTeclado(null)}
          onEntrar={enviarClave}
        />
      )}

      <Link
        href="/operator/avances"
        style={{ color: '#94a3b8', fontSize: 12.5, display: 'inline-block', marginBottom: 8 }}
      >
        ← Proyectos
      </Link>

      {banners}

      <div
        style={{
          ...gradiente,
          padding: '16px 20px',
          marginBottom: 14,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
        className="op-cab"
      >
        <div>
          <div style={{ color: bl, fontSize: 10.5, fontWeight: 700 }}>{detalle.codigo}</div>
          <div style={{ color: '#fff', fontSize: 19, fontWeight: 800 }}>{detalle.nombre}</div>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>
            {detalle.cliente || 'Sin cliente'} · Avance general {detalle.progreso}%
          </div>
        </div>
        <button
          onClick={() => abrirTeclado(null, null)}
          style={{
            background: blue,
            color: '#fff',
            border: 'none',
            borderRadius: 11,
            padding: '12px 22px',
            fontSize: 14,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          Entrar a mi área
        </button>
      </div>

      <div
        style={{
          color: '#64748b',
          fontSize: 11,
          letterSpacing: '.08em',
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        ÁREAS DEL PROYECTO
      </div>

      {detalle.areas.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: '34px 0' }}>
          Este proyecto todavía no tiene piezas asignadas a ningún área.
        </div>
      ) : (
        <div className="ar-grid">
          {detalle.areas.map((a) => (
            <div
              key={a.areaId}
              onClick={() => tocarArea(a)}
              style={{
                background: card,
                border: `1px solid ${a.desbloqueada ? bl : line}`,
                borderRadius: 14,
                padding: '13px 15px',
                cursor: a.cerrada ? 'default' : 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>{a.nombre}</div>
                  <div style={{ color: '#7c8aa5', fontSize: 12, marginTop: 2 }}>
                    {a.piezas > 0
                      ? `${a.piezas} ${a.piezas === 1 ? 'pieza' : 'piezas'} por hacer${a.cerrada ? ' · terminada' : ''}`
                      : 'Sin piezas en este proyecto'}
                  </div>
                </div>
                <IconoCandado abierto={a.desbloqueada} />
              </div>

              <div
                style={{
                  height: 5,
                  background: '#0a0d16',
                  borderRadius: 3,
                  marginTop: 10,
                  overflow: 'hidden',
                }}
              >
                <div style={{ width: `${a.porcentaje}%`, height: '100%', background: teal }} />
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 5 }}>
                {a.porcentaje}% de avance
              </div>

              {a.pausa ? (
                <div style={{ color: amber, fontSize: 12, fontWeight: 700, marginTop: 6 }}>
                  ⏸ En pausa: {a.pausa.motivo}
                </div>
              ) : a.enCurso > 0 ? (
                <div style={{ color: green, fontSize: 12, fontWeight: 700, marginTop: 6 }}>
                  ● {a.enCurso} {a.enCurso === 1 ? 'pieza' : 'piezas'} en curso
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div style={{ color: '#475569', fontSize: 11, marginTop: 12 }}>
        Toca «Entrar a mi área» (o toca tu área) y escribe su contraseña de 3 dígitos.
      </div>
      <div style={{ color: '#334155', fontSize: 10, marginTop: 4 }}>
        {detalle.usaPdf ? 'Piezas: matriz de corte (PDF)' : 'Piezas: productos del pedido'}
      </div>

      <div
        style={{
          background: card,
          border: `1px solid ${line}`,
          borderRadius: 14,
          padding: '14px 16px',
          marginTop: 18,
        }}
      >
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>Evidencia del día</div>
        <div style={{ color: '#7c8aa5', fontSize: 12, marginTop: 2, marginBottom: 12 }}>
          Un solo PDF con todas las áreas: avance, piezas por hora, pausas y reportes.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="date"
            value={fechaPdf}
            onChange={(e) => setFechaPdf(e.target.value)}
            style={{
              background: '#08090d',
              border: `1px solid ${line}`,
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 14,
              color: '#fff',
            }}
          />
          <button
            onClick={bajarPdf}
            disabled={ocupado === 'pdf' || !fechaPdf}
            style={{
              background: '#fff',
              color: '#0a0e1a',
              border: 'none',
              borderRadius: 10,
              padding: '11px 18px',
              fontSize: 13.5,
              fontWeight: 800,
              cursor: 'pointer',
              opacity: ocupado === 'pdf' ? 0.5 : 1,
            }}
          >
            {ocupado === 'pdf' ? 'Generando...' : 'Descargar PDF'}
          </button>
          <button
            onClick={() => void enviarEvidencia()}
            disabled={ocupado === 'evidencia'}
            style={{
              background: blue,
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '11px 18px',
              fontSize: 13.5,
              fontWeight: 800,
              cursor: 'pointer',
              opacity: ocupado === 'evidencia' ? 0.5 : 1,
            }}
          >
            {ocupado === 'evidencia' ? 'Enviando...' : 'Enviar al historial y al administrador'}
          </button>
        </div>

        {historial.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ color: '#64748b', fontSize: 11, letterSpacing: '.08em', fontWeight: 700, marginBottom: 6 }}>
              HISTORIAL
            </div>
            {historial.map((h) => (
              <a
                key={h.id}
                href={h.pdfUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  flexWrap: 'wrap',
                  padding: '9px 0',
                  borderTop: `1px solid ${line}`,
                  color: '#cbd5e1',
                  fontSize: 13,
                }}
              >
                <span>
                  📄 Evidencia del {h.fecha}
                </span>
                <span style={{ color: '#7c8aa5', fontSize: 12 }}>
                  {h.creadoPor} ·{' '}
                  {new Date(h.creadoEn).toLocaleString('es-MX', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: ZONA,
                  })}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
