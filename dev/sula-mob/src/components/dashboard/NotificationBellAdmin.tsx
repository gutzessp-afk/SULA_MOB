'use client';

/**
 * NotificationBellAdmin.tsx
 * ─────────────────────────
 * Notificaciones del admin: las últimas 20 de la planta (avisos de retraso,
 * proyectos nuevos...), con un "ding-dong" cuando llegan nuevas.
 *
 *   - useAvisosAdmin(): carga, agrupa y recuerda qué ya vio el admin. El dashboard
 *     lo llama una vez y comparte el resultado con la campanita y el panel.
 *   - NotificationBellAdmin: la campanita con su menú (hoja desde abajo en celular).
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

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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

export interface Aviso extends Notificacion {
  destinatarios: number;
  /** A dónde lleva al tocarlo: los atrasos a Reportes (retrasos de operadores), lo demás al proyecto */
  href: string | null;
}

interface FilaRetraso {
  id: string;
  motivo: string | null;
  created_at: string;
  proyecto_id: string | null;
  areas: { nombre: string } | { nombre: string }[] | null;
  proyectos: { codigo: string | null } | { codigo: string | null }[] | null;
}

const CLAVE_VISTO = 'sula-admin-notificaciones-vistas';
// Se piden de más porque cada aviso viene repetido una vez por destinatario
const LIMITE = 100;
const MOSTRAR = 20;
// Respaldo por si Realtime no está activo; con Realtime llegan al instante
const CADA_MS = 15_000;

export function hace(iso: string) {
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `Hace ${h} h` : `Hace ${Math.floor(h / 24)} d`;
}

/** Junta las copias del mismo aviso (mismo mensaje, proyecto y minuto) */
function agrupar(filas: Notificacion[]): Aviso[] {
  const grupos = new Map<string, Aviso>();
  for (const n of filas) {
    const clave = `${n.mensaje}|${n.proyecto_id}|${n.created_at.slice(0, 16)}`;
    const g = grupos.get(clave);
    if (g) g.destinatarios++;
    else grupos.set(clave, { ...n, destinatarios: 1, href: n.proyecto_id ? `/admin/proyectos/${n.proyecto_id}` : null });
  }
  return [...grupos.values()];
}

/** Un atraso reportado por un operador, como aviso de la campanita */
function avisoDeRetraso(r: FilaRetraso): Aviso {
  const area = (Array.isArray(r.areas) ? r.areas[0] : r.areas)?.nombre;
  return {
    id: `retraso-${r.id}`,
    tipo: 'retraso',
    mensaje: `Atraso${area ? ` en ${area}` : ''}: ${r.motivo || 'sin motivo'}`,
    proyecto_id: r.proyecto_id,
    created_at: r.created_at,
    proyectos: r.proyectos,
    destinatarios: 1,
    href: `/admin/reportes?retraso=${r.id}#incidencias`,
  };
}

export const codigoDe = (n: Notificacion) => (Array.isArray(n.proyectos) ? n.proyectos[0] : n.proyectos)?.codigo || '';
export const urgente = (n: Notificacion) => /retras|atras|urgent|incidenc|falla|falta/i.test(`${n.tipo} ${n.mensaje}`);

export interface AvisosAdmin {
  lista: Aviso[];
  cargando: boolean;
  esNueva: (n: Aviso) => boolean;
  sinLeer: number;
  marcarVistas: () => void;
  /** Vuelve a consultar ya (por ejemplo, cuando llega un atraso en vivo) */
  recargar: () => void;
}

/**
 * Avisos de la campanita: las notificaciones (agrupadas) y los atrasos que reportan los
 * operadores, leídos directo de `retrasos` (los reportes por pieza no crean notificación).
 * Las notificaciones de tipo "retraso" se omiten para no repetir el mismo atraso.
 * En vivo: se vuelve a consultar en cuanto entra una notificación o un atraso (Supabase
 * Realtime, sql/realtime_notificaciones.sql); además, cada 15 s con la pestaña a la vista.
 */
export function useAvisosAdmin(): AvisosAdmin {
  const [lista, setLista] = useState<Aviso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [vistoHasta, setVistoHasta] = useState(0);
  const masNueva = useRef<number | null>(null);

  const cargar = useCallback(async () => {
    const [notifRes, retrasosRes] = await Promise.all([
      supabase
        .from('notificaciones')
        .select('id, tipo, mensaje, proyecto_id, created_at, proyectos ( codigo )')
        .or('tipo.is.null,tipo.neq.retraso')
        .order('created_at', { ascending: false })
        .limit(LIMITE),
      supabase
        .from('retrasos')
        .select('id, motivo, created_at, proyecto_id, areas ( nombre ), proyectos ( codigo )')
        .order('created_at', { ascending: false })
        .limit(MOSTRAR),
    ]);
    setCargando(false);
    if (notifRes.error && retrasosRes.error) return;
    const filas = (notifRes.data ?? []) as unknown as Notificacion[];
    // Suena solo si llegó una notificación después de la consulta anterior (no al abrir la página).
    // Los atrasos ya tienen su propio tono de celular (AlertaRetrasos): aquí no suenan dos veces.
    const anterior = masNueva.current;
    if (anterior !== null && filas.some(f => Date.parse(f.created_at) > anterior)) playNotificacion();
    masNueva.current = filas.length ? Date.parse(filas[0].created_at) : 0;
    const avisos = [...agrupar(filas), ...((retrasosRes.data ?? []) as unknown as FilaRetraso[]).map(avisoDeRetraso)];
    setLista(avisos.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, MOSTRAR));
  }, []);

  useEffect(() => {
    const primero = setTimeout(() => {
      try { setVistoHasta(Number(localStorage.getItem(CLAVE_VISTO)) || 0); } catch { /* sin almacenamiento */ }
      void cargar();
    }, 0);
    const intervalo = setInterval(() => { if (document.visibilityState === 'visible') void cargar(); }, CADA_MS);
    // Un aviso llega una vez por destinatario: se juntan los eventos y se consulta una sola vez
    let espera: ReturnType<typeof setTimeout> | null = null;
    const alCambiar = () => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => void cargar(), 400);
    };
    const canal = supabase
      .channel(`campana-admin-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones' }, alCambiar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'retrasos' }, alCambiar)
      .subscribe();
    return () => {
      clearTimeout(primero);
      clearInterval(intervalo);
      if (espera) clearTimeout(espera);
      void supabase.removeChannel(canal);
    };
  }, [cargar]);

  const esNueva = (n: Aviso) => Date.parse(n.created_at) > vistoHasta;
  const marcarVistas = () => {
    const ahora = Date.now();
    setVistoHasta(ahora);
    try { localStorage.setItem(CLAVE_VISTO, String(ahora)); } catch { /* sin almacenamiento */ }
  };

  return { lista, cargando, esNueva, sinLeer: lista.filter(esNueva).length, marcarVistas, recargar: () => void cargar() };
}

/* ── Un solo juego de avisos para todo el panel (campanita, dashboard y alerta de atrasos) ── */

const AvisosContexto = createContext<AvisosAdmin | null>(null);

export function AvisosAdminProvider({ children }: { children: ReactNode }) {
  const avisos = useAvisosAdmin();
  return <AvisosContexto.Provider value={avisos}>{children}</AvisosContexto.Provider>;
}

/** Los avisos del panel; fuera de AvisosAdminProvider devuelve null */
export function useAvisos(): AvisosAdmin | null {
  return useContext(AvisosContexto);
}

/** Encabezado y lista del menú (igual en el panel flotante y en la hoja del celular) */
function ContenidoAvisos({ avisos, alElegir, alto }: { avisos: AvisosAdmin; alElegir: () => void; alto: string }) {
  const { lista, sinLeer, esNueva, marcarVistas } = avisos;
  return (
    <>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/60">Notificaciones</p>
        <button type="button" onClick={marcarVistas} disabled={!sinLeer} className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 disabled:text-white/25">
          <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
        </button>
      </div>
      {lista.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-white/40">Sin notificaciones.</p>
      ) : (
        <ul className={`${alto} divide-y divide-white/[0.06] overflow-y-auto`}>
          {lista.map(n => {
            const nueva = esNueva(n);
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
                {n.href ? (
                  <Link href={n.href} onClick={alElegir} className="block hover:bg-white/[0.05]">{contenido}</Link>
                ) : contenido}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export function NotificationBellAdmin({ avisos, alinear = 'derecha' }: { avisos: AvisosAdmin; alinear?: 'derecha' | 'izquierda' }) {
  const [abierto, setAbierto] = useState(false);
  const [movil, setMovil] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const hoja = useRef<HTMLDivElement>(null);
  const { sinLeer } = avisos;

  useEffect(() => {
    // En celular el panel sale como hoja desde abajo en vez de flotar junto al botón
    const consulta = window.matchMedia('(max-width: 639px)');
    const medir = () => setMovil(consulta.matches);
    consulta.addEventListener('change', medir);
    const primero = setTimeout(medir, 0);
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (contenedor.current?.contains(t) || hoja.current?.contains(t)) return;
      setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => { clearTimeout(primero); document.removeEventListener('mousedown', fuera); consulta.removeEventListener('change', medir); };
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const conTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('keydown', conTecla);
    const antes = document.body.style.overflow;
    if (movil) document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', conTecla); document.body.style.overflow = antes; };
  }, [abierto, movil]);

  const cerrar = () => setAbierto(false);

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

      {abierto && !movil && (
        <div className={`absolute ${alinear === 'izquierda' ? 'left-0' : 'right-0'} top-full mt-2 z-[60] w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/15 bg-[#0b0f17] shadow-2xl shadow-black/60 animate-in fade-in slide-in-from-top-2 duration-150`} role="dialog" aria-label="Notificaciones">
          <ContenidoAvisos avisos={avisos} alElegir={cerrar} alto="max-h-[360px]" />
        </div>
      )}

      {/* La hoja va directo en <body>: dentro del encabezado (con blur y animación) "fixed" no se pega a la pantalla */}
      {abierto && movil && createPortal(
        <div ref={hoja}>
          <div className="fixed inset-0 z-[70] bg-black/60 animate-in fade-in duration-150" onClick={cerrar} aria-hidden="true" />
          <div className="sula-hoja fixed inset-x-0 bottom-0 z-[71] max-h-[75vh] overflow-hidden rounded-t-2xl border-t border-white/15 bg-[#0b0f17] pb-[env(safe-area-inset-bottom)] shadow-2xl" role="dialog" aria-label="Notificaciones">
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
            <ContenidoAvisos avisos={avisos} alElegir={cerrar} alto="max-h-[60vh]" />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
