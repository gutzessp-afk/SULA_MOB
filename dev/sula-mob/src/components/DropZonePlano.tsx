'use client'

/**
 * DropZonePlano.tsx
 * ─────────────────
 * Zona para arrastrar o elegir el PDF de un plano. Revisa que sea PDF y que no
 * pase de 4.4 MB (lo más que acepta una función de Vercel). Con un archivo
 * elegido muestra su nombre y tamaño, y el botón para quitarlo.
 *
 * RUTA: src/components/DropZonePlano.tsx
 */

import { useRef, useState } from 'react'
import { FileText, Upload, X } from 'lucide-react'

export const MAX_BYTES_PLANO = 4.4 * 1024 * 1024

interface Props {
  archivo: File | null
  onArchivo: (archivo: File | null) => void
  disabled?: boolean
}

const tamano = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

export function DropZonePlano({ archivo, onArchivo, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  // Contador: al pasar sobre los hijos de la zona el navegador manda dragleave/dragenter
  const dentro = useRef(0)
  const [arrastrando, setArrastrando] = useState(false)
  const [error, setError] = useState('')

  const elegir = (file: File | undefined) => {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setError('El plano debe ser un archivo PDF.'); return }
    if (file.size > MAX_BYTES_PLANO) { setError(`El PDF pesa ${tamano(file.size)}: el máximo es 4.4 MB. Redúcelo o divídelo.`); return }
    setError('')
    onArchivo(file)
  }
  const traeArchivos = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files')

  return (
    <div className="space-y-2">
      {archivo ? (
        <div className="flex items-center gap-3 rounded-xl border border-blue-400/30 bg-blue-500/[0.08] px-4 py-3">
          <FileText className="h-5 w-5 flex-shrink-0 text-blue-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{archivo.name}</p>
            <p className="text-[11px] text-white/50">{tamano(archivo.size)}</p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="min-h-[40px] rounded-lg border border-white/15 px-3 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            Cambiar
          </button>
          <button
            type="button"
            onClick={() => onArchivo(null)}
            disabled={disabled}
            aria-label="Quitar el PDF"
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-red-400/30 px-3 text-xs font-semibold text-red-300 hover:bg-red-500/15 disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" /> <span className="max-sm:hidden">Quitar</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragEnter={e => { if (!traeArchivos(e)) return; e.preventDefault(); dentro.current++; setArrastrando(true) }}
          onDragLeave={e => { if (!traeArchivos(e)) return; dentro.current = Math.max(0, dentro.current - 1); if (!dentro.current) setArrastrando(false) }}
          onDragOver={e => { if (traeArchivos(e)) e.preventDefault() }}
          onDrop={e => { if (!traeArchivos(e)) return; e.preventDefault(); dentro.current = 0; setArrastrando(false); elegir(e.dataTransfer.files?.[0]) }}
          className={`w-full rounded-2xl border-2 border-dashed p-8 text-center transition-colors disabled:opacity-40 ${
            arrastrando ? 'border-blue-400 bg-blue-500/10' : 'border-white/15 hover:border-white/30 hover:bg-white/[0.03]'
          }`}
        >
          {arrastrando ? <Upload className="mx-auto mb-2 h-8 w-8 animate-bounce text-blue-400" /> : <FileText className="mx-auto mb-2 h-8 w-8 text-white/30" />}
          <span className="block text-sm font-semibold text-white/80">{arrastrando ? 'Suelta el PDF aquí' : 'Arrastra el plano aquí'}</span>
          <span className="mt-0.5 block text-xs text-white/45">o toca para elegirlo (PDF, máximo 4.4 MB)</span>
        </button>
      )}
      {error && <p role="alert" className="text-xs font-semibold text-red-300">{error}</p>}
      <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={e => { elegir(e.target.files?.[0]); e.target.value = '' }} />
    </div>
  )
}
