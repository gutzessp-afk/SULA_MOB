
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getProyectosLista, type ProyectoLista } from '../actions'

const card = '#10141f'
const line = '#1e2433'
const bl = '#3b82f6'

export default function AvancesPage() {
  const [proyectos, setProyectos] = useState<ProyectoLista[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    getProyectosLista().then((p) => {
      setProyectos(p)
      setCargando(false)
    })
  }, [])

  return (
    <div style={{ maxWidth: 760, margin: '8px auto', paddingBottom: 48 }}>
      <div style={{ color: '#fff', fontSize: 19, fontWeight: 800, marginBottom: 4 }}>
        REGISTRAR <span style={{ color: bl }}>AVANCE</span>
      </div>
      <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14 }}>
        Elige un proyecto, entra a tu área con su contraseña y registra tus piezas.
      </div>

      {cargando ? (
        <div style={{ color: '#94a3b8', fontSize: 13, padding: '24px 0' }}>Cargando proyectos...</div>
      ) : proyectos.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: '34px 0' }}>
          No hay proyectos para mostrar.
        </div>
      ) : (
        proyectos.map((p) => (
          <Link
            key={p.id}
            href={`/operator/avances/${p.id}`}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: card,
              border: `1px solid ${line}`,
              borderRadius: 14,
              padding: '14px 18px',
              marginBottom: 9,
            }}
          >
            <div style={{ color: bl, fontSize: 10.5, fontWeight: 700 }}>{p.codigo}</div>
            <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, marginTop: 1 }}>
              {p.nombre}
            </div>
            <div style={{ color: '#64748b', fontSize: 11.5, marginTop: 1 }}>
              {p.cliente || 'Sin cliente'} · Avance {p.progreso}%
            </div>
          </Link>
        ))
      )}
    </div>
  )
}
