'use client';

/**
 * Detalle de un proyecto — /admin/proyectos/[id]
 * ──────────────────────────────────────────────
 * Despiece y vista 3D de cada partida del pedido, a partir del plano técnico:
 *   1. Encabezado con los datos del proyecto.
 *   2. Acciones: subir varios planos a la vez, analizar los pendientes y
 *      descargar la Matriz de Corte.
 *   3. Una tarjeta por partida (PartidaCard) con su despiece y su vista 3D.
 *
 * Cada plano se analiza una sola vez por clave: el resultado se guarda como
 * plantilla (tabla plantilla_despiece) y la próxima vez que se pida esa clave,
 * en cualquier proyecto, ya aparece lista.
 *
 * RUTA: src/app/admin/proyectos/[id]/page.tsx
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Calendar, FileSpreadsheet, Layers, Loader2, Package, Paperclip, Ruler, Search, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PartidaCard, type EstadoPartida } from '@/components/PartidaCard';
import type { PlantillaBOM } from '@/lib/types';

interface Proyecto {
  id: string;
  codigo: string;
  nombre: string;
  cliente?: string | null;
  descripcion?: string | null;
}

interface PartidaProyecto {
  clave: string;
  descripcion: string;
  cantidad: number;
}

const MAX_BYTES = 4.4 * 1024 * 1024;
const TARJETA = 'bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl';

/** "2026-10-21" → "21 oct 2026" */
function fechaCorta(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function DetalleProyectoPage() {
  const { id: proyectoId } = useParams<{ id: string }>();

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [partidas, setPartidas] = useState<PartidaProyecto[]>([]);
  const [estados, setEstados] = useState<Record<string, EstadoPartida>>({}); // por clave
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  // Análisis en curso: clave actual y avance de "Analizar pendientes"
  const [analizandoClave, setAnalizandoClave] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const [generandoMatriz, setGenerandoMatriz] = useState(false);
  const inputPlanos = useRef<HTMLInputElement>(null);

  const actualizar = (clave: string, cambios: EstadoPartida | ((e: EstadoPartida) => EstadoPartida)) =>
    setEstados(prev => ({ ...prev, [clave]: typeof cambios === 'function' ? cambios(prev[clave] ?? {}) : cambios }));

  /* ── Carga: proyecto, partidas y plantillas que ya existen ── */
  const cargar = useCallback(async () => {
    const { data: prj, error: errPrj } = await supabase
      .from('proyectos').select('id, codigo, nombre, cliente, descripcion').eq('id', proyectoId).maybeSingle();
    if (errPrj || !prj) {
      setError(errPrj?.message || 'No se encontró el proyecto.');
      setLoading(false);
      return;
    }

    // Partidas del sistema BOM; si el proyecto es anterior, se leen del sistema viejo ("[CLAVE] Descripción")
    let lista: PartidaProyecto[] = [];
    const { data: nuevas } = await supabase.from('partidas').select('clave, descripcion, cantidad').eq('proyecto_id', proyectoId).order('orden');
    if (nuevas?.length) {
      lista = nuevas as PartidaProyecto[];
    } else {
      const { data: viejas } = await supabase.from('proyecto_productos').select('nombre, cantidad').eq('proyecto_id', proyectoId).order('created_at');
      lista = (viejas ?? []).map(v => ({
        clave: (v.nombre as string).match(/\[(.*?)\]/)?.[1] || '',
        descripcion: (v.nombre as string).replace(/\[.*?\]\s*/, ''),
        cantidad: v.cantidad || 1,
      }));
    }

    // Una tarjeta por clave: si la clave se repite en el pedido, se suman sus cantidades
    const porClave = new Map<string, PartidaProyecto>();
    for (const p of lista) {
      const clave = p.clave.trim();
      if (!clave) continue;
      const previa = porClave.get(clave);
      porClave.set(clave, { clave, descripcion: previa?.descripcion || p.descripcion, cantidad: (previa?.cantidad ?? 0) + (p.cantidad || 0) });
    }
    const unicas = [...porClave.values()];

    // Plantillas ya guardadas para esas claves
    const iniciales: Record<string, EstadoPartida> = {};
    if (unicas.length) {
      try {
        const res = await fetch(`/api/plantilla-despiece?detalle=1&claves=${encodeURIComponent(unicas.map(p => p.clave).join(','))}`);
        const json = await res.json();
        if (res.ok) {
          for (const [clave, fila] of Object.entries(json.plantillas as Record<string, { bom: PlantillaBOM }>)) {
            iniciales[clave] = { bom: fila.bom, origen: 'cache' };
          }
        }
      } catch {
        // Sin conexión con la API: las tarjetas aparecen "sin plano"
      }
    }

    setProyecto(prj as Proyecto);
    setPartidas(unicas);
    setEstados(iniciales);
    setLoading(false);
  }, [proyectoId]);

  useEffect(() => {
    async function init() {
      await cargar();
    }
    void init();
  }, [cargar]);

  /* ── Datos derivados ── */
  const listas = partidas.filter(p => estados[p.clave]?.bom).length;
  const pendientes = partidas.filter(p => estados[p.clave]?.archivo && !estados[p.clave]?.bom);
  const entrega = proyecto?.descripcion?.match(/Entrega:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? '';
  const ocupado = analizandoClave !== null;

  const stats = useMemo(() => [
    { icono: User, label: 'Cliente', valor: proyecto?.cliente || '—' },
    { icono: Calendar, label: 'Entrega', valor: entrega ? fechaCorta(entrega) : '—' },
    { icono: Package, label: 'Partidas', valor: String(partidas.length) },
    { icono: Ruler, label: 'Planos', valor: `${listas}/${partidas.length} listos` },
  ], [proyecto, entrega, partidas.length, listas]);

  /* ── Acciones ── */

  /** Manda un plano a /api/analizar-plano y guarda el resultado en el estado de su clave */
  const analizar = async (partida: PartidaProyecto, archivo: File, force: boolean) => {
    setAnalizandoClave(partida.clave);
    actualizar(partida.clave, e => ({ ...e, archivo, analizando: true, error: undefined }));

    const form = new FormData();
    form.append('plano', archivo);
    form.append('clave', partida.clave);
    form.append('descripcion', partida.descripcion);
    form.append('force', force ? 'true' : 'false');

    try {
      const res = await fetch('/api/analizar-plano', { method: 'POST', body: form });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        actualizar(partida.clave, { bom: json.bom, origen: json.source, advertencias: json.advertencias });
      } else {
        actualizar(partida.clave, e => ({ ...e, analizando: false, error: json?.error || `Error ${res.status} al analizar el plano.` }));
      }
    } catch {
      actualizar(partida.clave, e => ({ ...e, analizando: false, error: 'No se pudo contactar al servidor.' }));
    } finally {
      setAnalizandoClave(null);
    }
  };

  /** Plano elegido en una tarjeta. Si la clave ya tenía despiece, se vuelve a analizar de inmediato. */
  const elegirPlano = (partida: PartidaProyecto, archivo: File) => {
    if (archivo.size > MAX_BYTES) {
      actualizar(partida.clave, e => ({ ...e, error: `"${archivo.name}" pesa más de 4.4 MB; redúcelo antes de subirlo.` }));
      return;
    }
    if (estados[partida.clave]?.bom) void analizar(partida, archivo, true);
    else actualizar(partida.clave, e => ({ ...e, archivo, error: undefined }));
  };

  /** "Subir planos": reparte varios PDF entre las partidas según la clave en el nombre del archivo */
  const repartirPlanos = (archivos: FileList | null) => {
    if (!archivos?.length) return;
    const sinPartida: string[] = [];
    let asignados = 0;
    for (const archivo of Array.from(archivos)) {
      const nombre = archivo.name.replace(/\s+/g, '').toUpperCase();
      const partida = partidas.find(p => nombre.includes(p.clave.replace(/\s+/g, '').toUpperCase()));
      if (!partida || archivo.size > MAX_BYTES) { sinPartida.push(archivo.name); continue; }
      if (!estados[partida.clave]?.bom) {
        actualizar(partida.clave, e => ({ ...e, archivo, error: undefined }));
        asignados++;
      }
    }
    setAviso(
      `${asignados} plano(s) asignado(s) por su clave.` +
      (sinPartida.length ? ` No se pudieron asignar (el nombre no trae la clave de una partida, o pesa más de 4.4 MB): ${sinPartida.join(', ')}.` : '')
    );
  };

  /** Analiza uno por uno todos los planos elegidos que aún no tienen despiece */
  const analizarPendientes = async () => {
    const cola = pendientes.map(p => ({ partida: p, archivo: estados[p.clave].archivo as File }));
    setProgreso({ hechos: 0, total: cola.length });
    for (const [i, { partida, archivo }] of cola.entries()) {
      await analizar(partida, archivo, false);
      setProgreso({ hechos: i + 1, total: cola.length });
    }
    setProgreso(null);
  };

  const eliminarPlantilla = async (clave: string) => {
    if (!window.confirm(`¿Eliminar la plantilla de despiece de ${clave}? Afecta a todos los proyectos que usen esa clave.`)) return;
    const res = await fetch(`/api/plantilla-despiece?clave=${encodeURIComponent(clave)}`, { method: 'DELETE' });
    if (res.ok) actualizar(clave, {});
    else actualizar(clave, e => ({ ...e, error: 'No se pudo eliminar la plantilla.' }));
  };

  const descargarMatriz = async () => {
    if (!proyecto) return;
    setGenerandoMatriz(true);
    try {
      const res = await fetch('/api/generar-matriz-corte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente: proyecto.cliente || '',
          nombre_proyecto: [proyecto.codigo, proyecto.cliente].filter(Boolean).join(' - '),
          fecha_entrega: entrega,
          partidas,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Error ${res.status}`);
      const blob = await res.blob();
      const nombre = decodeURIComponent(res.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''([^;]+)/)?.[1] || 'MATRIZ_DE_CORTE.xlsx');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setAviso('No se pudo generar la Matriz de Corte: ' + (err instanceof Error ? err.message : 'error desconocido'));
    } finally {
      setGenerandoMatriz(false);
    }
  };

  /* ── Render ── */

  const partidaEnCurso = partidas.find(p => p.clave === analizandoClave);
  const boton = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 min-h-[44px] text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto px-2 sm:px-0 pb-8">
      <Link
        href="/admin/proyectos"
        className="lg:ml-8 inline-flex items-center gap-2 text-xs font-semibold text-white/70 hover:text-white bg-white/[0.07] hover:bg-white/[0.12] border border-white/15 px-4 py-2.5 min-h-[44px] rounded-xl backdrop-blur-md transition-all"
      >
        <ArrowLeft className="w-4 h-4" /> Volver a Proyectos
      </Link>

      {/* ═══ HEADER DEL PROYECTO ═══ */}
      <div className={`${TARJETA} p-5 sm:p-6 space-y-5`}>
        <div>
          <p className="text-sm font-mono text-white/40">{proyecto?.codigo || (loading ? 'Cargando…' : '—')}</p>
          <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">
            {proyecto ? [proyecto.nombre, proyecto.cliente].filter(Boolean).join(' - ') : loading ? ' ' : 'Proyecto no encontrado'}
          </h1>
        </div>
        {proyecto && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.map(({ icono: Icono, label, valor }) => (
              <div key={label} className="bg-white/[0.05] rounded-xl p-4 min-w-0">
                <Icono className="w-4 h-4 text-white/40" />
                <p className="text-xs text-white/40 uppercase tracking-wider mt-2">{label}</p>
                <p className="text-base sm:text-lg font-semibold text-white truncate">{valor}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-300 font-semibold bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">{error}</p>}

      {loading ? (
        <div className="py-16 flex justify-center items-center gap-2 text-white/50 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400" /> Cargando proyecto...
        </div>
      ) : proyecto && (
        <>
          {/* ═══ BARRA DE ACCIONES ═══ */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
              <button type="button" onClick={() => inputPlanos.current?.click()} disabled={ocupado} className={`${boton} bg-white/[0.08] hover:bg-white/[0.12] text-white/80`}>
                <Paperclip className="w-4 h-4" /> Subir planos
              </button>
              <input ref={inputPlanos} type="file" accept=".pdf,application/pdf" multiple className="hidden" onChange={e => { repartirPlanos(e.target.files); e.target.value = ''; }} />

              <button type="button" onClick={analizarPendientes} disabled={ocupado || pendientes.length === 0} className={`${boton} bg-blue-600 hover:bg-blue-500 text-white`}>
                {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Analizar pendientes ({pendientes.length})
              </button>

              <button
                type="button"
                onClick={descargarMatriz}
                disabled={generandoMatriz || ocupado || partidas.length === 0 || listas < partidas.length}
                title={listas < partidas.length ? `Faltan ${partidas.length - listas} plano(s) por analizar` : 'Descargar la Matriz de Corte en Excel'}
                className={`${boton} bg-white/[0.08] hover:bg-white/[0.12] text-white/80`}
              >
                {generandoMatriz ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                Descargar Matriz de Corte
              </button>

              <Link href={`/admin/proyectos/${proyecto.id}/despiece`} className={`${boton} sm:ml-auto border border-white/15 hover:bg-white/[0.08] text-white/60`}>
                <Layers className="w-4 h-4" /> Avance por áreas
              </Link>
            </div>

            {(progreso || partidaEnCurso) && (
              <div className="bg-white/[0.05] rounded-xl p-4 space-y-2" role="status">
                <p className="text-sm text-white/80 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400 flex-shrink-0" />
                  <span className="truncate">Analizando: {partidaEnCurso?.descripcion || partidaEnCurso?.clave || '...'}</span>
                  {progreso && <span className="ml-auto font-mono text-xs text-white/60 flex-shrink-0">{progreso.hechos}/{progreso.total} planos</span>}
                </p>
                {progreso && (
                  <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500/70 transition-all duration-500" style={{ width: `${Math.max(4, (progreso.hechos / progreso.total) * 100)}%` }} />
                  </div>
                )}
              </div>
            )}

            {aviso && (
              <p className="text-xs text-white/70 bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 flex items-start gap-3">
                <span className="flex-1">{aviso}</span>
                <button type="button" onClick={() => setAviso('')} className="text-white/40 hover:text-white underline flex-shrink-0">Cerrar</button>
              </p>
            )}
          </div>

          {/* ═══ PARTIDAS ═══ */}
          {partidas.length === 0 ? (
            <div className={`${TARJETA} p-8 text-center text-sm text-white/60`}>
              Este proyecto no tiene partidas con clave. Las claves vienen del PDF del pedido.
            </div>
          ) : (
            <div className="space-y-3">
              {partidas.map(p => (
                <PartidaCard
                  key={p.clave}
                  clave={p.clave}
                  descripcion={p.descripcion}
                  cantidad={p.cantidad}
                  cliente={proyecto?.cliente || ''}
                  proyecto={proyecto?.codigo || ''}
                  estado={estados[p.clave] ?? {}}
                  ocupado={ocupado}
                  onArchivo={archivo => elegirPlano(p, archivo)}
                  onAnalizar={() => { const archivo = estados[p.clave]?.archivo; if (archivo) void analizar(p, archivo, false); }}
                  onEliminar={() => eliminarPlantilla(p.clave)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
