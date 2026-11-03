'use client';

/**
 * Planeación de tiempos de un proyecto — /admin/proyectos/[id]/tiempos
 * ────────────────────────────────────────────────────────────────────
 * Opcional: el admin captura cuántos días estimados tardará cada área y el sistema
 * arma las fechas (una área tras otra) y el término estimado contra la entrega.
 *
 * El plan se guarda en este navegador (lib/plan-almacen.ts); a la base solo se le
 * LEEN el proyecto, las áreas y el avance real. Sin plan, el proyecto se ve igual
 * que siempre en el resto del sistema.
 *
 * RUTA: src/app/admin/proyectos/[id]/tiempos/page.tsx
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CalendarClock, Info, Loader2, Save, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDatos } from '@/lib/cache-datos';
import { fechaEntrega, fechaHoy, fechaLegible } from '@/lib/entregas';
import { almacenDisponible, guardarPlan, quitarPlan, type Plan } from '@/lib/plan-almacen';
import { armarPlan, estimarTermino, nivelMargen, type TramoPlan } from '@/lib/plan-tiempos';
import { usePlanes } from '@/hooks/usePlanes';
import { useAreasActivas, useAvanceReal } from '@/hooks/useAvanceReal';

interface Proyecto {
  id: string;
  codigo: string;
  nombre: string;
  cliente?: string | null;
  referencia_sucursal?: string | null;
  descripcion?: string | null;
  fecha_maxima?: string | null;
}

const TARJETA = 'rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]';
const INPUT = 'max-sm:text-base max-sm:min-h-[44px] h-[40px] rounded-xl border border-white/20 bg-white/[0.07] px-3 text-sm text-white outline-none focus:border-cyan-400/60 placeholder:text-white/30 transition-colors';
const DIAS_MAX = 365;

const COLOR_MARGEN = { verde: 'text-emerald-300', ambar: 'text-amber-300', rojo: 'text-red-300' };

/** Días capturados como texto → número, o null si no es válido (mayor que 0 y hasta 365) */
function diasValidos(texto: string): number | null {
  const n = Number(texto.trim().replace(',', '.'));
  return texto.trim() !== '' && Number.isFinite(n) && n > 0 && n <= DIAS_MAX ? n : null;
}

export default function PlanTiemposPage() {
  const { id: proyectoId } = useParams<{ id: string }>();

  const { datos: proyecto, cargando, error: errorProyecto } = useDatos(`proyecto-tiempos:${proyectoId}`, async () => {
    const { data, error } = await supabase
      .from('proyectos')
      .select('id, codigo, nombre, cliente, referencia_sucursal, descripcion, fecha_maxima')
      .eq('id', proyectoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Proyecto | null) ?? null;
  });
  const { areas } = useAreasActivas();
  const { avance } = useAvanceReal(useMemo(() => [proyectoId], [proyectoId]));
  const planGuardado = usePlanes()[proyectoId] ?? null;

  // Formulario: los cambios del admin; lo que no ha tocado sale del plan guardado o de los valores por defecto
  const [fechaInicio, setFechaInicio] = useState<string | null>(null);
  const [contarFines, setContarFines] = useState<boolean | null>(null);
  const [incluir, setIncluir] = useState<Record<string, boolean>>({});
  const [dias, setDias] = useState<Record<string, string>>({});
  const [hoy, setHoy] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // Hoy en México, ya montada la pantalla (así coincide con el render del servidor)
  useEffect(() => {
    const t = setTimeout(() => setHoy(fechaHoy()), 0);
    return () => clearTimeout(t);
  }, []);

  const avanceProyecto = avance[proyectoId];
  /** El pedido no usa el área: todos sus productos están al 100% desde el alta */
  const areaCompleta = (areaId: string) => (avanceProyecto?.[areaId] ?? 0) >= 1;
  const guardadaDe = (areaId: string) => planGuardado?.areas.find(a => a.areaId === areaId);

  const inicioActual = fechaInicio ?? planGuardado?.fechaInicio ?? hoy;
  const contarActual = contarFines ?? planGuardado?.contarFinesSemana ?? false;
  // Un área al 100% ya no se puede seleccionar: queda fuera del plan aunque antes estuviera incluida
  const incluida = (areaId: string) => !areaCompleta(areaId) && (incluir[areaId] ?? (planGuardado ? !!guardadaDe(areaId) : true));
  const diasTexto = (areaId: string) => dias[areaId] ?? (guardadaDe(areaId) ? String(guardadaDe(areaId)!.dias) : '');

  // Plan con las áreas incluidas que ya tienen días válidos: se recalcula al teclear
  const areasPlan = areas
    .map((a, orden) => ({ areaId: a.id, dias: diasValidos(diasTexto(a.id)), orden }))
    .filter((a): a is { areaId: string; dias: number; orden: number } => incluida(a.areaId) && a.dias !== null);
  const plan = inicioActual ? armarPlan(inicioActual, contarActual, areasPlan) : null;
  const tramoDe = (areaId: string): TramoPlan | undefined => plan?.tramos.find(t => t.areaId === areaId);

  const entrega = proyecto ? fechaEntrega(proyecto) : '';
  const estimacion = plan && plan.tramos.length > 0 && hoy ? estimarTermino(plan, avanceProyecto ?? {}, hoy, entrega) : null;

  const handleGuardar = () => {
    setAviso(null);
    const incluidas = areas.filter(a => incluida(a.id));
    if (incluidas.length === 0) {
      setAviso({ tipo: 'error', texto: 'Incluye al menos un área en el plan.' });
      return;
    }
    const invalidas = incluidas.filter(a => diasValidos(diasTexto(a.id)) === null);
    if (invalidas.length > 0) {
      setAviso({ tipo: 'error', texto: `Captura días válidos (mayor que 0 y hasta ${DIAS_MAX}) en: ${invalidas.map(a => a.nombre).join(', ')}.` });
      return;
    }
    if (!inicioActual) {
      setAviso({ tipo: 'error', texto: 'Elige la fecha de inicio del plan.' });
      return;
    }
    const nuevo: Plan = {
      fechaInicio: inicioActual,
      contarFinesSemana: contarActual,
      areas: areasPlan,
      actualizadoEn: new Date().toISOString(),
    };
    if (!guardarPlan(proyectoId, nuevo)) {
      setAviso({ tipo: 'error', texto: 'No se pudo guardar el plan: este navegador no permite guardar datos (modo privado o sitio bloqueado).' });
      return;
    }
    // Lo guardado pasa a ser la base del formulario
    setFechaInicio(null); setContarFines(null); setIncluir({}); setDias({});
    setAviso({ tipo: 'ok', texto: 'Plan guardado.' });
  };

  const handleQuitar = () => {
    if (!window.confirm('¿Quitar el plan de tiempos de este proyecto?\n\nEl proyecto vuelve a verse como antes. No se borra nada de la base.')) return;
    if (!quitarPlan(proyectoId)) {
      setAviso({ tipo: 'error', texto: 'No se pudo quitar el plan: este navegador no permite modificar sus datos guardados.' });
      return;
    }
    setFechaInicio(null); setContarFines(null); setIncluir({}); setDias({});
    setAviso({ tipo: 'ok', texto: 'Plan quitado. El proyecto se ve como antes.' });
  };

  // Comprueba que el almacenamiento responda, para avisar desde el inicio si no se podrá guardar
  useEffect(() => {
    const t = setTimeout(() => {
      if (!almacenDisponible()) setAviso({ tipo: 'error', texto: 'Este navegador no permite guardar datos: el plan no se podrá guardar.' });
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const celdaFecha = (f: string | undefined) => (f ? fechaLegible(f) : <span className="text-white/30">—</span>);

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto px-2 sm:px-0 pb-8">
      {/* Volver (el margen en escritorio deja libre el botón que oculta el menú lateral) */}
      <Link
        href="/admin/proyectos"
        className="lg:ml-8 inline-flex items-center gap-2 text-xs font-semibold text-white/70 hover:text-white bg-white/[0.07] hover:bg-white/[0.12] border border-white/15 px-4 py-2.5 rounded-xl backdrop-blur-md transition-all"
      >
        <ArrowLeft className="w-4 h-4" /> Volver a Proyectos
      </Link>

      {/* HEADER */}
      <div className={`${TARJETA} relative overflow-hidden px-4 py-5 sm:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4`}>
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-violet-950/60 border border-violet-500/40 flex items-center justify-center text-violet-300 flex-shrink-0">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-mono font-bold text-violet-300">{proyecto?.codigo || 'Planeación'}</span>
            <h1 className="text-lg sm:text-2xl font-bold text-white tracking-wide leading-tight truncate">
              {proyecto?.nombre || (cargando ? 'Cargando…' : 'Proyecto no encontrado')}
            </h1>
            <p className="text-[11px] sm:text-xs text-white/65 mt-1">
              Planeación de tiempos{(proyecto?.referencia_sucursal || proyecto?.cliente) ? ` · ${proyecto?.referencia_sucursal || proyecto?.cliente}` : ''}
            </p>
          </div>
        </div>
        {proyecto && (
          <div className="bg-white/[0.05] border border-white/15 px-5 py-2.5 rounded-2xl text-center">
            <div className="text-sm font-black text-cyan-300 font-mono whitespace-nowrap">{entrega ? fechaLegible(entrega) : '—'}</div>
            <div className="text-[10px] text-white/50 uppercase font-bold">Entrega</div>
          </div>
        )}
      </div>

      {errorProyecto && !proyecto && (
        <p className="text-xs text-red-300 font-semibold bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">{errorProyecto}</p>
      )}
      {aviso && (
        <p className={`text-xs font-semibold rounded-xl px-4 py-3 border ${aviso.tipo === 'error' ? 'text-red-300 bg-red-500/10 border-red-500/25' : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25'}`}>
          {aviso.texto}
        </p>
      )}

      {cargando ? (
        <div className="py-16 flex justify-center items-center gap-2 text-white/50 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-violet-300" /> Cargando proyecto...
        </div>
      ) : proyecto ? (
        <div className={`${TARJETA} p-4 sm:p-6 space-y-5`}>
          {/* Parámetros del plan */}
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-white/60">Fecha de inicio del plan</span>
              <input
                type="date"
                value={inicioActual}
                onChange={e => setFechaInicio(e.target.value)}
                className={`${INPUT} w-full sm:w-48 [color-scheme:dark]`}
              />
            </label>
            <label className="max-sm:min-h-[44px] inline-flex items-center gap-2 text-sm text-white/80 cursor-pointer sm:h-[40px]">
              <input type="checkbox" checked={contarActual} onChange={e => setContarFines(e.target.checked)} className="accent-violet-500 w-4 h-4" />
              Contar sábados y domingos
            </label>
          </div>

          {/* Escritorio: tabla */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm text-white/80">
              <thead className="bg-white/[0.07] text-white/60 uppercase text-[11px] font-bold tracking-wider">
                <tr>
                  <th className="px-3 py-3 w-20 text-center">Incluir</th>
                  <th className="px-3 py-3">Área</th>
                  <th className="px-3 py-3 w-36">Días estimados</th>
                  <th className="px-3 py-3 w-36">Inicio plan</th>
                  <th className="px-3 py-3 w-36">Fin plan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {areas.map(a => {
                  const activa = incluida(a.id);
                  const texto = diasTexto(a.id);
                  const malo = activa && texto.trim() !== '' && diasValidos(texto) === null;
                  const tramo = activa ? tramoDe(a.id) : undefined;
                  return (
                    <tr key={a.id} className={activa ? '' : 'opacity-50'}>
                      <td className="px-3 py-2.5 text-center">
                        <input type="checkbox" checked={activa} disabled={areaCompleta(a.id)} title={areaCompleta(a.id) ? 'Esta área ya está al 100%' : undefined} onChange={e => setIncluir({ ...incluir, [a.id]: e.target.checked })} aria-label={`Incluir ${a.nombre}`} className="accent-violet-500 w-4 h-4 disabled:cursor-not-allowed" />
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-white">
                        {a.nombre}
                        {areaCompleta(a.id) && <span className="ml-2 text-[10px] font-bold uppercase text-emerald-400">Completada 100%</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0.5"
                          max={DIAS_MAX}
                          step="0.5"
                          disabled={!activa}
                          value={texto}
                          placeholder="Días"
                          onChange={e => setDias({ ...dias, [a.id]: e.target.value })}
                          aria-invalid={malo}
                          aria-label={`Días estimados de ${a.nombre}`}
                          className={`${INPUT} w-28 font-mono ${malo ? 'border-red-400/70' : ''}`}
                        />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-white/70">{celdaFecha(tramo?.inicio)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-white/70">{celdaFecha(tramo?.fin)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Celular: tarjetas */}
          <div className="md:hidden space-y-2.5">
            {areas.map(a => {
              const activa = incluida(a.id);
              const texto = diasTexto(a.id);
              const malo = activa && texto.trim() !== '' && diasValidos(texto) === null;
              const tramo = activa ? tramoDe(a.id) : undefined;
              return (
                <div key={a.id} className={`rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 space-y-3 ${activa ? '' : 'opacity-50'}`}>
                  <label className="min-h-[44px] flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={activa} disabled={areaCompleta(a.id)} onChange={e => setIncluir({ ...incluir, [a.id]: e.target.checked })} className="accent-violet-500 w-5 h-5 disabled:cursor-not-allowed" />
                    <span className="font-semibold text-white">{a.nombre}</span>
                    {areaCompleta(a.id) && <span className="text-[10px] font-bold uppercase text-emerald-400">Completada 100%</span>}
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.5"
                    max={DIAS_MAX}
                    step="0.5"
                    disabled={!activa}
                    value={texto}
                    placeholder="Días estimados"
                    onChange={e => setDias({ ...dias, [a.id]: e.target.value })}
                    aria-invalid={malo}
                    aria-label={`Días estimados de ${a.nombre}`}
                    className={`${INPUT} w-full font-mono ${malo ? 'border-red-400/70' : ''}`}
                  />
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><p className="text-[10px] uppercase font-bold text-white/40">Inicio plan</p><p className="text-white/75">{celdaFecha(tramo?.inicio)}</p></div>
                    <div><p className="text-[10px] uppercase font-bold text-white/40">Fin plan</p><p className="text-white/75">{celdaFecha(tramo?.fin)}</p></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Resumen */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/80">
            {!estimacion ? (
              <span className="text-white/50">Captura los días de al menos un área para ver el término estimado.</span>
            ) : estimacion.estado === 'terminado' ? (
              <span className="text-emerald-300 font-semibold">Todas las áreas del plan están al 100%.</span>
            ) : (
              <span>
                Término estimado: <strong className="text-white">{fechaLegible(estimacion.fin)}</strong>
                {entrega && <> · Entrega: <strong className="text-white">{fechaLegible(entrega)}</strong></>}
                {estimacion.margen !== null && (
                  <> · <strong className={COLOR_MARGEN[nivelMargen(estimacion.margen)]}>
                    {Math.abs(estimacion.margen)} día{Math.abs(estimacion.margen) === 1 ? '' : 's'} de {estimacion.margen < 0 ? 'riesgo' : 'margen'}
                  </strong></>
                )}
              </span>
            )}
          </div>

          <p className="flex items-center gap-1.5 text-[11px] text-white/45">
            <Info className="w-3.5 h-3.5 flex-shrink-0" /> El plan se guarda en este navegador y no se comparte con otros equipos.
          </p>

          {/* Acciones */}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2 border-t border-white/10">
            {planGuardado && (
              <button
                type="button"
                onClick={handleQuitar}
                className="max-sm:min-h-[44px] bg-red-500/20 hover:bg-red-500/35 text-red-200 border border-red-400/30 text-xs font-bold px-5 py-3 rounded-xl inline-flex items-center justify-center gap-2 transition-all"
              >
                <Trash2 className="w-4 h-4 text-red-400" /> Quitar plan
              </button>
            )}
            <button
              type="button"
              onClick={handleGuardar}
              className="max-sm:min-h-[44px] bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold px-6 py-3 rounded-xl inline-flex items-center justify-center gap-2 shadow-lg shadow-blue-950/50 transition-all"
            >
              <Save className="w-4 h-4" /> Guardar plan
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
