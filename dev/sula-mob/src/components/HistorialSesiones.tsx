'use client';

/**
 * HistorialSesiones.tsx
 * ─────────────────────
 * Pestaña "Entradas y salidas" del Historial (/admin/despiece/historial): quién entró y
 * quién salió del sistema, con fecha y hora. Datos de /api/historial (tabla activity_log,
 * se llena en el login y en "Cerrar sesión"). Se piden de 50 en 50 con "Ver más".
 *
 * RUTA: src/components/HistorialSesiones.tsx
 */

import { useEffect, useState } from 'react';
import { Loader2, LogIn, LogOut } from 'lucide-react';
import { ZONA_HORARIA } from '@/lib/entregas';
import type { RegistroHistorial } from '@/app/api/historial/route';

export type FiltroSesion = 'todos' | 'login' | 'logout';

const POR_PAGINA = 50;

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { timeZone: ZONA_HORARIA, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit' });
const diaMexico = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA });

const ROL: Record<string, string> = { admin: 'Administrador', operador: 'Operador' };

export function HistorialSesiones({ desde, usuario, filtro }: { desde: Date | null; usuario: string; filtro: FiltroSesion }) {
  const [registros, setRegistros] = useState<RegistroHistorial[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const desdeDia = desde ? diaMexico(desde) : '';

  // Filtros nuevos: vuelve a la primera página (se ajusta durante el render, no en un efecto)
  const llave = `${desdeDia}|${usuario}|${filtro}`;
  const [llaveActual, setLlaveActual] = useState(llave);
  if (llave !== llaveActual) {
    setLlaveActual(llave);
    setPagina(1);
    setCargando(true);
  }

  useEffect(() => {
    let vigente = true;
    const params = new URLSearchParams({ tipo: filtro === 'todos' ? 'login,logout' : filtro, limite: String(POR_PAGINA), pagina: String(pagina) });
    if (desdeDia) params.set('desde', desdeDia);
    if (usuario.trim()) params.set('usuario', usuario.trim());
    fetch(`/api/historial?${params}`)
      .then(async res => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
        if (!vigente) return;
        setRegistros(prev => (pagina === 1 ? json.registros : [...prev, ...json.registros]));
        setTotal(json.total);
        setError('');
      })
      .catch(err => { if (vigente) setError(err instanceof Error ? err.message : 'No se pudo cargar el historial.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [desdeDia, usuario, filtro, pagina]);

  if (error) return <p className="p-6 text-center text-sm text-red-300">{error}</p>;
  if (total === null) {
    return (
      <div className="flex items-center justify-center gap-2 p-12 text-sm text-white/50">
        <Loader2 className="w-5 h-5 animate-spin text-cyan-400" /> Cargando entradas y salidas...
      </div>
    );
  }
  if (registros.length === 0) {
    return <p className="p-12 text-center text-sm text-white/40">{cargando ? 'Cargando...' : 'No hay entradas ni salidas con esos filtros.'}</p>;
  }

  // Agrupadas por día
  const grupos: { dia: string; filas: RegistroHistorial[] }[] = [];
  for (const r of registros) {
    const dia = fecha(r.created_at);
    if (grupos.at(-1)?.dia !== dia) grupos.push({ dia, filas: [] });
    grupos.at(-1)!.filas.push(r);
  }

  return (
    <div className={cargando ? 'opacity-70 transition-opacity' : ''}>
      {grupos.map(g => (
        <section key={g.dia}>
          <h3 className="sticky top-0 z-[1] px-5 sm:px-6 py-2 text-[11px] font-bold uppercase tracking-wider text-white/45 bg-[#0d1117]/90 backdrop-blur border-y border-white/[0.06] capitalize">{g.dia}</h3>
          <ol className="divide-y divide-white/[0.06]">
            {g.filas.map(r => {
              const entro = r.tipo === 'login';
              const rol = typeof r.detalle?.rol === 'string' ? r.detalle.rol : '';
              return (
                <li key={r.id} className="flex items-center gap-3 sm:gap-4 px-5 sm:px-6 py-3">
                  <span className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${entro ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' : 'text-white/55 bg-white/[0.06] border-white/15'}`}>
                    {entro ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">
                      <span className="font-semibold">{r.usuario_nombre || 'Desconocido'}</span>
                      <span className={entro ? 'text-emerald-300' : 'text-white/55'}> {entro ? 'entró' : 'salió'}</span>
                    </p>
                    {rol && <p className="text-[11px] text-white/40">{ROL[rol] ?? rol}</p>}
                  </div>
                  <time dateTime={r.created_at} className="font-mono text-sm font-bold text-white/80 flex-shrink-0">{hora(r.created_at)}</time>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {registros.length < total && (
        <div className="p-4 text-center border-t border-white/10">
          <button
            type="button"
            disabled={cargando}
            onClick={() => { setCargando(true); setPagina(p => p + 1); }}
            className="min-h-[44px] px-5 rounded-xl bg-white/[0.06] border border-white/15 text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {cargando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Ver más ({total - registros.length})
          </button>
        </div>
      )}
    </div>
  );
}
