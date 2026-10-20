'use client';

/**
 * NotificacionesDispositivo.tsx
 * ─────────────────────────────
 * Sección de "Mi perfil": activar, probar o quitar las notificaciones push en el
 * dispositivo que se está usando (cada celular o computadora se activa por separado).
 *
 * RUTA: src/components/NotificacionesDispositivo.tsx
 */

import { useEffect, useState } from 'react';
import { BellOff, BellRing, Loader2, Send } from 'lucide-react';
import { activarPush, desactivarPush, estadoPush, probarPush, type EstadoPush } from '@/lib/push-cliente';

const TEXTO: Record<EstadoPush, string> = {
  activo: 'Activadas en este dispositivo: te llegan los atrasos aunque la app esté cerrada.',
  inactivo: 'Desactivadas en este dispositivo.',
  bloqueado: 'El navegador tiene bloqueadas las notificaciones de SULA MOB. Actívalas en los ajustes del sitio (candado junto a la dirección) o en Ajustes → Notificaciones del celular.',
  'instalar-primero': 'En iPhone primero instala la app: botón Compartir → "Agregar a pantalla de inicio", ábrela desde ahí y vuelve aquí.',
  'no-soportado': 'Este navegador no permite notificaciones push. Usa Chrome en Android o la app instalada en iPhone.',
};

export function NotificacionesDispositivo({ tarjeta }: { tarjeta: string }) {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    let vigente = true;
    void estadoPush().then(e => { if (vigente) setEstado(e); });
    return () => { vigente = false; };
  }, []);

  const hacer = async (accion: () => Promise<{ ok: boolean; error?: string } | void>, exito: string) => {
    setOcupado(true);
    setMensaje(null);
    const r = await accion();
    setEstado(await estadoPush());
    setOcupado(false);
    setMensaje(r && !r.ok ? { ok: false, texto: r.error ?? 'No se pudo.' } : { ok: true, texto: exito });
  };

  const boton = 'inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold disabled:opacity-40 sm:flex-none';

  return (
    <section className={`${tarjeta} space-y-3 p-5 sm:p-6`}>
      <h2 className="flex items-center gap-2 text-sm font-bold text-white"><BellRing className="h-4 w-4 text-blue-400" /> Notificaciones en este dispositivo</h2>
      {estado === null ? (
        <p className="flex items-center gap-2 text-xs text-white/50"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Revisando...</p>
      ) : (
        <p className={`text-xs leading-relaxed ${estado === 'activo' ? 'text-emerald-300' : estado === 'inactivo' ? 'text-white/60' : 'text-amber-300'}`}>{TEXTO[estado]}</p>
      )}
      {mensaje && (
        <p role="status" className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${mensaje.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>{mensaje.texto}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {estado === 'inactivo' && (
          <button type="button" disabled={ocupado} onClick={() => hacer(activarPush, 'Listo: las notificaciones quedaron activadas.')} className={`${boton} bg-blue-600 text-white hover:bg-blue-500`}>
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Activar notificaciones
          </button>
        )}
        {estado === 'activo' && (
          <>
            <button type="button" disabled={ocupado} onClick={() => hacer(probarPush, 'Enviada: debe llegarte en unos segundos.')} className={`${boton} bg-blue-600 text-white hover:bg-blue-500`}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar prueba
            </button>
            <button type="button" disabled={ocupado} onClick={() => hacer(desactivarPush, 'Notificaciones quitadas de este dispositivo.')} className={`${boton} border border-white/15 bg-white/[0.05] text-white/70 hover:text-white`}>
              <BellOff className="h-4 w-4" /> Quitar
            </button>
          </>
        )}
      </div>
    </section>
  );
}
