'use client'

/**
 * BomEditable.tsx
 * ───────────────
 * Despiece de un plano (subensambles → piezas, y el herraje de armado) que se
 * puede corregir en pantalla: editar cada pieza, agregar o quitar piezas y
 * subensambles. No guarda nada: avisa cada cambio con onChange y la página
 * decide cuándo guardarlo.
 *
 * Contra el BOM original marca las piezas nuevas (borde verde) y las
 * modificadas (borde amarillo), con src/lib/comparar-bom.ts.
 *
 * RUTA: src/components/BomEditable.tsx
 */

import { useMemo, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { AreaBadge } from '@/components/AreaBadge'
import { medidas } from '@/components/DespieceView'
import { compararBOMs, normalizarNombre } from '@/lib/comparar-bom'
import { tipoMaterialDe } from '@/lib/ensamble-3d'
import { areaDePieza } from '@/lib/matriz-corte'
import { AREAS_PRODUCCION, type ComponenteBOM, type PlantillaBOM, type TipoMaterial } from '@/lib/types'

interface Props {
  bom: PlantillaBOM
  /** BOM sin ediciones, para marcar qué cambió (null = no marcar) */
  original: PlantillaBOM | null
  /** Productos a fabricar: para la columna Total */
  cantidad: number
  onChange: (bom: PlantillaBOM) => void
  disabled?: boolean
}

const CAMPO_BASE = 'min-w-0 rounded-lg border border-white/15 bg-black/30 px-2.5 py-2 text-sm text-white outline-none transition-colors focus:border-blue-500/60 max-sm:text-base'
const CAMPO = `w-full ${CAMPO_BASE}`
const ETIQUETA = 'mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40'
const BOTON_ICONO = 'inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:opacity-30'

/** Lo que no es acero se agrupa por su material en la Matriz de Corte */
const POR_MATERIAL: { valor: string; tipo: TipoMaterial }[] = [
  { valor: 'Vidrio', tipo: 'vidrio' },
  { valor: 'Melamina', tipo: 'melamina' },
  { valor: 'Aluminio', tipo: 'aluminio' },
  { valor: 'Hule', tipo: 'hule' },
]
const valorArea = (c: ComponenteBOM) => areaDePieza(tipoMaterialDe(c), c.area)
function conArea(c: ComponenteBOM, valor: string): ComponenteBOM {
  const material = POR_MATERIAL.find(m => m.valor === valor)
  if (material) return { ...c, area: 'Empaque', tipo_material: material.tipo }
  return { ...c, area: valor as ComponenteBOM['area'], tipo_material: 'metal' }
}

const numeroONulo = (t: string) => (t.trim() === '' ? null : Number(t))
const piezaVacia = (): ComponenteBOM => ({ descripcion: '', material: '', cantidad: 1, largo_mm: null, ancho: '', notas: '', pagina: null, area: 'Sin área' })
const copiar = (bom: PlantillaBOM): PlantillaBOM => structuredClone(bom)
const llave = (sub: string, pieza: string) => `${normalizarNombre(sub)}|${normalizarNombre(pieza)}`

export function BomEditable({ bom, original, cantidad, onChange, disabled }: Props) {
  // Pieza abierta para editar y su borrador; "nueva" = se acaba de agregar (Cancelar la quita)
  const [editando, setEditando] = useState<{ si: number; ci: number; nueva: boolean } | null>(null)
  const [borrador, setBorrador] = useState<ComponenteBOM | null>(null)
  const [subNuevo, setSubNuevo] = useState<string | null>(null)
  const [renombrando, setRenombrando] = useState<{ si: number; nombre: string } | null>(null)

  const marcas = useMemo(() => {
    const agregadas = new Set<string>()
    const modificadas = new Set<string>()
    if (original) {
      for (const d of compararBOMs(original, bom)) {
        if (d.tipo === 'agregado') agregadas.add(llave(d.subensamble, d.componente))
        if (d.tipo === 'modificado' && d.componente) modificadas.add(llave(d.subensamble, d.componente))
      }
    }
    return { agregadas, modificadas }
  }, [bom, original])

  const cambiar = (fn: (b: PlantillaBOM) => void) => {
    const nuevo = copiar(bom)
    fn(nuevo)
    onChange(nuevo)
  }

  const abrir = (si: number, ci: number, nueva = false, pieza?: ComponenteBOM) => {
    setEditando({ si, ci, nueva })
    setBorrador({ ...(pieza ?? bom.subensambles[si].componentes[ci]) })
  }
  const cerrar = () => { setEditando(null); setBorrador(null) }

  const guardarPieza = () => {
    if (!editando || !borrador) return
    if (!borrador.descripcion.trim()) return
    // Lo que una persona revisó ya no necesita la marca de "Revisar"
    const final = { ...borrador, descripcion: borrador.descripcion.trim(), verificada: true }
    cambiar(b => {
      const lista = b.subensambles[editando.si].componentes
      if (editando.nueva) lista.push(final)
      else lista[editando.ci] = final
    })
    cerrar()
  }

  const eliminarPieza = (si: number, ci: number) => {
    const sub = bom.subensambles[si]
    const pieza = sub.componentes[ci]
    if (!window.confirm(`¿Eliminar ${pieza.descripcion || 'esta pieza'} del subensamble ${sub.nombre}?`)) return
    cambiar(b => { b.subensambles[si].componentes.splice(ci, 1) })
    cerrar()
  }

  const eliminarSub = (si: number) => {
    const sub = bom.subensambles[si]
    const dentro = bom.subensambles.filter(s => normalizarNombre(s.dentro_de) === normalizarNombre(sub.nombre)).length
    const aviso = [
      sub.componentes.length ? `sus ${sub.componentes.length} pieza(s)` : '',
      dentro ? `y deja sueltos ${dentro} subensamble(s) que van dentro de él` : '',
    ].filter(Boolean).join(' ')
    if (sub.componentes.length || dentro) {
      if (!window.confirm(`¿Eliminar el subensamble ${sub.nombre}? Se borran ${aviso}.`)) return
    }
    cambiar(b => {
      b.subensambles.splice(si, 1)
      for (const s of b.subensambles) if (normalizarNombre(s.dentro_de) === normalizarNombre(sub.nombre)) s.dentro_de = ''
    })
    cerrar()
  }

  const agregarSub = () => {
    const nombre = subNuevo?.trim().toUpperCase()
    if (!nombre) return
    if (bom.subensambles.some(s => normalizarNombre(s.nombre) === normalizarNombre(nombre))) { window.alert(`Ya existe un subensamble llamado ${nombre}.`); return }
    cambiar(b => { b.subensambles.push({ nombre, cantidad: 1, pagina: null, dentro_de: '', componentes: [] }) })
    setSubNuevo(null)
  }

  const renombrar = () => {
    if (!renombrando) return
    const nombre = renombrando.nombre.trim().toUpperCase()
    const anterior = bom.subensambles[renombrando.si].nombre
    if (!nombre || nombre === anterior) { setRenombrando(null); return }
    cambiar(b => {
      b.subensambles[renombrando.si].nombre = nombre
      // Los que van dentro de él siguen apuntándole
      for (const s of b.subensambles) if (s.dentro_de && normalizarNombre(s.dentro_de) === normalizarNombre(anterior)) s.dentro_de = nombre
    })
    setRenombrando(null)
  }

  const total = Math.max(1, Math.round(cantidad || 1))

  return (
    <div className="space-y-4">
      {bom.subensambles.map((sub, si) => (
        <section key={si} className="overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.02]">
          {/* Encabezado del subensamble */}
          <div className="flex flex-wrap items-center gap-2 bg-white/[0.07] px-3 py-2.5 sm:px-4">
            {renombrando?.si === si ? (
              <form onSubmit={e => { e.preventDefault(); renombrar() }} className="flex min-w-0 flex-1 items-center gap-2">
                <input autoFocus className={`${CAMPO} py-1.5 font-semibold uppercase`} value={renombrando.nombre} onChange={e => setRenombrando({ si, nombre: e.target.value })} aria-label="Nombre del subensamble" />
                <button type="submit" aria-label="Aceptar nombre" className={`${BOTON_ICONO} bg-emerald-600 text-white hover:bg-emerald-500`}><Check className="h-4 w-4" /></button>
                <button type="button" onClick={() => setRenombrando(null)} aria-label="Cancelar" className={`${BOTON_ICONO} text-white/60 hover:bg-white/10`}><X className="h-4 w-4" /></button>
              </form>
            ) : (
              <button type="button" disabled={disabled} onClick={() => setRenombrando({ si, nombre: sub.nombre })} className="group flex min-w-0 flex-1 items-center gap-2 text-left" title="Cambiar el nombre">
                <span className="truncate text-sm font-bold text-white">
                  {sub.dentro_de && <span className="font-normal text-white/40">{sub.dentro_de} — </span>}
                  {sub.nombre}
                </span>
                <Pencil className="h-3.5 w-3.5 flex-shrink-0 text-white/30 group-hover:text-white/70" />
              </button>
            )}
            <label className="flex items-center gap-1.5 text-[11px] text-white/50" title="Cuántos de este subensamble lleva un producto">
              ×<span className="max-sm:hidden"> por producto</span>
              <input
                type="number" min={1} inputMode="numeric" disabled={disabled}
                className={`${CAMPO_BASE} w-16 py-1.5 text-center`}
                value={sub.cantidad}
                onChange={e => cambiar(b => { b.subensambles[si].cantidad = Math.max(0, Math.round(Number(e.target.value) || 0)) })}
              />
            </label>
            <button type="button" disabled={disabled} onClick={() => eliminarSub(si)} aria-label={`Eliminar el subensamble ${sub.nombre}`} title="Eliminar subensamble" className={`${BOTON_ICONO} text-red-300/70 hover:bg-red-500/15 hover:text-red-300`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {/* Piezas */}
          <ul className="divide-y divide-white/[0.06]">
            {sub.componentes.map((c, ci) => {
              const abierta = editando?.si === si && editando.ci === ci && !editando.nueva
              const k = llave(sub.nombre, c.descripcion)
              const marca = marcas.agregadas.has(k) ? 'border-l-emerald-400' : marcas.modificadas.has(k) ? 'border-l-amber-400' : 'border-l-transparent'
              return (
                <li key={ci} className={`border-l-2 ${marca}`}>
                  {abierta && borrador ? (
                    <FormPieza pieza={borrador} onCambio={setBorrador} onGuardar={guardarPieza} onCancelar={cerrar} onEliminar={() => eliminarPieza(si, ci)} />
                  ) : (
                    <div className="group flex items-start gap-3 px-3 py-3 sm:px-4">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-semibold leading-snug text-white">
                          {c.descripcion}
                          {c.verificada === false && <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">Revisar</span>}
                        </p>
                        <p className="text-xs text-white/55">{c.material || 'Sin material'}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/50">
                          <AreaBadge area={valorArea(c)} />
                          <span className="font-mono">{medidas(c.largo_mm, c.ancho) || 'sin medidas'}</span>
                          {c.notas && <span className="truncate">{c.notas}</span>}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="font-mono text-sm font-bold text-white">×{c.cantidad}</p>
                        <p className="text-[10px] text-white/40" title="Piezas a fabricar en total">{(c.cantidad || 0) * (sub.cantidad || 0) * total} total</p>
                      </div>
                      <div className="flex flex-shrink-0 gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                        <button type="button" disabled={disabled} onClick={() => abrir(si, ci)} aria-label={`Editar ${c.descripcion}`} className={`${BOTON_ICONO} text-amber-300 hover:bg-amber-500/15`}><Pencil className="h-4 w-4" /></button>
                        <button type="button" disabled={disabled} onClick={() => eliminarPieza(si, ci)} aria-label={`Eliminar ${c.descripcion}`} className={`${BOTON_ICONO} text-red-300 hover:bg-red-500/15`}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
            {editando?.si === si && editando.nueva && borrador && (
              <li className="border-l-2 border-l-emerald-400">
                <FormPieza pieza={borrador} nueva onCambio={setBorrador} onGuardar={guardarPieza} onCancelar={cerrar} />
              </li>
            )}
          </ul>
          {!(editando?.si === si && editando.nueva) && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => abrir(si, sub.componentes.length, true, piezaVacia())}
              className="flex min-h-[44px] w-full items-center justify-center gap-1.5 border-t border-white/[0.06] text-xs font-semibold text-blue-300 hover:bg-blue-500/10 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar pieza
            </button>
          )}
        </section>
      ))}

      {/* Nuevo subensamble */}
      {subNuevo !== null ? (
        <form onSubmit={e => { e.preventDefault(); agregarSub() }} className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-blue-400/40 p-3">
          <input autoFocus placeholder="Nombre del subensamble (ej. MODULO C)" className={`${CAMPO} min-w-[200px] flex-1 uppercase`} value={subNuevo} onChange={e => setSubNuevo(e.target.value)} />
          <button type="submit" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-500"><Plus className="h-4 w-4" /> Agregar</button>
          <button type="button" onClick={() => setSubNuevo(null)} className="min-h-[40px] rounded-lg px-3 text-xs font-semibold text-white/60 hover:bg-white/10">Cancelar</button>
        </form>
      ) : (
        <button type="button" disabled={disabled} onClick={() => setSubNuevo('')} className="flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/15 text-sm font-semibold text-white/60 hover:border-blue-400/40 hover:text-blue-300 disabled:opacity-40">
          <Plus className="h-4 w-4" /> Agregar subensamble
        </button>
      )}

      {/* Herraje de armado */}
      <section className="overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.02]">
        <div className="bg-white/[0.07] px-3 py-2.5 sm:px-4">
          <p className="text-sm font-bold text-white">HERRAJE DE ARMADO</p>
          <p className="text-[11px] text-white/45">Lo que se compra hecho. Cantidad por producto.</p>
        </div>
        <ul className="divide-y divide-white/[0.06]">
          {bom.herrajes.map((h, hi) => (
            <li key={hi} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_9rem_5rem_auto] sm:px-4">
              <input disabled={disabled} aria-label="Herraje" className={CAMPO} value={h.descripcion} onChange={e => cambiar(b => { b.herrajes[hi].descripcion = e.target.value })} />
              <input disabled={disabled} aria-label="SKU" placeholder="SKU" className={`${CAMPO} max-sm:hidden`} value={h.sku} onChange={e => cambiar(b => { b.herrajes[hi].sku = e.target.value })} />
              <input disabled={disabled} aria-label="Cantidad" type="number" min={0} inputMode="numeric" className={`${CAMPO_BASE} w-20 text-center sm:w-full`} value={h.cantidad} onChange={e => cambiar(b => { b.herrajes[hi].cantidad = Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
              <button type="button" disabled={disabled} onClick={() => { if (window.confirm(`¿Quitar ${h.descripcion || 'este herraje'}?`)) cambiar(b => { b.herrajes.splice(hi, 1) }) }} aria-label={`Quitar ${h.descripcion}`} className={`${BOTON_ICONO} text-red-300 hover:bg-red-500/15`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" disabled={disabled} onClick={() => cambiar(b => { b.herrajes.push({ descripcion: '', sku: '', cantidad: 1 }) })} className="flex min-h-[44px] w-full items-center justify-center gap-1.5 border-t border-white/[0.06] text-xs font-semibold text-blue-300 hover:bg-blue-500/10 disabled:opacity-40">
          <Plus className="h-3.5 w-3.5" /> Agregar herraje
        </button>
      </section>
    </div>
  )
}

/** Formulario de una pieza (editar o agregar) */
function FormPieza({ pieza, nueva, onCambio, onGuardar, onCancelar, onEliminar }: {
  pieza: ComponenteBOM
  nueva?: boolean
  onCambio: (c: ComponenteBOM) => void
  onGuardar: () => void
  onCancelar: () => void
  onEliminar?: () => void
}) {
  const set = (cambios: Partial<ComponenteBOM>) => onCambio({ ...pieza, ...cambios })
  return (
    <form
      onSubmit={e => { e.preventDefault(); onGuardar() }}
      onKeyDown={e => { if (e.key === 'Escape') onCancelar() }}
      className="space-y-3 bg-blue-500/[0.05] px-3 py-4 sm:px-4"
    >
      <p className="text-xs font-bold text-blue-300">{nueva ? 'Nueva pieza' : 'Editar pieza'}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <label className="col-span-2 sm:col-span-3">
          <span className={ETIQUETA}>Descripción *</span>
          <input required autoFocus className={CAMPO} value={pieza.descripcion} onChange={e => set({ descripcion: e.target.value })} />
        </label>
        <label className="col-span-2 sm:col-span-3">
          <span className={ETIQUETA}>Material</span>
          <input className={CAMPO} value={pieza.material} onChange={e => set({ material: e.target.value })} placeholder='Ej. LAMINA CRS C.20' />
        </label>
        <label>
          <span className={ETIQUETA}>Cantidad</span>
          <input type="number" min={0} inputMode="numeric" className={CAMPO} value={pieza.cantidad} onChange={e => set({ cantidad: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
        </label>
        <label>
          <span className={ETIQUETA}>Largo mm</span>
          <input type="number" min={0} step="any" inputMode="decimal" className={CAMPO} value={pieza.largo_mm ?? ''} onChange={e => set({ largo_mm: numeroONulo(e.target.value) })} />
        </label>
        <label>
          <span className={ETIQUETA}>Ancho / perfil</span>
          <input className={CAMPO} value={pieza.ancho} onChange={e => set({ ancho: e.target.value })} />
        </label>
        <label className="col-span-2 sm:col-span-3">
          <span className={ETIQUETA}>Área de producción</span>
          <select className={CAMPO} value={valorArea(pieza)} onChange={e => onCambio(conArea(pieza, e.target.value))}>
            <optgroup label="Estaciones de la planta" className="bg-[#0b0f17]">
              {[...AREAS_PRODUCCION, 'Sin área'].map(a => <option key={a} value={a} className="bg-[#0b0f17]">{a}</option>)}
            </optgroup>
            <optgroup label="Se surte por material" className="bg-[#0b0f17]">
              {POR_MATERIAL.map(m => <option key={m.valor} value={m.valor} className="bg-[#0b0f17]">{m.valor}</option>)}
            </optgroup>
          </select>
        </label>
        <label className="col-span-2 sm:col-span-6">
          <span className={ETIQUETA}>Notas de corte</span>
          <input className={CAMPO} value={pieza.notas} onChange={e => set({ notas: e.target.value })} placeholder="Ej. CORTE LASER, 4 DOBLECES" />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onEliminar && (
          <button type="button" onClick={onEliminar} className="mr-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-red-300 hover:bg-red-500/15">
            <Trash2 className="h-3.5 w-3.5" /> Eliminar
          </button>
        )}
        <button type="button" onClick={onCancelar} className="min-h-[40px] rounded-lg px-4 text-xs font-semibold text-white/60 hover:bg-white/10 hover:text-white">Cancelar</button>
        <button type="submit" disabled={!pieza.descripcion.trim()} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-40">
          <Check className="h-4 w-4" /> {nueva ? 'Agregar' : 'Aceptar'}
        </button>
      </div>
    </form>
  )
}
