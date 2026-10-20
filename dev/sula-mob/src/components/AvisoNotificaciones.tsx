'use client';

/**
 * AvisoNotificaciones.tsx
 * ───────────────────────
 * Con la app instalada en el celular, invita a activar las notificaciones push
 * (llegan aunque la app esté cerrada, como las de cualquier app). El permiso solo
 * se puede pedir tras tocar un botón. Si se cierra el aviso, vuelve en 7 días;
 * siempre se pueden activar o quitar desde "Mi perfil".
 * Con el permiso ya dado, en cada visita vuelve a guardar la suscripción.
 *
 * RUTA: src/components/AvisoNotificaciones.tsx
 */

import { useEffect, useState } from 'react';
import { BellRing, Loader2, X } from 'lucide-react';
import { activarPush, estadoPush, refrescarPush } from '@/lib/push-cliente';

const CLAVE_CERRADO = 'sula-aviso-push-cerrado';
const SIETE_DIAS = 7 * 86_400_000;

export function AvisoNotificaciones() {
  const [visible, setVisible] = useState(false);
  const [activando, setActivando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    const t = setTimeout(async () => {
      const estado = await estadoPush();
      if (estado === 'activo') { void refrescarPush(); return; }
      const instalada = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      let cerrado = 0;
      try { cerrado = Number(localStorage.getItem(CLAVE_CERRADO)) || 0; } catch { /* sin almacenamiento */ }
      if (vigente && instalada && estado === 'inactivo' && Date.now() - cerrado > SIETE_DIAS) setVisible(true);
    }, 1500);
    return () => { vigente = false; clearTimeout(t); };
  }, []);

  const cerrar = () => {
    setVisible(false);
    try { localStorage.setItem(CLAVE_CERRADO, String(Date.now())); } catch { /* sin almacenamiento */ }
  };

  const activar = async () => {
    setActivando(true);
    setError('');
    const r = await activarPush();
    setActivando(false);
    if (r.ok) setVisible(false);
    else setError(r.error ?? 'No se pudieron activar.');
  };

  if (!visible) return null;
  return (
    <div className="fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[75] sm:left-auto sm:right-4 sm:w-96" role="dialog" aria-label="Activar notificaciones">
      <div className="sula-entrada rounded-2xl border border-blue-400/30 bg-[#0b0f17]/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
            <BellRing className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white">Activa las notificaciones</p>
            <p className="mt-0.5 text-xs leading-snug text-white/60">Te avisamos en el celular cuando un operador reporte un atraso, aunque la app esté cerrada.</p>
          </div>
          <button type="button" onClick={cerrar} aria-label="Ahora no" className="-m-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="mt-2 text-xs font-semibold text-red-300">{error}</p>}
        <button
          type="button"
          onClick={activar}
          disabled={activando}
          className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {activando ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Activar notificaciones
        </button>
      </div>
    </div>
  );
}
