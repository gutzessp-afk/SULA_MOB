'use client'

/**
 * Pieza3D.tsx
 * ───────────
 * Dibuja UNA pieza del producto armado dentro del <Canvas> del visor:
 * una caja (tubos, láminas, placas) o un cilindro (tubo redondo), con su
 * tamaño real, y la mueve suavemente cuando cambia el modo de vista
 * (armado ↔ explosionado).
 *
 * RUTA: src/components/Pieza3D.tsx
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import type { Mesh } from 'three'
import type { PiezaArmada } from '@/lib/ensamble-3d'

const MM = 0.001 // la escena se mide en metros

export interface AparienciaPieza {
  color: string
  opacity: number
  metalness: number
  roughness: number
  emissive: string
  emissiveIntensity: number
  borde: string
}

interface Props {
  pieza: PiezaArmada
  /** Desplazamiento en mm respecto a su lugar de armado (modo explosión) */
  desplazamiento: [number, number, number]
  apariencia: AparienciaPieza
  onClick: () => void
}

/** Giro del cilindro (que nace vertical) para que su eje siga el largo de la pieza */
const GIRO_CILINDRO = { x: [0, 0, Math.PI / 2], y: [0, 0, 0], z: [Math.PI / 2, 0, 0] } as const

export function Pieza3D({ pieza, desplazamiento, apariencia, onClick }: Props) {
  const ref = useRef<Mesh>(null)
  const destino: [number, number, number] = [
    (pieza.pos[0] + desplazamiento[0]) * MM,
    (pieza.pos[1] + desplazamiento[1]) * MM,
    (pieza.pos[2] + desplazamiento[2]) * MM,
  ]

  // Animación: en cada cuadro la pieza se acerca a su destino (≈0.5 s en llegar)
  useFrame((_, delta) => {
    const m = ref.current
    if (!m) return
    const k = Math.min(1, delta * 7)
    m.position.x += (destino[0] - m.position.x) * k
    m.position.y += (destino[1] - m.position.y) * k
    m.position.z += (destino[2] - m.position.z) * k
  })

  const [sx, sy, sz] = pieza.size.map(v => v * MM)
  const redondo = pieza.geometria === 'tubo_redondo'
  const largo = pieza.size[{ x: 0, y: 1, z: 2 }[pieza.ejeLargo]] * MM
  const radio = (Math.min(...pieza.size) * MM) / 2
  // Piezas inclinadas (vidrio frontal de una vitrina): la parte de arriba se va hacia atrás (-z)
  const inclinacion = pieza.size[1] > Math.min(pieza.size[0], pieza.size[2]) ? (-pieza.inclinacion * Math.PI) / 180 : 0

  return (
    <mesh
      ref={ref}
      position={[pieza.pos[0] * MM, pieza.pos[1] * MM, pieza.pos[2] * MM]}
      rotation={redondo ? [...GIRO_CILINDRO[pieza.ejeLargo]] : [inclinacion, 0, 0]}
      onClick={e => { e.stopPropagation(); onClick() }}
      onPointerOver={e => { e.stopPropagation(); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = '' }}
    >
      {redondo ? <cylinderGeometry args={[radio, radio, largo, 16]} /> : <boxGeometry args={[sx, sy, sz]} />}
      {/* key: al pasar de opaco a transparente Three.js necesita un material nuevo */}
      <meshStandardMaterial
        key={apariencia.opacity < 1 ? 'transparente' : 'opaco'}
        color={apariencia.color}
        emissive={apariencia.emissive}
        emissiveIntensity={apariencia.emissiveIntensity}
        metalness={apariencia.metalness}
        roughness={apariencia.roughness}
        transparent={apariencia.opacity < 1}
        opacity={apariencia.opacity}
        depthWrite={apariencia.opacity >= 0.5}
      />
      {/* Aristas: sin ellas, piezas oscuras sobre fondo oscuro no se distinguen */}
      {!redondo && <Edges color={apariencia.borde} />}
    </mesh>
  )
}
