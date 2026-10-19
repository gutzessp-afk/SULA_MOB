'use client';

/**
 * PanelNotificaciones.tsx
 * ───────────────────────
 * Las 5 notificaciones más recientes en el dashboard, con las no vistas resaltadas
 * y un enlace al centro de notificaciones. Comparte datos con la campanita
 * (useAvisosAdmin), así que "Marcar vistas" se refleja en los dos.
 *
 * RUTA: src/components/dashboard/PanelNotificaciones.tsx
 */

import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { codigoDe, hace, urgente, type AvisosAdmin } from '@/components/dashboard/NotificationBellAdmin';

export function PanelNotificaciones({ avisos }: { avisos: AvisosAdmin }) {
  const { lista, cargando, sinLeer, esNueva, marcarVistas } = avisos;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 whitespace-nowrap text-sm font-bold text-white">
          <Bell className="h-4 w-4 text-amber-400" />
          Notificaciones
          {sinLeer > 0 && (
            <span className="min-w-[18px] rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">{sinLeer}</span>
          )}
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          {sinLeer > 0 && (
            <button type="button" onClick={marcarVistas} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-white/50 hover:text-white" title="Marcar todas como vistas" aria-label="Marcar todas como vistas">
              <CheckCheck className="h-3.5 w-3.5" /> <span className="hidden xl:inline">Vistas</span>
            </button>
          )}
          <Link href="/admin/notificaciones" className="inline-flex min-h-[36px] items-center whitespace-nowrap px-1 text-[11px] font-semibold text-blue-400 hover:underline">Ver todas →</Link>
        </div>
      </div>

      {cargando ? (
        <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-white/[0.04]" />)}</div>
      ) : lista.length === 0 ? (
        <p className="py-6 text-center text-xs text-white/35">Sin notificaciones</p>
      ) : (
        <ul className="space-y-2">
          {lista.slice(0, 5).map(n => {
            const nueva = esNueva(n);
            const contenido = (
              <>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${urgente(n) ? 'bg-red-500' : 'bg-blue-400'} ${nueva ? '' : 'opacity-30'}`} />
                <span className="min-w-0">
                  <span className={`line-clamp-2 text-xs leading-snug ${nueva ? 'font-semibold text-white' : 'text-white/60'}`}>{n.mensaje || n.tipo || 'Notificación'}</span>
                  <span className="mt-1 block text-[10px] text-white/35">
                    {[codigoDe(n), n.destinatarios > 1 ? `a ${n.destinatarios} personas` : '', hace(n.created_at)].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </>
            );
            const caja = 'flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5';
            return (
              <li key={n.id}>
                {n.href
                  ? <Link href={n.href} className={`${caja} hover:bg-white/[0.06] transition-colors`}>{contenido}</Link>
                  : <div className={caja}>{contenido}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
