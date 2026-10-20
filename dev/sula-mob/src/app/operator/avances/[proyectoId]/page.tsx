
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
  prepararProyecto,
  guardarEvidenciaDia,
  iniciarPieza,
  listarEvidencias,
  pausarArea,
  reanudarArea,
  reanudarPieza,
  reportarPieza,
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
import { MOTIVOS_PIEZA } from '@/lib/operador/areas'
import { fuenteOperador } from '@/lib/operador/fuente'

/* ------------------------------------------------------------------ */
/*  Diseño (mismos colores del prototipo aprobado)                     */
/* ------------------------------------------------------------------ */

const card = '#121a2b'
const card2 = '#18223a'
const line = '#26314a'
const blue = '#2563ff'
const bl = '#4f8cff'
const green = '#22d39a'
const amber = '#ffb020'
const teal = '#2ee6c8'
// Fondo de las tarjetas: degradado sutil para que se vean con volumen
const fondoTarjeta = 'linear-gradient(180deg, #16203a 0%, #111929 100%)'

const ZONA = 'America/Mexico_City'

// Motivos del reporte de una pieza (detiene su reloj y avisa al administrador)
const MOTIVOS_REPORTE = [
  ...MOTIVOS_PIEZA,
  'Material defectuoso',
  'Plano o medida con error',
  'Corte de energía',
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
      .op-wrap{letter-spacing:-.005em}
      .op-wrap button{font-family:inherit;min-height:40px;touch-action:manipulation;transition:transform .08s ease,filter .15s ease,box-shadow .15s ease}
      .op-wrap button:active:not(:disabled){transform:scale(.98)}
      .op-wrap button:hover:not(:disabled){filter:brightness(1.08)}
      .op-num{font-variant-numeric:tabular-nums;letter-spacing:.01em}
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
      <div style={{ fontSize: 10.5, color: '#7d8cab', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>{etiqueta}</div>
      <div className="op-num" style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1.15 }}>{valor}</div>
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
  onReportar,
}: {
  p: PiezaOperador
  ahora: number
  ocupado: string | null
  onIniciar: (id: string, tipo: TipoPieza) => void
  onFinalizar: (trabajoId: string, cantidad: number) => void
  onReanudar: (trabajoId: string) => void
  /** Detiene el reloj SOLO de esta pieza y avisa al admin; se sigue con Reanudar */
  onReportar: (trabajoId: string, motivo: string, nota: string, foto: Blob | null) => void
}) {
  const [fin, setFin] = useState(false)
  const [reporte, setReporte] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')
  // Foto de evidencia del problema (opcional): se comprime antes de subirla
  const [foto, setFoto] = useState<Blob | null>(null)
  const [vistaFoto, setVistaFoto] = useState('')
  const [falloFoto, setFalloFoto] = useState('')

  useEffect(() => {
    return () => {
      if (vistaFoto) URL.revokeObjectURL(vistaFoto)
    }
  }, [vistaFoto])

  async function elegirFoto(archivo: File | undefined) {
    if (!archivo) return
    setFalloFoto('')
    try {
      const b = await comprimirFoto(archivo)
      setFoto(b)
      setVistaFoto(URL.createObjectURL(b))
    } catch {
      setFalloFoto('No se pudo preparar la foto. Intenta con otra.')
    }
  }

  function limpiarReporte() {
    setMotivo('')
    setNota('')
    setFoto(null)
    setVistaFoto('')
    setFalloFoto('')
  }
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
    borderRadius: 12,
    padding: '14px 0',
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: '.01em',
    cursor: 'pointer',
    boxShadow: fondo.startsWith('#') ? `0 8px 20px -10px ${fondo}` : 'none',
  })
  // Franja de color según el estado: azul = por iniciar, verde = trabajando, ámbar = en pausa
  const colorEstado = pausaReporte || pausaArea ? amber : corriendo ? teal : bl

  return (
    <div
      style={{
        background: fondoTarjeta,
        borderRadius: 18,
        padding: '18px 20px',
        border: `1px solid ${t ? `${colorEstado}66` : line}`,
        borderLeft: `5px solid ${colorEstado}`,
        boxShadow: corriendo
          ? `0 14px 34px -16px ${teal}88`
          : pausaReporte || pausaArea
            ? `0 14px 34px -16px ${amber}77`
            : '0 10px 28px -18px #000',
      }}
    >
      <div className="pz-top">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="pz-nombre" style={{ color: '#fff', fontSize: 19, fontWeight: 800, lineHeight: 1.25, letterSpacing: '-.01em' }}>{p.nombre}</span>
            {p.modulo && (
              <span
                style={{
                  color: '#a9c2ff',
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '.04em',
                  background: `${bl}1f`,
                  border: `1px solid ${bl}33`,
                  padding: '3px 9px',
                  borderRadius: 999,
                }}
              >
                {p.modulo}
              </span>
            )}
          </div>
          {p.material && (
            <div style={{ color: '#dbe4f5', fontSize: 14, fontWeight: 600, marginTop: 8 }}>{p.material}</div>
          )}
          {medidasYNotas && (
            <div style={{ color: '#8fa0bf', fontSize: 13, marginTop: 3 }}>{medidasYNotas}</div>
          )}
          <div style={{ display: 'flex', gap: 30, marginTop: 14 }}>
            <Estadistica etiqueta="Meta" valor={p.meta} color="#e2e8f0" />
            <Estadistica etiqueta="Hechas" valor={p.hechas} color={teal} />
            <Estadistica etiqueta="Faltan" valor={p.faltan} color={p.faltan ? amber : green} />
          </div>
        </div>

        <div className="pz-side">
          {t && corriendo && (
            <span
              className="op-num"
              style={{
                color: teal,
                fontSize: 26,
                fontWeight: 800,
                background: `${teal}14`,
                border: `1px solid ${teal}55`,
                borderRadius: 999,
                padding: '6px 16px',
                textShadow: `0 0 18px ${teal}66`,
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

          {t && corriendo && !fin && (
            <button
              onClick={() => {
                limpiarReporte()
                setReporte((v) => !v)
              }}
              style={{
                ...boton('none', amber),
                border: `1px solid ${amber}66`,
                padding: '10px 0',
                fontSize: 13,
              }}
            >
              ⚠ Reportar problema
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

      {reporte && t && corriendo && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${line}`, paddingTop: 12 }}>
          <div style={{ color: '#fff', fontSize: 13.5, fontWeight: 800, marginBottom: 8 }}>
            ¿Qué pasó? <span style={{ color: '#94a3b8', fontWeight: 400 }}>Se detiene el reloj de esta pieza y se avisa al administrador.</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {MOTIVOS_REPORTE.map((m) => (
              <button
                key={m}
                onClick={() => setMotivo(m)}
                style={{
                  background: motivo === m ? '#3a2a07' : card2,
                  color: motivo === m ? amber : '#cbd5e1',
                  border: `1px solid ${motivo === m ? amber : line}`,
                  borderRadius: 10,
                  padding: '11px 14px',
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {m}
              </button>
            ))}
          </div>
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder={motivo === 'Otro' ? 'Escribe qué pasó (obligatorio)' : 'Nota (opcional)'}
            style={{
              width: '100%',
              marginTop: 10,
              background: '#08090d',
              border: `1px solid ${line}`,
              borderRadius: 10,
              padding: '11px 12px',
              fontSize: 14,
              color: '#fff',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <label
              style={{
                background: '#0f1b3d',
                color: bl,
                border: `1px solid ${bl}66`,
                borderRadius: 10,
                padding: '11px 16px',
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
                <img src={vistaFoto} alt="Evidencia" style={{ height: 52, borderRadius: 8, border: `1px solid ${line}` }} />
                <button
                  onClick={() => {
                    setFoto(null)
                    setVistaFoto('')
                  }}
                  style={{ background: 'none', color: '#94a3b8', border: `1px solid ${line}`, borderRadius: 10, padding: '8px 12px', fontSize: 12.5, cursor: 'pointer' }}
                >
                  Quitar
                </button>
              </>
            )}
            {falloFoto && <span style={{ color: '#fca5a5', fontSize: 12 }}>{falloFoto}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              onClick={() => {
                onReportar(t.id, motivo, nota.trim(), foto)
                setReporte(false)
                limpiarReporte()
              }}
              disabled={!motivo || (motivo === 'Otro' && !nota.trim()) || ocupado === `reportar|${t.id}`}
              style={{
                ...boton(amber, '#2a1a00'),
                flex: 1,
                opacity: !motivo || (motivo === 'Otro' && !nota.trim()) ? 0.45 : 1,
              }}
            >
              ⏸ Detener reloj y avisar
            </button>
            <button
              onClick={() => setReporte(false)}
              style={{
                background: 'none',
                color: '#94a3b8',
                border: `1px solid ${line}`,
                borderRadius: 10,
                padding: '0 16px',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Foto de evidencia de un reporte (se comprime antes de subirla)     */
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

/* ------------------------------------------------------------------ */
/*  Pantalla                                                           */
/* ------------------------------------------------------------------ */

type Panel = 'pausa' | null

/* ------------------------------------------------------------------ */
/*  Piezas por pasos (proyectos por pieza: despiece del plano o PDF)   */
/* ------------------------------------------------------------------ */

/** "ESCRIT. MB-01 ×3 › FALDON ARMADO" → producto y subensamble */
function partirModulo(modulo: string | null) {
  const texto = modulo ?? ''
  const i = texto.indexOf(' › ')
  return i < 0
    ? { producto: texto || 'Piezas', subensamble: '' }
    : { producto: texto.slice(0, i), subensamble: texto.slice(i + 3) }
}

function Titulo({ children, color = '#64748b' }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ color, fontSize: 11, letterSpacing: '.08em', fontWeight: 800, margin: '18px 0 8px' }}>{children}</div>
  )
}

function PiezasPorPasos({
  piezas,
  ahora,
  ocupado,
  onIniciar,
  onFinalizar,
  onReanudar,
  onReportar,
}: {
  piezas: PiezaOperador[]
  ahora: number
  ocupado: string | null
  onIniciar: (id: string, tipo: TipoPieza) => void
  onFinalizar: (trabajoId: string, cantidad: number) => void
  onReanudar: (trabajoId: string) => void
  onReportar: (trabajoId: string, motivo: string, nota: string, foto: Blob | null) => void
}) {
  // La que el operador tocó en la lista; si no, la primera pendiente en el orden del plano
  const [elegida, setElegida] = useState<string | null>(null)
  // "Dejar para después": se van al final de la fila
  const [saltadas, setSaltadas] = useState<string[]>([])
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({})
  const [verTerminadas, setVerTerminadas] = useState(false)

  const enCurso = piezas.filter((p) => p.trabajo)
  const libres = piezas.filter((p) => !p.trabajo && p.faltan > 0)
  const enOrden = [...libres.filter((p) => !saltadas.includes(p.id)), ...libres.filter((p) => saltadas.includes(p.id))]
  const sigue = enOrden.find((p) => p.id === elegida) ?? enOrden[0] ?? null
  const resto = enOrden.filter((p) => p !== sigue)
  const terminadas = piezas.filter((p) => p.faltan === 0 && !p.trabajo)

  // Pendientes por producto → subensamble, en el orden del plano
  const grupos: { producto: string; subs: { nombre: string; piezas: PiezaOperador[] }[]; total: number }[] = []
  for (const p of resto) {
    const { producto, subensamble } = partirModulo(p.modulo)
    let g = grupos.find((x) => x.producto === producto)
    if (!g) grupos.push((g = { producto, subs: [], total: 0 }))
    let s = g.subs.find((x) => x.nombre === subensamble)
    if (!s) g.subs.push((s = { nombre: subensamble, piezas: [] }))
    s.piezas.push(p)
    g.total++
  }
  const productoDeSigue = sigue ? partirModulo(sigue.modulo).producto : null
  const abierto = (producto: string) => abiertos[producto] ?? producto === productoDeSigue

  const tarjeta = (p: PiezaOperador) => (
    <PiezaCard key={p.id} p={p} ahora={ahora} ocupado={ocupado} onIniciar={onIniciar} onFinalizar={onFinalizar} onReanudar={onReanudar} onReportar={onReportar} />
  )

  if (piezas.length === 0) {
    return (
      <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: '34px 0' }}>
        Todavía no hay piezas cargadas para esta área en este proyecto.
      </div>
    )
  }

  return (
    <div>
      {enCurso.length > 0 && (
        <>
          <Titulo color={teal}>● EN CURSO · {enCurso.length}</Titulo>
          <div className="pz-grid">{enCurso.map(tarjeta)}</div>
        </>
      )}

      {sigue ? (
        <>
          <Titulo color={bl}>{enCurso.length > 0 ? 'LA QUE SIGUE' : 'AHORA'}</Titulo>
          <div style={{ border: `1.5px solid ${bl}66`, borderRadius: 18 }}>{tarjeta(sigue)}</div>
          {resto.length > 0 && (
            <button
              onClick={() => {
                setSaltadas((prev) => [...prev.filter((id) => id !== sigue.id), sigue.id])
                setElegida(null)
              }}
              style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 12.5, padding: '10px 2px', cursor: 'pointer' }}
            >
              ⏭ Dejar para después (falta material, máquina ocupada…)
            </button>
          )}
        </>
      ) : (
        enCurso.length === 0 && (
          <div
            style={{
              border: `1.5px solid ${green}66`,
              background: '#0a2e24',
              color: '#6ee7b7',
              borderRadius: 14,
              padding: '22px 16px',
              textAlign: 'center',
              fontWeight: 800,
              marginTop: 12,
            }}
          >
            ✓ Todas las piezas de esta área están completas
          </div>
        )
      )}

      {grupos.length > 0 && (
        <>
          <Titulo>PENDIENTES · {resto.length}</Titulo>
          <div style={{ display: 'grid', gap: 8 }}>
            {grupos.map((g) => {
              const abre = abierto(g.producto)
              return (
                <div key={g.producto} style={{ background: card, border: `1px solid ${line}`, borderRadius: 14, overflow: 'hidden' }}>
                  <button
                    onClick={() => setAbiertos((prev) => ({ ...prev, [g.producto]: !abre }))}
                    aria-expanded={abre}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: 'none',
                      border: 'none',
                      color: '#fff',
                      padding: '13px 15px',
                      minHeight: 52,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ color: '#64748b', width: 14 }}>{abre ? '▾' : '▸'}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.producto}
                    </span>
                    <span style={{ color: amber, fontSize: 13, fontWeight: 800 }}>{g.total}</span>
                  </button>

                  {abre &&
                    g.subs.map((s) => (
                      <div key={s.nombre || '—'} style={{ borderTop: `1px solid ${line}` }}>
                        {s.nombre && (
                          <div style={{ color: '#64748b', fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', padding: '10px 15px 4px' }}>
                            {s.nombre.replace(' — ', ' › ').toUpperCase()}
                          </div>
                        )}
                        {s.piezas.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              setElegida(p.id)
                              window.scrollTo({ top: 0, behavior: 'smooth' })
                            }}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              background: 'none',
                              border: 'none',
                              borderTop: `1px solid ${line}55`,
                              padding: '10px 15px',
                              minHeight: 50,
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: 'block', color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>{p.nombre}</span>
                              {p.medidas && <span style={{ display: 'block', color: '#7dd3fc', fontSize: 12, fontFamily: 'monospace' }}>{p.medidas}</span>}
                            </span>
                            {saltadas.includes(p.id) && <span style={{ color: '#64748b', fontSize: 11 }}>⏭</span>}
                            <span style={{ color: amber, fontSize: 14, fontWeight: 800 }}>{p.faltan}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                </div>
              )
            })}
          </div>
        </>
      )}

      {terminadas.length > 0 && (
        <div style={{ background: card, border: `1px solid ${line}`, borderRadius: 14, marginTop: 14, overflow: 'hidden' }}>
          <button
            onClick={() => setVerTerminadas((v) => !v)}
            aria-expanded={verTerminadas}
            style={{
              width: '100%',
              background: 'none',
              border: 'none',
              color: '#6ee7b7',
              padding: '13px 15px',
              minHeight: 50,
              textAlign: 'left',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '.08em',
              cursor: 'pointer',
            }}
          >
            {verTerminadas ? '▾' : '▸'} TERMINADAS · {terminadas.length}
          </button>
          {verTerminadas &&
            terminadas.map((p) => (
              <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', borderTop: `1px solid ${line}`, padding: '9px 15px' }}>
                <span style={{ color: green }}>✓</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', color: '#64748b', fontSize: 11 }}>{p.modulo}</span>
                  <span style={{ display: 'block', color: '#cbd5e1', fontSize: 13.5 }}>{p.nombre}</span>
                </span>
                <span style={{ color: '#64748b', fontSize: 12.5, fontFamily: 'monospace' }}>{p.meta}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

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

  // Al abrir el proyecto se reparten por área las piezas del despiece de sus planos (una vez)
  const [preparado, setPreparado] = useState(false)
  useEffect(() => {
    let vigente = true
    prepararProyecto(proyectoId).finally(() => {
      if (vigente) setPreparado(true)
    })
    return () => {
      vigente = false
    }
  }, [proyectoId])

  // carga inicial y actualizacion cada 15 s (asi ves lo que hacen otros operadores)
  useEffect(() => {
    if (!preparado) return
    void cargar(areaId)
    const intervalo = setInterval(() => void cargar(areaId), 15000)
    return () => clearInterval(intervalo)
  }, [cargar, areaId, preparado])

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

  // Detiene solo el reloj de esa pieza; el tiempo perdido se guarda al tocar Reanudar
  async function reportar(trabajoId: string, motivo: string, nota: string, foto: Blob | null) {
    let evidenciaUrl: string | undefined
    if (foto) {
      setOcupado(`reportar|${trabajoId}`)
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
    await ejecutar(
      `reportar|${trabajoId}`,
      () => reportarPieza(trabajoId, motivo, nota, evidenciaUrl),
      '⏸ Reloj detenido y se avisó al administrador. Toca Reanudar cuando se resuelva.'
    )
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
      <div className={`op-wrap ${fuenteOperador.className}`} style={{ maxWidth: 1500 }}>
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

        {vista.usaPdf ? (
          <PiezasPorPasos
            piezas={vista.piezas}
            ahora={ahora}
            ocupado={ocupado}
            onIniciar={iniciar}
            onFinalizar={finalizar}
            onReanudar={reanudar}
            onReportar={reportar}
          />
        ) : vista.piezas.length === 0 ? (
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
                onReportar={reportar}
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
    <div className={`op-wrap ${fuenteOperador.className}`} style={{ maxWidth: 1500 }}>
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
