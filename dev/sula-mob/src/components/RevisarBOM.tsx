'use client'

/**
 * RevisarBOM.tsx
 * ──────────────
 * Corrección a mano del despiece de un plano, antes de cortar. Muestra primero
 * las piezas que la revisión automática (src/lib/validar-bom.ts) marcó como
 * sospechosas; cada cambio se valida al momento. Al guardar, la plantilla queda
 * corregida para este y para cualquier pedido futuro con la misma clave, y las
 * piezas que se tocaron dejan de pedir "Revisar".
 *
 * RUTA: src/components/RevisarBOM.tsx
 */

import { useMemo, useState } from 'react'
import { AlertOctagon, AlertTriangle, Check, Loader2, Save, X } from 'lucide-react'
import { validarBOM, type Hallazgo } from '@/lib/validar-bom'
import { AREAS_PRODUCCION, type ComponenteBOM, type PlantillaBOM } from '@/lib/types'

interface Props {
  clave: string
  bom: PlantillaBOM
  onGuardado: (bom: PlantillaBOM) => void
  onCerrar: () => void
}

const CAMPO = 'w-full min-w-0 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-sm text-white outline-none transition-colors focus:border-blue-500/60'
const ETIQUETA = 'block text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1'

const copiar = (bom: PlantillaBOM): PlantillaBOM => structuredClone(bom)
const llave = (si: number, ci: number) => `${si}-${ci}`

/** "12.5" → 12.5 · "" → null */
const numeroONulo = (texto: string) => (texto.trim() === '' ? null : Number(texto))

function Mensajes({ lista }: { lista: Hallazgo[] }) {
  if (!lista.length) return null
  return (
    <ul className="space-y-1">
      {lista.map((h, i) => (
        <li key={i} className={`flex items-start gap-1.5 text-xs ${h.gravedad === 'error' ? 'text-red-300' : 'text-amber-200'}`}>
          {h.gravedad === 'error' ? <AlertOctagon className="mt-px h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />}
          {h.mensaje}
        </li>
      ))}
    </ul>
  )
}

export function RevisarBOM({ clave, bom, onGuardado, onCerrar }: Props) {
  const [borrador, setBorrador] = useState(() => copiar(bom))
  const [editadas, setEditadas] = useState<Set<string>>(() => new Set())
  const [soloObservaciones, setSoloObservaciones] = useState(() => validarBOM(bom).some(h => h.comp !== null))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const hallazgos = useMemo(() => validarBOM(borrador), [borrador])
  const dePieza = (si: number, ci: number) => hallazgos.filter(h => h.sub === si && h.comp === ci)
  const generales = hallazgos.filter(h => h.comp === null)
  const errores = hallazgos.filter(h => h.gravedad === 'error').length
  // Las piezas con observaciones se fijan al abrir, para que no desaparezcan de la lista mientras se corrigen
  const [conObservaciones] = useState(() => new Set(validarBOM(bom).filter(h => h.comp !== null).map(h => llave(h.sub!, h.comp!))))

  const cambiarPieza = (si: number, ci: number, cambios: Partial<ComponenteBOM>) => {
    setBorrador(b => {
      const nuevo = copiar(b)
      Object.assign(nuevo.subensambles[si].componentes[ci], cambios)
      return nuevo
    })
    setEditadas(e => new Set(e).add(llave(si, ci)))
  }
  const cambiarGeneral = (cambios: Partial<PlantillaBOM>) => setBorrador(b => ({ ...copiar(b), ...cambios }))
  const cambiarCantidadSub = (si: number, cantidad: number) =>
    setBorrador(b => {
      const nuevo = copiar(b)
      nuevo.subensambles[si].cantidad = cantidad
      return nuevo
    })

  const guardar = async () => {
    setGuardando(true)
    setError('')
    // Lo que una persona revisó ya no necesita la marca de "Revisar"
    const final = copiar(borrador)
    for (const k of editadas) {
      const [si, ci] = k.split('-').map(Number)
      final.subensambles[si].componentes[ci].verificada = true
    }
    try {
      const res = await fetch('/api/plantilla-despiece', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave, bom: final }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Error ${res.status}`)
      onGuardado(final)
    } catch (err) {
      setError('No se pudo guardar: ' + (err instanceof Error ? err.message : 'error desconocido'))
      setGuardando(false)
    }
  }

  const subensambles = borrador.subensambles
    .map((sub, si) => ({
      sub, si,
      piezas: sub.componentes.map((c, ci) => ({ c, ci })).filter(({ ci }) => !soloObservaciones || conObservaciones.has(llave(si, ci))),
    }))
    .filter(g => g.piezas.length || !soloObservaciones)

  const boton = (activo: boolean) =>
    `px-3 py-2 min-h-[40px] rounded-lg text-xs font-semibold transition-colors ${activo ? 'bg-blue-600 text-white' : 'bg-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.1]'}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Corregir despiece</p>
          <p className="text-xs text-white/50">
            {hallazgos.length
              ? `${errores} error(es) y ${hallazgos.length - errores} aviso(s) de la revisión automática.`
              : 'La revisión automática no encontró nada raro.'}{' '}
            Lo que guardes se usa en este y en los próximos pedidos con la clave {clave}.
          </p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Qué piezas mostrar">
          <button type="button" onClick={() => setSoloObservaciones(true)} aria-pressed={soloObservaciones} className={boton(soloObservaciones)}>Con observaciones ({conObservaciones.size})</button>
          <button type="button" onClick={() => setSoloObservaciones(false)} aria-pressed={!soloObservaciones} className={boton(!soloObservaciones)}>Todas</button>
        </div>
      </div>

      {/* Datos generales del producto */}
      <section className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
        <p className="text-xs font-semibold text-white/70">Medidas generales del mueble (mm)</p>
        <div className="grid grid-cols-3 gap-2">
          {([['ancho_mm', 'Ancho'], ['alto_mm', 'Alto'], ['profundidad_mm', 'Fondo']] as const).map(([campo, texto]) => (
            <label key={campo}>
              <span className={ETIQUETA}>{texto}</span>
              <input type="number" inputMode="decimal" min={0} className={CAMPO} value={borrador[campo] ?? ''} onChange={e => cambiarGeneral({ [campo]: numeroONulo(e.target.value) })} />
            </label>
          ))}
        </div>
        <Mensajes lista={generales} />
      </section>

      {subensambles.length === 0 && (
        <p className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] p-4 text-sm text-emerald-200">
          Ninguna pieza tiene observaciones. Cambia a &quot;Todas&quot; si quieres corregir otra.
        </p>
      )}

      {subensambles.map(({ sub, si, piezas }) => (
        <section key={si} className="rounded-xl border border-white/[0.08] overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 bg-white/[0.07] px-4 py-2.5">
            <span className="flex-1 min-w-0 truncate text-sm font-semibold text-white">{sub.nombre}</span>
            <label className="flex items-center gap-2 text-[11px] text-white/50">
              Por producto
              <input type="number" min={1} className={`${CAMPO} w-20 py-1.5`} value={sub.cantidad} onChange={e => cambiarCantidadSub(si, Number(e.target.value) || 0)} />
            </label>
          </div>
          {hallazgos.some(h => h.sub === si && h.comp === null) && (
            <div className="px-4 pt-3"><Mensajes lista={hallazgos.filter(h => h.sub === si && h.comp === null)} /></div>
          )}

          <ul className="divide-y divide-white/[0.06]">
            {piezas.map(({ c, ci }) => {
              const lista = dePieza(si, ci)
              const editada = editadas.has(llave(si, ci))
              return (
                <li key={ci} className={`space-y-3 px-4 py-4 ${lista.some(h => h.gravedad === 'error') ? 'bg-red-500/[0.05]' : lista.length ? 'bg-amber-500/[0.04]' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">
                      {c.descripcion || 'Pieza sin nombre'}
                      {c.pagina !== null && <span className="ml-2 text-[11px] font-normal text-white/35">hoja {c.pagina}</span>}
                    </p>
                    {editada ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300"><Check className="h-3.5 w-3.5" /> Revisada</span>
                    ) : c.verificada === false ? (
                      <button type="button" onClick={() => cambiarPieza(si, ci, {})} className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/10">
                        <Check className="h-3.5 w-3.5" /> La medida es correcta
                      </button>
                    ) : null}
                  </div>
                  <Mensajes lista={lista} />

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                    <label className="col-span-2 sm:col-span-3">
                      <span className={ETIQUETA}>Descripción</span>
                      <input className={CAMPO} value={c.descripcion} onChange={e => cambiarPieza(si, ci, { descripcion: e.target.value })} />
                    </label>
                    <label className="col-span-2 sm:col-span-3">
                      <span className={ETIQUETA}>Material</span>
                      <input className={CAMPO} value={c.material} onChange={e => cambiarPieza(si, ci, { material: e.target.value })} />
                    </label>
                    <label>
                      <span className={ETIQUETA}>Cantidad</span>
                      <input type="number" min={0} className={CAMPO} value={c.cantidad} onChange={e => cambiarPieza(si, ci, { cantidad: Number(e.target.value) || 0 })} />
                    </label>
                    <label>
                      <span className={ETIQUETA}>Largo mm</span>
                      <input type="number" inputMode="decimal" min={0} className={CAMPO} value={c.largo_mm ?? ''} onChange={e => cambiarPieza(si, ci, { largo_mm: numeroONulo(e.target.value) })} />
                    </label>
                    <label>
                      <span className={ETIQUETA}>Ancho / perfil</span>
                      <input className={CAMPO} value={c.ancho} onChange={e => cambiarPieza(si, ci, { ancho: e.target.value })} />
                    </label>
                    <label className="col-span-2 sm:col-span-3">
                      <span className={ETIQUETA}>Área</span>
                      <select className={CAMPO} value={c.area} onChange={e => cambiarPieza(si, ci, { area: e.target.value as ComponenteBOM['area'] })}>
                        {[...AREAS_PRODUCCION, 'Sin área' as const].map(a => <option key={a} value={a} className="bg-[#0b0f17]">{a}</option>)}
                      </select>
                    </label>
                    <label className="col-span-2 sm:col-span-6">
                      <span className={ETIQUETA}>Notas de corte</span>
                      <input className={CAMPO} value={c.notas} onChange={e => cambiarPieza(si, ci, { notas: e.target.value })} />
                    </label>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {error && <p className="text-xs font-semibold text-red-200 bg-red-500/10 border border-red-400/25 rounded-lg px-3 py-2">{error}</p>}

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-end gap-2 bg-[#0b0f17]/95 px-1 py-3">
        <span className="mr-auto text-xs text-white/45">{editadas.size} pieza(s) revisadas</span>
        <button type="button" onClick={onCerrar} disabled={guardando} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white/[0.08] px-4 py-2.5 text-xs font-bold text-white/80 hover:bg-white/[0.12] disabled:opacity-40">
          <X className="h-4 w-4" /> Cancelar
        </button>
        <button type="button" onClick={guardar} disabled={guardando} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-40">
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar correcciones
        </button>
      </div>
    </div>
  )
}
