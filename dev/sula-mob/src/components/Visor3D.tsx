'use client'

/**
 * Visor3D.tsx
 * ───────────
 * Vista 3D del producto ARMADO (Three.js con React Three Fiber).
 *
 * Las posiciones las calcula src/lib/ensamble-3d.ts a partir de la
 * "colocación" de cada pieza (dónde va, en palabras) y de sus medidas.
 * Es un armado aproximado para identificar piezas, no un modelo CAD.
 *
 * Tres modos:
 *   - Exterior:  todo opaco, como el producto terminado
 *   - Interior:  paneles exteriores transparentes para ver la estructura
 *   - Explosión: cada capa separada (exterior, interior, base, accesorios)
 *
 * Clic en una pieza = se pone amarilla y las demás se atenúan.
 * Vistas fijas (frente, lado, arriba, 3D) y captura del visor en PNG.
 * Arrastrar = rotar · rueda o pellizco = zoom · clic derecho = mover.
 *
 * RUTA: src/components/Visor3D.tsx
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Camera, RotateCcw } from 'lucide-react'
import { areaDePieza } from '@/lib/matriz-corte'
import { medidas } from './DespieceView'
import { Pieza3D, type AparienciaPieza } from './Pieza3D'
import { ensamblar, type PiezaArmada } from '@/lib/ensamble-3d'
import type { PlantillaBOM } from '@/lib/types'

type ModoVista = 'exterior' | 'interior' | 'explosion'
type VistaFija = 'frente' | 'lado' | 'arriba' | 'iso'
/** Plano: gris de dibujo técnico · Acabado: colores reales del plano · Área: color de cada área de producción */
type ColorPor = 'plano' | 'acabado' | 'area'

const MM = 0.001
const AMARILLO = '#FFD700'

/** Color de cada área en el 3D (tonos vivos para distinguirlos sobre el fondo) */
const COLOR_3D: Record<string, string> = {
  'Corte de tubo': '#3b82f6', 'Corte de Laser': '#ef4444', 'Corte de Lamina': '#f97316', 'Doblez': '#10b981',
  'Troquel': '#a855f7', 'Punteado': '#eab308', 'Soldadura Y Pulido': '#f43f5e', 'Pintura': '#ec4899', 'Empaque': '#06b6d4',
  'Vidrio': '#7dd3fc', 'Melamina': '#a8896b', 'Aluminio': '#e2e8f0', 'Hule': '#6b7280',
}
const areaDe = (p: PiezaArmada) => areaDePieza(p.tipoMaterial, p.area)
const colorDeArea = (area: string) => COLOR_3D[area] ?? '#9ca3af'

/**
 * Explosión: cada pieza se aleja del centro del producto en proporción a su
 * distancia, así el mueble se "abre" y se ve pieza por pieza. `separacion`
 * va de 0 (armado) a 1.5.
 */
function explotar(p: PiezaArmada, dims: { alto: number }, separacion: number): [number, number, number] {
  const empuje = { exterior: 140, estructura: 0, interior: 40, base: 0, accesorio: 90 }[p.capa] * separacion
  const haciaAfuera = Math.sign(p.pos[2]) || 1
  return [
    p.pos[0] * separacion,
    (p.pos[1] - dims.alto * 0.15) * separacion * 0.9,
    p.pos[2] * separacion * 1.2 + haciaAfuera * empuje,
  ]
}

/** ¿La pieza tapa la vista del interior? Paneles, vidrios, cubiertas y forros grandes */
function tapa(p: PiezaArmada, dims: { ancho: number; alto: number; fondo: number }): boolean {
  if (p.capa === 'exterior' || p.tipoMaterial === 'vidrio') return true
  if (/^tubo|cremallera/.test(p.geometria)) return false
  const [a, b] = [...p.size].sort((x, y) => y - x)
  const menor = Math.min(dims.ancho, dims.alto, dims.fondo)
  return a > menor * 0.6 && b > menor * 0.45
}

/** Color de una pintura o de un tablero, leído de su descripción en el plano */
const COLORES: [RegExp, string][] = [
  // Colores base
  [/negr/i, '#2b2c31'], [/blanc/i, '#e6e6e3'], [/gris|plata|silver/i, '#9a9ea8'], [/roj/i, '#b3312c'],
  [/azul/i, '#2f5fa8'], [/verde/i, '#2f7d52'], [/amarill/i, '#d4b02a'], [/naranja/i, '#d0702a'],
  // Maderas y tableros
  [/cafe|café|chocolate|nogal|wengu/i, '#5a3d2b'], [/maple|encino|roble|haya|natural/i, '#c2a171'],
  [/cerezo|cherry/i, '#8b4226'], [/\bpino\b/i, '#d4b87a'], [/cenizo|ceniza|\bash\b/i, '#b5a998'], [/caoba|mahogan/i, '#6e3630'],
  // Metales y acabados industriales
  [/galvan|zinc|cromo|inox/i, '#b9bec8'], [/alumin/i, '#c5c9d0'],
  [/dorado|\boro\b|gold|bronce|lat[oó]n/i, '#b8860b'], [/cobre|copper/i, '#b87333'], [/[oó]xido|rust|corten/i, '#8b4513'],
  // Pinturas especiales
  [/beige|arena|crema|cream/i, '#d4c5a9'], [/vino|borgoña|guinda|tinto/i, '#722f37'], [/oliv/i, '#556b2f'],
  [/humo|smoke|grafito/i, '#696969'], [/terracota|salm[oó]n/i, '#cc6644'], [/marfil|ivory|perla|pearl/i, '#f0ece0'],
  [/turquesa|teal|aqua/i, '#2a8a8a'], [/rosa|pink/i, '#c96b8b'], [/morado|p[uú]rpura|violeta/i, '#6a3d7d'],
]
const colorDe = (texto: string) => COLORES.find(([re]) => re.test(texto))?.[1]

interface Superficie { color: string; metalness: number; roughness: number; opacity: number }

/**
 * Cómo se ve una pieza terminada: manda el ACABADO que marca el plano para
 * esa pieza; lo que va al natural (vidrio, melamina, hule, aluminio) se
 * dibuja según su material.
 */
function superficie(p: PiezaArmada, acabadoGeneral: string): Superficie {
  switch (p.tipoMaterial) {
    case 'vidrio': return { color: '#a9dcec', metalness: 0.1, roughness: 0.05, opacity: 0.28 }
    case 'melamina': return { color: colorDe(p.material) ?? '#c9c4b8', metalness: 0, roughness: 0.85, opacity: 1 }
    case 'madera': return { color: colorDe(p.acabado || p.material) ?? '#b08a5a', metalness: 0, roughness: 0.8, opacity: 1 }
    case 'hule': return { color: colorDe(p.material) ?? '#25262b', metalness: 0, roughness: 1, opacity: 1 }
    case 'aluminio': return { color: colorDe(p.acabado) ?? '#c9ccd2', metalness: 0.85, roughness: 0.25, opacity: 1 }
    case 'plastico': return { color: colorDe(p.acabado || p.material) ?? '#d8d8d8', metalness: 0, roughness: 0.6, opacity: 1 }
  }
  // Metal: pintado con su acabado, o con el general del plano; sin acabado, acero al natural
  // Sin acabado propio y de acero inoxidable, galvanizado o cromado: va al natural, no pintado
  if (!p.acabado && /inox|galvan|crom|satinad|zinc/i.test(p.material)) return { color: '#c3c7cf', metalness: 0.85, roughness: 0.3, opacity: 1 }
  const pintura = colorDe(p.acabado || acabadoGeneral)
  if (pintura) return { color: pintura, metalness: 0.15, roughness: /mate/i.test(p.acabado || acabadoGeneral) ? 0.85 : 0.5, opacity: 1 }
  // Sin acabado detectado: acero industrial; la estructura más oscura y brillante, los accesorios más claros
  const estructura = p.capa === 'estructura'
  return {
    color: estructura ? '#6b717e' : p.capa === 'accesorio' ? '#a0a5b0' : '#8a8f9c',
    metalness: estructura ? 0.6 : 0.4,
    roughness: estructura ? 0.35 : 0.55,
    opacity: 1,
  }
}

/** Luminosidad 0-1 de un color "#rrggbb" */
const luz = (hex: string) => (parseInt(hex.slice(1, 3), 16) * 0.299 + parseInt(hex.slice(3, 5), 16) * 0.587 + parseInt(hex.slice(5, 7), 16) * 0.114) / 255

function apariencia(p: PiezaArmada, modo: ModoVista, colorPor: ColorPor, acabado: string, seleccion: string | null, dims: { ancho: number; alto: number; fondo: number }): AparienciaPieza {
  if (seleccion === p.compKey) {
    return { color: AMARILLO, opacity: 1, metalness: 0.4, roughness: 0.4, emissive: AMARILLO, emissiveIntensity: 0.3, borde: '#fff7c2' }
  }

  // Plano técnico: todo en gris claro uniforme con aristas marcadas, como un dibujo
  if (colorPor === 'plano') {
    let opacity = 1
    if (modo === 'interior' && tapa(p, dims)) opacity = 0.07
    if (seleccion !== null) opacity = Math.min(opacity, 0.3)
    // Mate y difuso, como una maqueta, con las aristas bien marcadas
    return { color: '#b8bcc6', opacity, metalness: 0.15, roughness: 0.7, emissive: '#b8bcc6', emissiveIntensity: 0.04, borde: opacity < 0.5 ? '#8a93a3' : '#5a5f6e' }
  }

  let { color, metalness, roughness, opacity } = superficie(p, acabado)
  if (colorPor === 'area') {
    color = colorDeArea(areaDe(p))
    metalness = 0.2
    roughness = 0.6
    opacity = Math.max(opacity, 0.75)
  }

  // Interior: lo que tapa queda como un "fantasma" y la estructura se ve completa
  if (modo === 'interior' && tapa(p, dims)) opacity = 0.07
  // Con una pieza seleccionada, las demás se atenúan
  if (seleccion !== null) opacity = Math.min(opacity, 0.3)

  // Aristas claras en piezas oscuras (negro mate sobre fondo oscuro) y oscuras en las claras
  const borde = opacity < 0.5 ? '#8a93a3' : luz(color) < 0.35 ? '#5b606c' : '#14161b'
  return { color, opacity, metalness, roughness, emissive: color, emissiveIntensity: colorPor === 'area' ? 0.25 : 0.06, borde }
}

/* ═══════════════════════════════════════
   CÁMARA: enfoque suave a una pieza y regreso a la vista inicial
   ═══════════════════════════════════════ */

interface Vista { posicion: Vector3; objetivo: Vector3 }

function ControlCamara({ controles, enfoque, vistaEnfoque, reinicio, inicio }: {
  controles: React.RefObject<OrbitControlsImpl | null>
  enfoque: number            // sube cuando hay que acercarse a una pieza
  vistaEnfoque: Vista | null
  reinicio: number           // sube cuando hay que volver a la vista inicial
  inicio: Vista
}) {
  const { camera } = useThree()
  const animando = useRef<Vista | null>(null)

  // Cada cambio arranca una animación; si el usuario toca el visor, se cancela
  useEffect(() => {
    if (enfoque > 0 && vistaEnfoque) animando.current = vistaEnfoque
    // Solo debe correr cuando llega un enfoque nuevo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enfoque])
  useEffect(() => {
    if (reinicio > 0) animando.current = inicio
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reinicio])

  useFrame((_, delta) => {
    const c = controles.current
    const v = animando.current
    if (!c || !v) return
    const k = Math.min(1, delta * 6)
    camera.position.lerp(v.posicion, k)
    c.target.lerp(v.objetivo, k)
    c.update()
    if (camera.position.distanceTo(v.posicion) < 0.004) animando.current = null
  })

  return <OrbitControls ref={controles} makeDefault enableDamping dampingFactor={0.08} onStart={() => { animando.current = null }} />
}

/* ═══════════════════════════════════════
   VISOR
   ═══════════════════════════════════════ */

interface Props {
  bom: PlantillaBOM
  /** Pieza seleccionada: "subensamble-pieza", igual que en la lista */
  seleccion: string | null
  onSeleccion: (key: string | null) => void
  /** Cambia cuando la selección viene de la lista: la cámara se acerca a la pieza */
  enfoque: number
}

export default function Visor3D({ bom, seleccion, onSeleccion, enfoque }: Props) {
  const [modo, setModo] = useState<ModoVista>('exterior')
  const [colorPor, setColorPor] = useState<ColorPor>('acabado')
  const controles = useRef<OrbitControlsImpl>(null)

  const { piezas, dims, aproximado, exacto } = useMemo(() => ensamblar(bom), [bom])
  const mayor = Math.max(dims.ancho, dims.alto, dims.fondo) * MM

  // Vista inicial: en diagonal, mirando al centro del producto
  const inicio = useMemo<Vista>(() => {
    const objetivo = new Vector3(0, (dims.alto * MM) / 2, 0)
    const direccion = new Vector3(dims.ancho * 1.5, dims.alto * 0.45, Math.max(dims.fondo * 2.5, dims.ancho * 1.6)).normalize()
    return { objetivo, posicion: objetivo.clone().add(direccion.multiplyScalar(mayor * (dims.ancho > dims.alto * 1.8 ? 1.6 : 2.1))) }
  }, [dims, mayor])

  // Tabla ACABADOS del plano (o el acabado general si el BOM no trae la tabla)
  const acabados = bom.acabados?.length
    ? bom.acabados.map(a => [a.codigo, a.descripcion].filter(Boolean).join(' - '))
    : bom.acabado ? [bom.acabado] : []
  const acabadoGeneral = bom.acabado || acabados.join(' ')

  const [reinicio, setReinicio] = useState(0)
  const [separacion, setSeparacion] = useState(0.7)

  // En explosión el producto ocupa más espacio: la cámara se aleja
  const vistaModo = useMemo<Vista>(() => {
    if (modo !== 'explosion') return inicio
    const direccion = inicio.posicion.clone().sub(inicio.objetivo)
    return { objetivo: inicio.objetivo, posicion: inicio.objetivo.clone().add(direccion.multiplyScalar(1 + separacion * 0.75)) }
  }, [modo, inicio, separacion])
  // Vista fija elegida en la barra; null = la vista del modo actual
  const [vistaFija, setVistaFija] = useState<VistaFija | null>(null)
  const destino = useMemo<Vista>(() => {
    if (!vistaFija || vistaFija === 'iso') return vistaModo
    const distancia = vistaModo.posicion.distanceTo(vistaModo.objetivo)
    const direccion = { frente: new Vector3(0, 0, 1), lado: new Vector3(1, 0, 0), arriba: new Vector3(0, 1, 0.0001) }[vistaFija]
    return { objetivo: vistaModo.objetivo, posicion: vistaModo.objetivo.clone().add(direccion.multiplyScalar(distancia)) }
  }, [vistaFija, vistaModo])
  const irA = (v: VistaFija) => { setVistaFija(v); setReinicio(n => n + 1) }
  const cambiarModo = (m: ModoVista) => { setModo(m); setVistaFija(null); setReinicio(n => n + 1) }

  /** Descarga lo que muestra el visor como imagen PNG */
  const lienzo = useRef<HTMLCanvasElement>(null)
  const capturar = () => {
    const url = lienzo.current?.toDataURL('image/png')
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `${[bom.modelo || 'producto', 'vista-3d', new Date().toISOString().slice(0, 10)].join('_').replace(/[^\w.-]+/g, '_')}.png`
    a.click()
  }

  // Leyenda: qué significa cada color en el modo activo
  const leyenda = (() => {
    const grupos = new Map<string, { color: string; piezas: number }>()
    for (const p of piezas) {
      const etiqueta = colorPor === 'area'
        ? areaDe(p)
        : p.tipoMaterial === 'metal' ? p.acabado || acabadoGeneral || 'Acero sin acabado indicado' : p.material
      const color = colorPor === 'area' ? colorDeArea(areaDe(p)) : superficie(p, acabadoGeneral).color
      const g = grupos.get(etiqueta) ?? { color, piezas: 0 }
      g.piezas++
      grupos.set(etiqueta, g)
    }
    return [...grupos].sort((a, b) => b[1].piezas - a[1].piezas)
  })()
  const elegida = piezas.find(p => p.compKey === seleccion)

  // Vista para acercarse a la pieza seleccionada sin perder el contexto del producto
  const vistaEnfoque = useMemo<Vista | null>(() => {
    if (!elegida) return null
    const objetivo = new Vector3(elegida.pos[0] * MM, elegida.pos[1] * MM, elegida.pos[2] * MM)
    const direccion = inicio.posicion.clone().sub(inicio.objetivo).normalize()
    const distancia = Math.max(Math.max(...elegida.size) * MM * 2.2, mayor * 0.9)
    return { objetivo, posicion: objetivo.clone().add(direccion.multiplyScalar(distancia)) }
  }, [elegida, inicio, mayor])

  const boton = (activo: boolean) =>
    `px-3 py-2 min-h-[40px] rounded-lg text-xs font-semibold transition-colors ${activo ? 'bg-blue-600 text-white' : 'bg-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.1]'}`

  return (
    <div className="space-y-2">
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="grid w-full grid-cols-3 gap-1 sm:flex sm:w-auto" role="group" aria-label="Modo de vista">
          {([['exterior', 'Exterior'], ['interior', 'Interior'], ['explosion', 'Explosión']] as const).map(([id, texto]) => (
            <button key={id} type="button" onClick={() => cambiarModo(id)} aria-pressed={modo === id} className={boton(modo === id)}>{texto}</button>
          ))}
        </div>
        <div className="grid w-full grid-cols-3 gap-1 sm:ml-2 sm:flex sm:w-auto" role="group" aria-label="Color de las piezas">
          {([['plano', '📐', 'Plano'], ['acabado', '🎨', 'Acabado Final'], ['area', '📊', 'Por Área']] as const).map(([id, emoji, texto]) => (
            <button key={id} type="button" onClick={() => setColorPor(id)} aria-pressed={colorPor === id} className={boton(colorPor === id)}>
              <span className="mr-1" aria-hidden="true">{emoji}</span>{id === 'acabado' ? <><span className="sm:hidden">Acabado</span><span className="hidden sm:inline">{texto}</span></> : texto}
            </button>
          ))}
        </div>
        {modo === 'explosion' && (
          <label className="flex items-center gap-2 text-[11px] text-white/60">
            Separación
            <input
              type="range" min={0.2} max={1.5} step={0.05} value={separacion}
              onChange={e => setSeparacion(Number(e.target.value))}
              className="w-28 sm:w-36 accent-blue-500"
            />
          </label>
        )}
        <div className="flex gap-1 ml-auto">
          <button type="button" onClick={capturar} className={`${boton(false)} inline-flex items-center gap-1.5`} title="Descargar la vista como imagen PNG">
            <Camera className="w-3.5 h-3.5" /> Captura
          </button>
          <button
            type="button"
            onClick={() => { onSeleccion(null); setVistaFija(null); setReinicio(n => n + 1) }}
            className={`${boton(false)} inline-flex items-center gap-1.5`}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reiniciar
          </button>
        </div>
      </div>

      {/* Vistas fijas */}
      <div className="grid grid-cols-4 gap-1 sm:flex" role="group" aria-label="Vista de la cámara">
        {([['frente', 'Frente'], ['lado', 'Lado'], ['arriba', 'Arriba'], ['iso', '3D']] as const).map(([id, texto]) => (
          <button key={id} type="button" onClick={() => irA(id)} aria-pressed={vistaFija === id} className={boton(vistaFija === id)}>{texto}</button>
        ))}
      </div>

      {/* Qué se está viendo: en Acabado Final, el acabado del plano es lo que define el color */}
      <p className="text-[11px] text-white/55 leading-snug">
        {colorPor === 'plano' && <><span className="text-white/35">📐 Vista técnica:</span> estructura sin color, todas las piezas en gris uniforme</>}
        {colorPor === 'acabado' && (
          <>
            <span className="text-white/35">🎨 Acabado final:</span>{' '}
            {acabados.length
              ? <>colores según el plano del producto: {acabados.join(' · ')}</>
              : <span className="text-amber-300/80">no se encontró acabado; vuelve a analizar el plano o captúralo</span>}
          </>
        )}
        {colorPor === 'area' && <><span className="text-white/35">📊 Color por área:</span> cada pieza coloreada según su área de producción</>}
      </p>

      <div className={`relative w-full aspect-square sm:aspect-[4/3] lg:aspect-auto lg:h-[500px] rounded-xl overflow-hidden ${colorPor === 'acabado' ? 'bg-[#2a2e38]' : 'bg-[#3a404c]'} border border-white/[0.08] touch-none`}>
        <Canvas
          camera={{ position: inicio.posicion.toArray(), fov: 50, near: 0.01, far: 200 }}
          dpr={[1, 2]}
          // Sin esto el lienzo se borra después de cada cuadro y la captura sale en negro
          gl={{ preserveDrawingBuffer: true }}
          ref={lienzo}
          onCreated={({ camera }) => camera.lookAt(inicio.objetivo)}
          onPointerMissed={() => onSeleccion(null)}
        >
          <color attach="background" args={[colorPor === 'acabado' ? '#2a2e38' : '#3a404c']} />
          {colorPor === 'acabado' ? (
            // Acabado: estudio de fotografía de producto. Poca luz ambiental para que haya
            // contraste; principal cálida, relleno frío, contraluz que separa del fondo y rebote del piso
            <>
              <ambientLight intensity={0.35} />
              <hemisphereLight args={['#ffeedd', '#1a1d25', 0.5]} />
              <directionalLight position={[5, 8, 4]} intensity={2.5} color="#fff5e6" />
              <directionalLight position={[-4, 4, -3]} intensity={0.8} color="#e0e8ff" />
              <directionalLight position={[0, 3, -6]} intensity={0.6} color="#ffffff" />
              <pointLight position={[0, -1, 0]} intensity={0.2} color="#ffd4a0" distance={5} />
            </>
          ) : (
            <>
              <ambientLight intensity={1.1} />
              <hemisphereLight args={['#ffffff', '#30343f', 0.9]} />
              <directionalLight position={[10, 10, 5]} intensity={2.2} />
              <directionalLight position={[-5, 5, -5]} intensity={1.0} />
            </>
          )}

          <gridHelper args={[Math.max(dims.ancho * MM * 3, 2), 20, '#566070', '#474e5c']} />

          {piezas.map(p => (
            <Pieza3D
              key={p.key}
              pieza={p}
              desplazamiento={modo === 'explosion' ? explotar(p, dims, separacion) : [0, 0, 0]}
              apariencia={apariencia(p, modo, colorPor, acabadoGeneral, seleccion, dims)}
              onClick={() => onSeleccion(seleccion === p.compKey ? null : p.compKey)}
            />
          ))}

          <ControlCamara controles={controles} enfoque={enfoque} vistaEnfoque={vistaEnfoque} reinicio={reinicio} inicio={destino} />
          <ObjetivoInicial controles={controles} objetivo={inicio.objetivo} />
        </Canvas>

        {/* Datos de la pieza seleccionada */}
        {elegida && (
          <div className="absolute top-2 left-2 right-2 sm:right-auto sm:max-w-[75%] pointer-events-none rounded-lg bg-black/80 border border-amber-400/40 p-3 backdrop-blur-md shadow-lg space-y-1">
            <p className="text-xs font-semibold text-white leading-snug flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-[#FFD700] mt-1 flex-shrink-0" />
              <span>{elegida.nombre} <span className="font-mono text-white/60">×{elegida.cantidad}</span></span>
            </p>
            <p className="text-[11px] text-white/60 leading-snug">{[elegida.material, medidas(elegida.largo, elegida.ancho)].filter(Boolean).join(' · ')}</p>
            <p className="text-[11px] text-white/60 leading-snug">
              <span className="text-white/40">Acabado:</span> {elegida.acabado || (elegida.tipoMaterial === 'metal' ? bom.acabado || 'no indicado en el plano' : 'al natural')}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/45">
              <span className="inline-flex items-center gap-1.5 text-white/75"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: colorDeArea(areaDe(elegida)) }} />{areaDe(elegida)}</span>
              <span>Subensamble: {elegida.subensamble}</span>
              {elegida.pagina !== null && <span>· Pág. {elegida.pagina}</span>}
            </p>
          </div>
        )}

        <p className="absolute bottom-2 left-2 right-2 text-[10px] text-white/35 pointer-events-none">
          {exacto && !aproximado
            ? 'Posiciones y tamaños leídos del plano. Las piezas se dibujan como cajas.'
            : exacto
            ? 'Posiciones leídas del plano; algunas piezas sin posición se colocaron por su nombre.'
            : 'Plano analizado con la versión anterior: las posiciones son aproximadas. Vuelve a analizarlo para ver el armado real.'}
        </p>
      </div>

      {/* Leyenda de colores del modo activo (en plano técnico todo es gris) */}
      {colorPor !== 'plano' && <ul className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1" aria-label={colorPor === 'area' ? 'Colores por área' : 'Acabados y materiales'}>
        {leyenda.map(([etiqueta, g]) => (
          <li key={etiqueta} className="inline-flex items-center gap-1.5 text-[11px] text-white/65">
            <span className="w-3 h-3 rounded-sm border border-white/25 flex-shrink-0" style={{ backgroundColor: g.color }} />
            {etiqueta} <span className="text-white/35 font-mono">{g.piezas}</span>
          </li>
        ))}
      </ul>}
    </div>
  )
}

/** Apunta los controles al centro del producto al montar (por defecto apuntan al origen) */
function ObjetivoInicial({ controles, objetivo }: { controles: React.RefObject<OrbitControlsImpl | null>; objetivo: Vector3 }) {
  useEffect(() => {
    const c = controles.current
    if (!c) return
    c.target.copy(objetivo)
    c.update()
  }, [controles, objetivo])
  return null
}
