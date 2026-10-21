'use client';

/**
 * NotificacionesDispositivo.tsx
 * ─────────────────────────────
 * Sección de "Mi perfil": activar, probar o quitar las notificaciones push en el
 * dispositivo que se está usando (cada celular o computadora se activa por separado).
 * Si el navegador está suscrito pero el servidor no pudo guardarlo, lo dice y deja reintentar.
 *
 * RUTA: src/components/NotificacionesDispositivo.tsx
 */

import { useEffect, useState } from 'react';
import { BellOff, BellRing, Loader2, RefreshCw, Send } from 'lucide-react';
import { activarPush, desactivarPush, estadoPush, probarPush, refrescarPush, type EstadoPush } from '@/lib/push-cliente';

type Estado = EstadoPush | 'sin-guardar';

const TEXTO: Record<Estado, string> = {
  activo: 'Te llegan los atrasos aunque la app esté cerrada.',
  inactivo: 'Actívalas para enterarte de los atrasos aunque la app esté cerrada.',
  'sin-guardar': 'Este dispositivo dio permiso, pero el servidor no pudo guardarlo: todavía no te llegarán.',
  bloqueado: 'El navegador tiene bloqueadas las notificaciones de SULA MOB. Actívalas en los ajustes del sitio (candado junto a la dirección) o en Ajustes → Notificaciones del celular.',
  'instalar-primero': 'En iPhone primero instala la app: botón Compartir → "Agregar a pantalla de inicio", ábrela desde ahí y vuelve aquí.',
  'no-soportado': 'Este navegador no permite notificaciones push. Usa Chrome en Android o la app instalada en iPhone.',
};

const PILDORA: Record<Estado, { texto: string; clase: string }> = {
  activo: { texto: 'Activadas', clase: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300' },
  inactivo: { texto: 'Desactivadas', clase: 'border-white/15 bg-white/[0.06] text-white/60' },
  'sin-guardar': { texto: 'Sin guardar', clase: 'border-red-400/30 bg-red-500/15 text-red-300' },
  bloqueado: { texto: 'Bloqueadas', clase: 'border-amber-400/30 bg-amber-500/15 text-amber-300' },
  'instalar-primero': { texto: 'Instala la app', clase: 'border-amber-400/30 bg-amber-500/15 text-amber-300' },
  'no-soportado': { texto: 'No disponibles', clase: 'border-amber-400/30 bg-amber-500/15 text-amber-300' },
};

export function NotificacionesDispositivo({ tarjeta }: { tarjeta: string }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  // "activo" en el navegador no basta: se confirma que el servidor tenga guardada la suscripción
  const revisar = async (): Promise<{ estado: Estado; error?: string }> => {
    const e = await estadoPush();
    if (e !== 'activo') return { estado: e };
    const r = await refrescarPush();
    return r.ok ? { estado: 'activo' } : { estado: 'sin-guardar', error: r.error ?? 'No se pudo guardar en el servidor.' };
  };

  useEffect(() => {
    let vigente = true;
    void revisar().then(r => {
      if (!vigente) return;
      setEstado(r.estado);
      if (r.error) setMensaje({ ok: false, texto: r.error });
    });
    return () => { vigente = false; };
  }, []);

  const hacer = async (accion: () => Promise<{ ok: boolean; error?: string } | void>, exito: string) => {
    setOcupado(true);
    setMensaje(null);
    const r = await accion();
    const revision = await revisar();
    setEstado(revision.estado);
    if (r && !r.ok) setMensaje({ ok: false, texto: r.error ?? 'No se pudo.' });
    else if (revision.error) setMensaje({ ok: false, texto: revision.error });
    else setMensaje({ ok: true, texto: exito });
    setOcupado(false);
  };

  const boton = 'inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors disabled:opacity-40 sm:flex-none';
  const pildora = estado ? PILDORA[estado] : null;

  return (
    <section className={`${tarjeta} p-5 sm:p-6`}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400 ring-1 ring-inset ring-blue-400/20">
          <BellRing className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-sm font-bold text-white sm:text-base">Notificaciones en este dispositivo</h2>
            {pildora && (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${pildora.clase}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" /> {pildora.texto}
              </span>
            )}
          </div>
          {estado === null ? (
            <p className="mt-1 flex items-center gap-2 text-xs text-white/50"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Revisando...</p>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-white/55">{TEXTO[estado]}</p>
          )}
        </div>
      </div>

      {mensaje && (
        <p role="status" className={`mt-4 rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${mensaje.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>{mensaje.texto}</p>
      )}

      {(estado === 'inactivo' || estado === 'activo' || estado === 'sin-guardar') && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
          {estado === 'inactivo' && (
            <button type="button" disabled={ocupado} onClick={() => hacer(activarPush, 'Listo: las notificaciones quedaron activadas.')} className={`${boton} bg-blue-600 text-white hover:bg-blue-500`}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Activar notificaciones
            </button>
          )}
          {estado === 'sin-guardar' && (
            <button type="button" disabled={ocupado} onClick={() => hacer(refrescarPush, 'Listo: el dispositivo quedó guardado.')} className={`${boton} bg-blue-600 text-white hover:bg-blue-500`}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Reintentar
            </button>
          )}
          {estado === 'activo' && (
            <button type="button" disabled={ocupado} onClick={() => hacer(probarPush, 'Enviada: debe llegarte en unos segundos.')} className={`${boton} bg-blue-600 text-white hover:bg-blue-500`}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar prueba
            </button>
          )}
          {estado !== 'inactivo' && (
            <button type="button" disabled={ocupado} onClick={() => hacer(desactivarPush, 'Notificaciones quitadas de este dispositivo.')} className={`${boton} border border-white/15 bg-white/[0.05] text-white/70 hover:bg-white/[0.09] hover:text-white`}>
              <BellOff className="h-4 w-4" /> Quitar
            </button>
          )}
        </div>
      )}
    </section>
  );
}
