'use client';

/**
 * NotificationBellAdmin.tsx
 * ─────────────────────────
 * Campanita del dashboard del admin: las últimas 20 notificaciones de la planta
 * (avisos de retraso, proyectos nuevos...), con un "ding-dong" cuando llegan nuevas.
 *
 * "Leída" en la base pertenece al destinatario (casi siempre un operador), así que
 * el admin NO la cambia: recuerda en su navegador hasta qué momento ya vio todo.
 * Un mismo aviso se manda una vez a cada operador: aquí se muestra una sola vez,
 * con cuántos lo recibieron.
 * Suena solo cuando aparecen notificaciones más nuevas que las de la consulta
 * anterior, nunca en la primera carga.
 *
 * RUTA: src/components/dashboard/NotificationBellAdmin.tsx
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { playNotificacion } from '@/lib/mobiSound';

interface Notificacion {
  id: string;
  tipo: string | null;
  mensaje: string | null;
  proyecto_id: string | null;
  created_at: string;
  proyectos: { codigo: string | null } | { codigo: string | null }[] | null;
}

const CLAVE_VISTO = 'sula-admin-notificaciones-vistas';
// Se piden de más porque cada aviso viene repetido una vez por destinatario
const LIMITE = 100;
const MOSTRAR = 20;
const CADA_MS = 30_000;

function hace(iso: string) {
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `Hace ${h} h` : `Hace ${Math.floor(h / 24)} d`;
}

interface Aviso extends Notificacion { destinatarios: number }

/** Junta las copias del mismo aviso (mismo mensaje, proyecto y minuto) */
function agrupar(filas: Notificacion[]): Aviso[] {
  const grupos = new Map<string, Aviso>();
  for (const n of filas) {
    const clave = `${n.mensaje}|${n.proyecto_id}|${n.created_at.slice(0, 16)}`;
    const g = grupos.get(clave);
    if (g) g.destinatarios++;
    else grupos.set(clave, { ...n, destinatarios: 1 });
  }
  return [...grupos.values()].slice(0, MOSTRAR);
}

const codigoDe = (n: Notificacion) => (Array.isArray(n.proyectos) ? n.proyectos[0] : n.proyectos)?.codigo || '';
const urgente = (n: Notificacion) => /retras|atras|urgent|incidenc/i.test(`${n.tipo} ${n.mensaje}`);

export function NotificationBellAdmin() {
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState<Aviso[]>([]);
  const [vistoHasta, setVistoHasta] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);
  const masNueva = useRef<number | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('notificaciones')
      .select('id, tipo, mensaje, proyecto_id, created_at, proyectos ( codigo )')
      .order('created_at', { ascending: false })
      .limit(LIMITE);
    if (error) return;
    const filas = (data ?? []) as unknown as Notificacion[];
    const nueva = filas.length ? Date.parse(filas[0].created_at) : 0;
    // Suena solo si llegó algo después de la consulta anterior (no al abrir la página)
    if (masNueva.current !== null && nueva > masNueva.current) playNotificacion();
    masNueva.current = nueva;
    setLista(agrupar(filas));
  }, []);

  useEffect(() => {
    const leerVisto = () => {
      try { setVistoHasta(Number(localStorage.getItem(CLAVE_VISTO)) || 0); } catch { /* sin almacenamiento */ }
    };
    const primero = setTimeout(() => { leerVisto(); void cargar(); }, 0);
    // Solo consulta con la pestaña a la vista
    const intervalo = setInterval(() => { if (document.visibilityState === 'visible') void cargar(); }, CADA_MS);
    const fuera = (e: MouseEvent) => { if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    return () => { clearTimeout(primero); clearInterval(intervalo); document.removeEventListener('mousedown', fuera); };
  }, [cargar]);

  const sinLeer = lista.filter(n => Date.parse(n.created_at) > vistoHasta).length;
  const marcarVistas = () => {
    const ahora = Date.now();
    setVistoHasta(ahora);
    try { localStorage.setItem(CLAVE_VISTO, String(ahora)); } catch { /* sin almacenamiento */ }
  };

  return (
    <div className="relative" ref={contenedor}>
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        aria-label={sinLeer ? `Notificaciones: ${sinLeer} nuevas` : 'Notificaciones'}
        aria-expanded={abierto}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] text-white/70 hover:bg-white/[0.12] hover:text-white transition-colors"
      >
        <Bell className="h-4 w-4" />
        {sinLeer > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {sinLeer > 9 ? '9+' : sinLeer}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 top-12 z-50 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/15 bg-[#0a0e1a]/97 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/60">Notificaciones</p>
            <button type="button" onClick={marcarVistas} disabled={!sinLeer} className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 disabled:text-white/25">
              <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
            </button>
          </div>
          {lista.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-white/40">Sin notificaciones.</p>
          ) : (
            <ul className="max-h-[360px] divide-y divide-white/[0.06] overflow-y-auto">
              {lista.map(n => {
                const nueva = Date.parse(n.created_at) > vistoHasta;
                const contenido = (
                  <span className="flex items-start gap-2.5 px-4 py-3">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${urgente(n) ? 'bg-red-500' : 'bg-amber-400'} ${nueva ? '' : 'opacity-30'}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-xs leading-snug ${nueva ? 'font-semibold text-white' : 'text-white/60'}`}>{n.mensaje || n.tipo || 'Notificación'}</span>
                      <span className="block text-[10px] text-white/40">
                        {[codigoDe(n), n.destinatarios > 1 ? `a ${n.destinatarios} personas` : '', hace(n.created_at)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </span>
                );
                return (
                  <li key={n.id}>
                    {n.proyecto_id ? (
                      <Link href={`/admin/proyectos/${n.proyecto_id}`} onClick={() => setAbierto(false)} className="block hover:bg-white/[0.05]">{contenido}</Link>
                    ) : contenido}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
