'use client'

/**
 * ResponsiveTable.tsx
 * ───────────────────
 * Tabla reutilizable: en escritorio (md+) se ve como tabla y en celular como
 * tarjetas, con el mismo arreglo de columnas.
 *
 * Cada columna dice cómo se dibuja (`render`) y qué importancia tiene en la
 * tarjeta móvil (`priority`): primary = título, secondary = datos clave,
 * tertiary = detalles.
 *
 * RUTA: src/components/ResponsiveTable.tsx
 */

import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: string
  render: (item: T) => ReactNode
  hideOnMobile?: boolean
  priority?: 'primary' | 'secondary' | 'tertiary'
}

interface ResponsiveTableProps<T> {
  data: T[]
  columns: Column<T>[]
  keyExtractor: (item: T) => string
  onRowClick?: (item: T) => void
  emptyMessage?: string
}

export function ResponsiveTable<T>({
  data, columns, keyExtractor, onRowClick, emptyMessage = 'Sin datos',
}: ResponsiveTableProps<T>) {
  if (data.length === 0) {
    return <div className="text-center py-12 text-white/40 text-sm">{emptyMessage}</div>
  }

  const enMovil = columns.filter(c => !c.hideOnMobile)
  const primary = enMovil.filter(c => c.priority === 'primary')
  const secondary = enMovil.filter(c => c.priority === 'secondary')
  // Las columnas sin prioridad se tratan como detalle
  const tertiary = enMovil.filter(c => c.priority === 'tertiary' || !c.priority)

  return (
    <>
      {/* ESCRITORIO: tabla */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.08]">
              {columns.map(col => (
                <th key={col.key} className="text-left py-3 px-4 text-xs text-white/50 font-medium uppercase tracking-wider">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(item => (
              <tr
                key={keyExtractor(item)}
                className={`border-b border-white/[0.04] ${onRowClick ? 'cursor-pointer hover:bg-white/[0.02]' : ''}`}
                onClick={onRowClick ? () => onRowClick(item) : undefined}
              >
                {columns.map(col => (
                  <td key={col.key} className="py-3 px-4 text-sm text-white/80">{col.render(item)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MÓVIL: tarjetas */}
      <div className="md:hidden space-y-3">
        {data.map(item => (
          <div
            key={keyExtractor(item)}
            className={`p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] transition-colors ${onRowClick ? 'active:bg-white/[0.06] cursor-pointer' : ''}`}
            onClick={onRowClick ? () => onRowClick(item) : undefined}
          >
            {primary.map(col => (
              <div key={col.key} className="text-sm font-medium text-white mb-1">{col.render(item)}</div>
            ))}

            {secondary.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/50 mb-2">
                {secondary.map((col, i) => (
                  <span key={col.key} className="inline-flex items-center gap-3">
                    {i > 0 && <span aria-hidden>•</span>}
                    {col.render(item)}
                  </span>
                ))}
              </div>
            )}

            {tertiary.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {tertiary.map(col => (
                  <span key={col.key} className="text-xs text-white/40">{col.render(item)}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
