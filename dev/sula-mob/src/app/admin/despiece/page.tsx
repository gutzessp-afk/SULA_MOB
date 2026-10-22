'use client';

/**
 * Despiece — /admin/despiece
 * ──────────────────────────
 * Página principal del módulo:
 *   1. Zona para soltar el PDF de un plano sin pedido. Lo lleva a /admin/despiece/plano
 *      (src/lib/plano-pendiente.ts): si el nombre trae la clave completa se analiza solo,
 *      si no, ahí se escribe la clave antes de gastar IA.
 *   2. Proyectos, para ver el despiece y avance de cada pedido.
 *
 * Los planos ya analizados están en /admin/despiece/historial.
 *
 * RUTA: src/app/admin/despiece/page.tsx
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Clock, FileText, Layers, Loader2, MapPin, Search, Upload, X } from 'lucide-react';
import { cargarProyectos, useDatos } from '@/lib/cache-datos';
import { dejarPlanoPendiente } from '@/lib/plano-pendiente';
import { useDebounce } from '@/hooks/useDebounce';
import { useRealtimeAvances } from '@/hooks/useRealtimeAvances';
import { BadgePrioridad } from '@/components/BadgePrioridad';
import { EnVivo } from '@/components/EnVivo';
import { MAX_BYTES_PLANO } from '@/components/DropZonePlano';

interface Proyecto {
  id: string;
  codigo: string;
  nombre: string;
  cliente?: string;
  referencia_sucursal?: string | null;
  prioridad: string;
  progreso: number;
}

const TARJETA = 'rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]';

export default function DespieceIndexPage() {
  const router = useRouter();
  // Misma clave que la lista de Proyectos: si ya se cargó, aparece al instante
  const { datos, cargando, error: errorProyectos, recargar } = useDatos('proyectos', () => cargarProyectos<Proyecto>());
  const enVivo = useRealtimeAvances(() => void recargar());
  const proyectos = useMemo(() => datos ?? [], [datos]);

  /* ── Buscador de proyectos ── */
  const [busqueda, setBusqueda] = useState('');
  const busquedaDebounced = useDebounce(busqueda, 300);
  const filtrados = useMemo(() => {
    const term = busquedaDebounced.trim().toLowerCase();
    if (!term) return proyectos;
    return proyectos.filter(p =>
      p.nombre?.toLowerCase().includes(term) ||
      p.codigo?.toLowerCase().includes(term) ||
      p.cliente?.toLowerCase().includes(term) ||
      p.referencia_sucursal?.toLowerCase().includes(term)
    );
  }, [proyectos, busquedaDebounced]);

  /* ── Subir plano: se revisa aquí y se analiza en /admin/despiece/plano ── */
  const inputRef = useRef<HTMLInputElement>(null);
  // Contador: al pasar sobre los hijos de la zona el navegador manda dragleave/dragenter
  const dentro = useRef(0);
  const [arrastrando, setArrastrando] = useState(false);
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [errorSubida, setErrorSubida] = useState('');

  const subirPlano = useCallback((file: File | undefined) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setErrorSubida('Solo se aceptan archivos PDF.'); return; }
    if (file.size > MAX_BYTES_PLANO) { setErrorSubida('El archivo pesa más de 4.4 MB: redúcelo o divídelo antes de subirlo.'); return; }
    setErrorSubida('');
    setAbriendo(file.name);
    dejarPlanoPendiente(file);
    router.push('/admin/despiece/plano');
  }, [router]);

  const traeArchivos = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  return (
    <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto px-2 sm:px-0 pb-8">

      {/* ═══ HEADER (el margen en escritorio deja libre el botón que oculta el menú lateral) ═══ */}
      <div className={`${TARJETA} relative overflow-hidden px-5 py-6 sm:p-8 flex items-center gap-5 lg:pl-16`}>
        <div className="w-14 h-14 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400 flex-shrink-0">
          <Layers className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-wide leading-tight">Despiece</h1>
          <p className="text-xs sm:text-sm text-white/60 mt-1.5 leading-relaxed">
            Sube un plano PDF para sacar su despiece y Matriz de Corte, o elige un proyecto para ver su despiece.
          </p>
          <EnVivo estado={enVivo} className="mt-2" />
        </div>
        <Link
          href="/admin/despiece/historial"
          className="hidden sm:inline-flex items-center gap-2 text-xs font-semibold text-white/60 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] border border-white/15 px-4 py-2.5 rounded-xl transition-all flex-shrink-0"
        >
          <Clock className="w-3.5 h-3.5" /> Historial
        </Link>
      </div>

      {/* ═══ SUBIR PLANO — arrastrar y soltar ═══ */}
      <div
        onDragEnter={e => { if (!traeArchivos(e)) return; e.preventDefault(); dentro.current++; setArrastrando(true); }}
        onDragLeave={e => { if (!traeArchivos(e)) return; dentro.current = Math.max(0, dentro.current - 1); if (!dentro.current) setArrastrando(false); }}
        onDragOver={e => { if (traeArchivos(e)) e.preventDefault(); }}
        onDrop={e => { if (!traeArchivos(e)) return; e.preventDefault(); dentro.current = 0; setArrastrando(false); subirPlano(e.dataTransfer.files?.[0]); }}
        className={`${TARJETA} relative overflow-hidden transition-all ${arrastrando ? 'border-cyan-400/60 bg-cyan-500/[0.08] ring-cyan-400/30' : ''}`}
      >
        <div className="px-5 py-8 sm:px-8 sm:py-12 flex flex-col items-center text-center gap-4">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${abriendo || arrastrando ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/[0.06] text-white/40'}`}>
            {abriendo ? <Loader2 className="w-7 h-7 animate-spin" /> : <Upload className={`w-7 h-7 ${arrastrando ? 'animate-bounce' : ''}`} />}
          </div>

          {abriendo ? (
            <>
              <p className="text-sm font-semibold text-white">Abriendo el plano…</p>
              <p className="text-xs text-white/50 break-all">{abriendo}</p>
            </>
          ) : (
            <>
              <div>
                <p className="text-base font-semibold text-white">{arrastrando ? 'Suelta el PDF aquí' : 'Arrastra un plano PDF aquí'}</p>
                <p className="text-xs text-white/50 mt-1">o toca el botón para elegir el archivo</p>
              </div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-1 min-h-[44px] px-6 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white text-sm font-bold transition-colors inline-flex items-center gap-2"
              >
                <FileText className="w-4 h-4" /> Seleccionar archivo PDF
              </button>
              <p className="text-[11px] text-white/35">Máximo 4.4 MB · Si el nombre trae la clave (ej. 2-1-0072-0003) se analiza solo</p>
            </>
          )}
          <input ref={inputRef} type="file" accept=".pdf,application/pdf" onChange={e => { subirPlano(e.target.files?.[0]); e.target.value = ''; }} className="hidden" />

          {errorSubida && (
            <div role="alert" className="flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/25 px-4 py-2.5 rounded-xl mt-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {errorSubida}
              <button type="button" onClick={() => setErrorSubida('')} aria-label="Cerrar aviso" className="ml-auto -m-1 p-1 rounded-lg hover:bg-white/10"><X className="w-3 h-3" /></button>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Historial — en el celular va aquí ═══ */}
      <Link
        href="/admin/despiece/historial"
        className="sm:hidden flex items-center justify-center gap-2 min-h-[44px] text-sm font-semibold text-white/60 hover:text-white bg-white/[0.06] border border-white/15 px-4 py-3.5 rounded-xl transition-all"
      >
        <Clock className="w-4 h-4" /> Ver historial de planos
      </Link>

      {/* ═══ PROYECTOS — despiece por pedido ═══ */}
      <div className={`${TARJETA} overflow-hidden`}>
        <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-white/10 bg-white/[0.02]">
          <h2 className="text-sm font-bold text-white/80 uppercase tracking-wider">Despiece por pedido</h2>
          <p className="text-xs text-white/45 mt-1">Elige un proyecto para ver su despiece y avance por área</p>
        </div>

        <div className="px-5 py-3 sm:px-6 sm:py-4 border-b border-white/10 flex items-center gap-3 bg-white/[0.03]">
          <Search className="w-4 h-4 text-white/50 flex-shrink-0" />
          <input
            type="text"
            placeholder="Buscar por código, sucursal, cliente o proyecto..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="max-sm:text-base max-sm:min-h-[44px] bg-transparent text-sm text-white outline-none w-full placeholder:text-white/40"
          />
        </div>

        {errorProyectos && <p className="text-xs text-red-300 font-semibold bg-red-500/10 border-b border-red-500/25 px-5 py-3">{errorProyectos}</p>}

        <div className="divide-y divide-white/10">
          {filtrados.map(p => {
            const progreso = Math.round(Number(p.progreso) || 0);
            return (
              <Link
                key={p.id}
                href={`/admin/proyectos/${p.id}`}
                className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 px-5 py-4 sm:px-6 sm:py-5 min-h-[44px] hover:bg-white/[0.06] active:bg-white/[0.04] transition-colors"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-blue-400 font-bold text-sm">{p.codigo}</span>
                    <BadgePrioridad prioridad={p.prioridad} />
                  </div>
                  <p className="text-white font-semibold text-[15px] leading-snug truncate">{p.nombre}</p>
                  {(p.referencia_sucursal || p.cliente) && (
                    <p className="text-white/50 text-xs flex items-center gap-1.5 truncate" title={p.cliente ? `Cliente: ${p.cliente}` : undefined}>
                      <MapPin className="w-3 h-3 flex-shrink-0" /> {p.referencia_sucursal || p.cliente}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 sm:w-56">
                  <div className="flex-1 h-2.5 bg-black/40 rounded-full overflow-hidden border border-white/10">
                    <div
                      className={`h-full transition-all duration-500 ${progreso >= 100 ? 'bg-emerald-400' : 'bg-gradient-to-r from-sky-500 via-indigo-400 to-emerald-400'}`}
                      style={{ width: `${Math.min(100, progreso)}%` }}
                    />
                  </div>
                  <span className={`font-mono text-xs font-bold w-10 text-right ${progreso >= 100 ? 'text-emerald-400' : progreso > 0 ? 'text-blue-400' : 'text-white/40'}`}>
                    {progreso}%
                  </span>
                </div>

                <span className="max-sm:min-h-[44px] bg-cyan-500/15 text-cyan-300 border border-cyan-400/30 text-xs px-4 py-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-semibold">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" /> Abrir despiece
                </span>
              </Link>
            );
          })}

          {filtrados.length === 0 && (
            <div className="p-10 text-center text-white/40 text-sm">
              {cargando ? 'Cargando proyectos...' : 'No se encontraron proyectos.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
