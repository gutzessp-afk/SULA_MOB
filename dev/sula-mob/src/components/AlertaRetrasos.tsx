'use client';

/**
 * AlertaRetrasos.tsx
 * ──────────────────
 * Cuando un operador reporta un atraso, en cualquier página del admin:
 *   - suena un tono de celular (y vibra en celulares que lo permiten),
 *   - aparece arriba un aviso con el motivo, el área, el operador y el proyecto,
 *     que lleva a Reportes (retrasos de operadores), y la campanita se actualiza al momento.
 *
 * Se entera de dos formas, la que llegue primero:
 *   - En vivo (Supabase Realtime), si la tabla `retrasos` está en la publicación
 *     (sql/realtime_notificaciones.sql).
 *   - Revisando cada 5 s con la pestaña a la vista, por si Realtime no está activo.
 * Solo avisa de los atrasos que llegan después de abrir el panel, y una vez cada uno.
 * Los navegadores no dejan sonar nada hasta que el usuario toca la página por primera vez.
 *
 * RUTA: src/components/AlertaRetrasos.tsx
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { playAlertaRetraso } from '@/lib/mobiSound';
import { useAvisos } from '@/components/dashboard/NotificationBellAdmin';

interface Retraso {
  id: string;
  motivo: string | null;
  descripcion: string | null;
  tiempo_estimado_retraso: number | null;
  created_at: string;
  proyecto_id: string | null;
  areas: { nombre: string } | { nombre: string }[] | null;
  usuarios: { nombre: string | null; apellidos: string | null } | { nombre: string | null; apellidos: string | null }[] | null;
  proyectos: { codigo: string | null } | { codigo: string | null }[] | null;
}

const COLUMNAS = 'id, motivo, descripcion, tiempo_estimado_retraso, created_at, proyecto_id, areas (nombre), usuarios (nombre, apellidos), proyectos (codigo)';
const CADA_MS = 5_000;
const VISIBLE_MS = 15_000;
const MAX_AVISOS = 3;
const uno = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x);

export function AlertaRetrasos() {
  const [avisos, setAvisos] = useState<Retraso[]>([]);
  // Para que la campanita muestre el atraso en cuanto llega, sin esperar su consulta de cada 30 s
  const campana = useAvisos();
  const recargarCampana = useRef(campana?.recargar);
  useEffect(() => { recargarCampana.current = campana?.recargar; });
  const vistos = useRef(new Set<string>());
  // Solo cuentan los atrasos posteriores a este momento (el más reciente al abrir el panel)
  const desde = useRef<string | null>(null);

  const quitar = useCallback((id: string) => setAvisos(a => a.filter(x => x.id !== id)), []);

  const avisar = useCallback((nuevos: Retraso[]) => {
    const frescos = nuevos.filter(r => !vistos.current.has(r.id));
    if (!frescos.length) return;
    for (const r of frescos) {
      vistos.current.add(r.id);
      if (!desde.current || r.created_at > desde.current) desde.current = r.created_at;
      setTimeout(() => quitar(r.id), VISIBLE_MS);
    }
    playAlertaRetraso();
    recargarCampana.current?.();
    setAvisos(a => [...frescos.reverse(), ...a].slice(0, MAX_AVISOS));
  }, [quitar]);

  /** Atrasos posteriores al último que ya se conoce */
  const revisar = useCallback(async () => {
    if (!desde.current) return;
    const { data } = await supabase.from('retrasos').select(COLUMNAS).gt('created_at', desde.current).order('created_at').limit(10);
    if (data?.length) avisar(data as unknown as Retraso[]);
  }, [avisar]);

  useEffect(() => {
    let activo = true;
    // Punto de partida: el atraso más reciente que ya existe (no se avisa de los viejos)
    const inicio = setTimeout(async () => {
      const { data } = await supabase.from('retrasos').select('id, created_at').order('created_at', { ascending: false }).limit(1);
      if (!activo) return;
      desde.current = data?.[0]?.created_at ?? new Date().toISOString();
      if (data?.[0]) vistos.current.add(data[0].id);
    }, 0);

    // En vivo: el evento solo trae la fila; se piden el área, el operador y el proyecto
    const canal = supabase
      .channel(`alerta-retrasos-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'retrasos' }, async ({ new: fila }) => {
        const id = (fila as { id?: string }).id;
        if (!id || vistos.current.has(id)) return;
        const { data } = await supabase.from('retrasos').select(COLUMNAS).eq('id', id).maybeSingle();
        if (activo && data) avisar([data as unknown as Retraso]);
      })
      .subscribe();

    // Respaldo: revisa cada 5 s con la pestaña a la vista
    const intervalo = setInterval(() => { if (document.visibilityState === 'visible') void revisar(); }, CADA_MS);
    const alVolver = () => { if (document.visibilityState === 'visible') void revisar(); };
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      activo = false;
      clearTimeout(inicio);
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
      void supabase.removeChannel(canal);
    };
  }, [avisar, revisar]);

  if (!avisos.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[80] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-96" aria-live="assertive">
      {avisos.map(r => {
        const area = uno(r.areas)?.nombre;
        const u = uno(r.usuarios);
        const operador = u ? `${u.nombre ?? ''} ${u.apellidos ?? ''}`.trim() : '';
        const codigo = uno(r.proyectos)?.codigo;
        return (
          <div key={r.id} role="alert" className="sula-entrada pointer-events-auto flex items-start gap-3 rounded-2xl border border-red-500/40 bg-[#1a0d10]/95 p-3.5 shadow-2xl shadow-black/60 backdrop-blur-xl">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/20 text-red-400">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-300">Nuevo reporte de atraso{codigo ? ` · ${codigo}` : ''}</p>
              <p className="mt-0.5 text-sm font-semibold leading-snug text-white">{r.motivo || 'Sin motivo'}</p>
              <p className="mt-0.5 text-xs text-white/60">
                {[area, operador, r.tiempo_estimado_retraso ? `${r.tiempo_estimado_retraso} h` : ''].filter(Boolean).join(' · ')}
              </p>
              {r.descripcion && <p className="mt-1 line-clamp-2 text-xs italic text-white/55">“{r.descripcion}”</p>}
              <Link href={`/admin/reportes?retraso=${r.id}#incidencias`} onClick={() => quitar(r.id)} className="mt-2 inline-flex min-h-[32px] items-center text-xs font-bold text-blue-400 hover:underline">
                Ver en reportes →
              </Link>
            </div>
            <button type="button" onClick={() => quitar(r.id)} aria-label="Cerrar aviso" className="-m-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
