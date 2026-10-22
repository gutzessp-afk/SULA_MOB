'use client';

/**
 * Historial de Despiece — /admin/despiece/historial
 * ──────────────────────────────────────────────────
 * Dos vistas:
 *   - Por plano: los despieces guardados (plantilla_despiece); abren /admin/despiece/plano.
 *   - Por pedido: los proyectos; abren /admin/proyectos/[id].
 * Filtros de periodo (sobre la fecha de alta), búsqueda y línea o cliente.
 *
 * RUTA: src/app/admin/despiece/historial/page.tsx
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Briefcase, Calendar, ChevronDown, Clock, FileText, Filter, Layers, MapPin, Search, X } from 'lucide-react';
import { cargarProyectos, useDatos } from '@/lib/cache-datos';
import { useDebounce } from '@/hooks/useDebounce';
import { BadgePrioridad } from '@/components/BadgePrioridad';

/* ── Tipos ── */

interface Plantilla {
  id: string;
  clave: string;
  descripcion: string | null;
  linea: string | null;
  plano_nombre: string | null;
  created_at: string;
  updated_at: string | null;
}

interface Proyecto {
  id: string;
  codigo: string;
  nombre: string;
  cliente?: string | null;
  referencia_sucursal?: string | null;
  prioridad: string;
  progreso: number;
  created_at: string;
}

/* ── Constantes ── */

const TARJETA = 'rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]';

type Vista = 'plano' | 'pedido';
type Periodo = 'semana' | 'mes' | '3meses' | 'todo';

const PERIODOS: { valor: Periodo; etiqueta: string }[] = [
  { valor: 'semana', etiqueta: 'Esta semana' },
  { valor: 'mes', etiqueta: 'Este mes' },
  { valor: '3meses', etiqueta: 'Últimos 3 meses' },
  { valor: 'todo', etiqueta: 'Todo' },
];

/** Desde qué fecha cuenta el periodo (null = todo) */
function fechaCorte(periodo: Periodo): Date | null {
  const ahora = new Date();
  if (periodo === 'todo') return null;
  if (periodo === 'semana') {
    const d = new Date(ahora);
    d.setDate(d.getDate() - d.getDay()); // desde el domingo
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (periodo === 'mes') return new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  return new Date(ahora.getFullYear(), ahora.getMonth() - 3, 1);
}

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

function fechaRelativa(iso: string) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 7) return `Hace ${dias} días`;
  return fechaCorta(iso);
}

const cargarPlantillas = async (): Promise<Plantilla[]> => {
  const res = await fetch('/api/plantilla-despiece');
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar los planos.');
  return json?.plantillas ?? [];
};

const pestana = (activa: boolean) =>
  `min-h-[44px] flex flex-1 sm:flex-none items-center justify-center gap-2 whitespace-nowrap px-3 sm:px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
    activa ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40' : 'bg-white/[0.04] text-white/55 border-white/10 hover:text-white hover:bg-white/[0.08]'
  }`;

export default function HistorialPage() {
  const [vista, setVista] = useState<Vista>('plano');
  const [periodo, setPeriodo] = useState<Periodo>('todo');
  const [busqueda, setBusqueda] = useState('');
  const busquedaDebounced = useDebounce(busqueda, 300);
  const [filtroCategoria, setFiltroCategoria] = useState(''); // línea (plano) o cliente (pedido)
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  /* ── Datos (misma caché que el resto de la app) ── */
  const { datos: datosPlantillas, cargando: cargandoPlantillas, error: errorPlantillas } = useDatos('plantillas-despiece', cargarPlantillas);
  const { datos: datosProyectos, cargando: cargandoProyectos, error: errorProyectos } = useDatos('proyectos', () => cargarProyectos<Proyecto>());
  const plantillas = useMemo(() => datosPlantillas ?? [], [datosPlantillas]);
  const proyectos = useMemo(() => datosProyectos ?? [], [datosProyectos]);

  const cambiarVista = (v: Vista) => {
    setVista(v);
    // La línea de un plano no es un cliente: el filtro no sirve en la otra vista
    setFiltroCategoria('');
  };

  /* ── Opciones de línea o cliente ── */
  const categorias = useMemo(() => {
    const valores = vista === 'plano' ? plantillas.map(p => p.linea) : proyectos.map(p => p.cliente);
    return [...new Set(valores.filter((v): v is string => !!v?.trim()))].sort((a, b) => a.localeCompare(b, 'es'));
  }, [vista, plantillas, proyectos]);

  const term = busquedaDebounced.trim().toLowerCase();

  /* ── Filtrado: planos ── */
  const plantillasFiltradas = useMemo(() => {
    const corte = fechaCorte(periodo);
    return plantillas
      .filter(p => !corte || new Date(p.created_at) >= corte)
      .filter(p => !filtroCategoria || p.linea === filtroCategoria)
      .filter(p => !term || p.clave?.toLowerCase().includes(term) || p.descripcion?.toLowerCase().includes(term) || p.plano_nombre?.toLowerCase().includes(term))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [plantillas, periodo, filtroCategoria, term]);

  /* ── Filtrado: pedidos ── */
  const proyectosFiltrados = useMemo(() => {
    const corte = fechaCorte(periodo);
    return proyectos
      .filter(p => !corte || new Date(p.created_at) >= corte)
      .filter(p => !filtroCategoria || p.cliente === filtroCategoria)
      .filter(p => !term || p.codigo?.toLowerCase().includes(term) || p.nombre?.toLowerCase().includes(term) || p.cliente?.toLowerCase().includes(term) || p.referencia_sucursal?.toLowerCase().includes(term));
  }, [proyectos, periodo, filtroCategoria, term]);

  const hayFiltrosActivos = periodo !== 'todo' || filtroCategoria !== '' || busqueda !== '';
  const limpiar = () => { setPeriodo('todo'); setFiltroCategoria(''); setBusqueda(''); };
  const error = vista === 'plano' ? errorPlantillas : errorProyectos;

  return (
    <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto px-2 sm:px-0 pb-8">

      {/* ═══ HEADER (el margen en escritorio deja libre el botón que oculta el menú lateral) ═══ */}
      <div className={`${TARJETA} relative overflow-hidden px-5 py-6 sm:p-8 lg:pl-16`}>
        <div className="flex items-center gap-4 mb-5">
          <Link
            href="/admin/despiece"
            aria-label="Volver al Despiece"
            className="w-11 h-11 rounded-xl bg-white/[0.06] border border-white/15 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.1] transition-all flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-wide leading-tight">Historial</h1>
            <p className="text-xs sm:text-sm text-white/55 mt-1">Planos analizados y despieces por pedido</p>
          </div>
        </div>

        {/* Pestañas */}
        <div className="flex gap-2" role="tablist" aria-label="Qué ver">
          <button type="button" role="tab" aria-selected={vista === 'plano'} onClick={() => cambiarVista('plano')} className={pestana(vista === 'plano')}>
            <FileText className="w-4 h-4" /> Por plano
            <span className="text-[11px] font-mono bg-black/30 px-1.5 py-0.5 rounded">{plantillas.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={vista === 'pedido'} onClick={() => cambiarVista('pedido')} className={pestana(vista === 'pedido')}>
            <Briefcase className="w-4 h-4" /> Por pedido
            <span className="text-[11px] font-mono bg-black/30 px-1.5 py-0.5 rounded">{proyectos.length}</span>
          </button>
        </div>
      </div>

      {/* ═══ FILTROS ═══ */}
      <div className={`${TARJETA} overflow-hidden`}>
        <div className="px-5 py-4 sm:px-6 sm:py-5 space-y-4">
          {/* Buscador + botón de filtros (celular) */}
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2 bg-white/[0.05] border border-white/15 rounded-xl px-3">
              <Search className="w-4 h-4 text-white/40 flex-shrink-0" />
              <input
                type="text"
                placeholder={vista === 'plano' ? 'Buscar por clave, descripción o archivo...' : 'Buscar por código, proyecto, cliente...'}
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className="max-sm:text-base max-sm:min-h-[44px] h-[42px] bg-transparent text-sm text-white outline-none w-full min-w-0 placeholder:text-white/35"
              />
              {busqueda && (
                <button type="button" onClick={() => setBusqueda('')} aria-label="Borrar búsqueda" className="-m-1 p-1">
                  <X className="w-3.5 h-3.5 text-white/40 hover:text-white" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMostrarFiltros(m => !m)}
              aria-expanded={mostrarFiltros}
              className={`sm:hidden min-h-[44px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
                hayFiltrosActivos ? 'bg-cyan-500/15 text-cyan-300 border-cyan-400/40' : 'bg-white/[0.05] text-white/60 border-white/15'
              }`}
            >
              <Filter className="w-3.5 h-3.5" /> Filtros
              {hayFiltrosActivos && <span className="w-2 h-2 rounded-full bg-cyan-400" />}
            </button>
          </div>

          {/* Periodo + línea o cliente: siempre en escritorio, desplegable en el celular */}
          <div className={`${mostrarFiltros ? 'flex' : 'hidden'} sm:flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4 sm:items-center`}>
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-white/40 flex-shrink-0 hidden sm:block" />
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5 w-full sm:w-auto">
                {PERIODOS.map(p => (
                  <button
                    key={p.valor}
                    type="button"
                    onClick={() => setPeriodo(p.valor)}
                    aria-pressed={periodo === p.valor}
                    className={`max-sm:min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      periodo === p.valor ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40' : 'bg-white/[0.04] text-white/50 border-white/10 hover:text-white hover:bg-white/[0.08]'
                    }`}
                  >
                    {p.etiqueta}
                  </button>
                ))}
              </div>
            </div>

            <div className="hidden sm:block w-px h-6 bg-white/15" />

            <div className="relative sm:flex-shrink-0">
              <select
                value={filtroCategoria}
                onChange={e => setFiltroCategoria(e.target.value)}
                aria-label={vista === 'plano' ? 'Línea' : 'Cliente'}
                className="max-sm:min-h-[44px] max-sm:w-full max-sm:text-base h-[34px] appearance-none bg-white/[0.06] border border-white/15 rounded-xl text-xs text-white/80 font-semibold pl-3 pr-8 outline-none focus:border-cyan-400/60 transition-colors cursor-pointer"
              >
                <option value="" className="bg-slate-900">{vista === 'plano' ? 'Todas las líneas' : 'Todos los clientes'}</option>
                {categorias.map(cat => <option key={cat} value={cat} className="bg-slate-900">{cat}</option>)}
              </select>
              <ChevronDown className="w-3 h-3 text-white/40 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {hayFiltrosActivos && (
              <button type="button" onClick={limpiar} className="max-sm:min-h-[44px] text-xs text-white/50 hover:text-white inline-flex items-center justify-center gap-1">
                <X className="w-3 h-3" /> Limpiar filtros
              </button>
            )}
          </div>
        </div>

        <div className="px-5 py-2.5 sm:px-6 border-t border-white/10 bg-white/[0.02]">
          <p className="text-[11px] text-white/45 font-semibold">
            {vista === 'plano'
              ? `${plantillasFiltradas.length} plano${plantillasFiltradas.length === 1 ? '' : 's'}`
              : `${proyectosFiltrados.length} pedido${proyectosFiltrados.length === 1 ? '' : 's'}`}
            {hayFiltrosActivos && ' (filtrado)'}
          </p>
        </div>
      </div>

      {error && <p className="text-xs text-red-300 font-semibold bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">{error}</p>}

      {/* ═══ RESULTADOS ═══ */}
      <div className={`${TARJETA} overflow-hidden`}>
        {vista === 'plano' ? (
          <div className="divide-y divide-white/10">
            {plantillasFiltradas.map(p => (
              <Link
                key={p.id}
                href={`/admin/despiece/plano?clave=${encodeURIComponent(p.clave)}`}
                className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 px-5 py-4 sm:px-6 sm:py-5 hover:bg-white/[0.06] active:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center text-cyan-400 flex-shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono text-cyan-300 font-bold text-sm">{p.clave}</span>
                      {p.linea && <span className="text-[10px] font-bold uppercase text-white/40 bg-white/[0.06] border border-white/10 px-2 py-0.5 rounded-lg">{p.linea}</span>}
                    </div>
                    <p className={`text-sm font-semibold leading-snug truncate ${p.descripcion ? 'text-white' : 'text-white/35 italic'}`}>{p.descripcion || 'Sin descripción'}</p>
                    <p className="text-[11px] text-white/40 flex items-center gap-1.5 min-w-0">
                      <Clock className="w-3 h-3 flex-shrink-0" /> {fechaRelativa(p.created_at)}
                      {p.plano_nombre && <span className="truncate text-white/30">· {p.plano_nombre}</span>}
                    </p>
                  </div>
                </div>
                <span className="max-sm:min-h-[44px] bg-cyan-500/15 text-cyan-300 border border-cyan-400/30 text-xs px-4 py-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-semibold flex-shrink-0">
                  <Layers className="w-3.5 h-3.5" /> Ver despiece
                </span>
              </Link>
            ))}

            {plantillasFiltradas.length === 0 && (
              <div className="p-12 text-center text-white/40 text-sm">
                {cargandoPlantillas ? 'Cargando planos...' : hayFiltrosActivos ? 'No hay planos que coincidan con los filtros.' : 'Aún no se ha analizado ningún plano.'}
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {proyectosFiltrados.map(p => {
              const progreso = Math.round(Number(p.progreso) || 0);
              return (
                <Link
                  key={p.id}
                  href={`/admin/proyectos/${p.id}`}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 px-5 py-4 sm:px-6 sm:py-5 hover:bg-white/[0.06] active:bg-white/[0.04] transition-colors"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-blue-400 font-bold text-sm">{p.codigo}</span>
                      <BadgePrioridad prioridad={p.prioridad} />
                    </div>
                    <p className="text-white font-semibold text-sm leading-snug truncate">{p.nombre}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/45">
                      {(p.referencia_sucursal || p.cliente) && (
                        <span className="flex items-center gap-1 min-w-0"><MapPin className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{p.referencia_sucursal || p.cliente}</span></span>
                      )}
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {fechaRelativa(p.created_at)}</span>
                    </div>
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

                  <span className="max-sm:min-h-[44px] bg-cyan-500/15 text-cyan-300 border border-cyan-400/30 text-xs px-4 py-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-semibold flex-shrink-0">
                    <Layers className="w-3.5 h-3.5" /> Abrir despiece
                  </span>
                </Link>
              );
            })}

            {proyectosFiltrados.length === 0 && (
              <div className="p-12 text-center text-white/40 text-sm">
                {cargandoProyectos ? 'Cargando proyectos...' : hayFiltrosActivos ? 'No hay pedidos que coincidan con los filtros.' : 'No hay proyectos registrados.'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
