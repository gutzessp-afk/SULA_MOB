'use client';

/**
 * Dashboard del admin — /admin/dashboard
 * ──────────────────────────────────────
 * Layout vertical para trabajar:
 *   encabezado → 5 indicadores → actividad de 30 días + notificaciones →
 *   tabla de proyectos activos → panal de áreas + matriz proyecto × área.
 * Los datos salen de la caché (useDatos): se muestran al instante si ya se habían
 * cargado y se actualizan solos cada minuto mientras la pestaña está a la vista.
 *
 * RUTA: src/app/admin/dashboard/page.tsx
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { cargarProyectos, cargarTodas, useDatos } from '@/lib/cache-datos';
import { TemaToggle } from '@/components/TemaToggle';
import { BadgePrioridad } from '@/components/BadgePrioridad';
import { HexagonGrid } from '@/components/dashboard/HexagonGrid';
import { HeatMatrix, type FilaCalor } from '@/components/dashboard/HeatMatrix';
import { StatCards, type StatCard } from '@/components/dashboard/StatCards';
import { NotificationBellAdmin, useAvisosAdmin } from '@/components/dashboard/NotificationBellAdmin';
import { PanelNotificaciones } from '@/components/dashboard/PanelNotificaciones';
import { EnVivo } from '@/components/EnVivo';
import { useRealtimeAvances } from '@/hooks/useRealtimeAvances';
import type { DiaActividad } from '@/components/dashboard/ActividadAvances';
import { ETIQUETA_ESTADO, estadoEntrega, fechaEntrega, fechaHoy, fechaLegible, ZONA_HORARIA, type EstadoEntrega } from '@/lib/entregas';
import { AlertTriangle, Bell, Calendar, CheckCircle2, Download, FolderOpen, Gauge, RefreshCw } from 'lucide-react';

// Recharts pesa ~100 KB: se descarga aparte para que lo demás aparezca primero
const ActividadAvances = dynamic(() => import('@/components/dashboard/ActividadAvances'), {
  ssr: false,
  loading: () => <div className="h-[200px] animate-pulse rounded-xl bg-white/[0.04]" />,
});

interface Proyecto {
  id: string;
  codigo: string;
  nombre: string;
  progreso: number;
  cliente?: string;
  prioridad?: string;
  created_at?: string;
  descripcion?: string;
  fecha_maxima?: string | null;
}

interface Area {
  id: string;
  nombre: string;
  activo: boolean;
  peso?: number;
}

interface AvanceEstacion {
  producto_id?: string;
  area_id: string;
  porcentaje: number;
  completado: boolean;
  piezas_totales?: number;
  piezas_completadas?: number;
}

interface AvanceDia { piezas: number | null; created_at: string }

const REFRESCO_MS = 60_000;
const DIAS_ACTIVIDAD = 30;
const MAX_TABLA = 10;

const diaMexico = (d: Date | string) => new Date(d).toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA });

/** Avance de una fila de producto_area_avance (piezas si las tiene; si no, su porcentaje) */
const pctFila = (f: AvanceEstacion) => (f.piezas_totales && f.piezas_totales > 0
  ? Math.min(100, Math.round(((f.piezas_completadas || 0) / f.piezas_totales) * 100))
  : f.porcentaje || (f.completado ? 100 : 0));

/** "Actualizado hace 2 min": se recalcula cada 15 s */
function UltimaActualizacion({ en, actualizando }: { en: number | null; actualizando: boolean }) {
  const [ahora, setAhora] = useState(0);
  useEffect(() => {
    const tic = () => setAhora(Date.now());
    const primero = setTimeout(tic, 0);
    const intervalo = setInterval(tic, 15_000);
    return () => { clearTimeout(primero); clearInterval(intervalo); };
  }, [en]);

  let texto = 'Conectando con la base...';
  if (en && ahora) {
    const segundos = Math.max(0, Math.round((ahora - en) / 1000));
    texto = segundos < 60 ? 'Actualizado hace un momento' : `Actualizado hace ${Math.round(segundos / 60)} min`;
  }
  return (
    <span className="inline-flex items-center gap-1.5" aria-live="polite">
      <span className={`h-1.5 w-1.5 rounded-full ${actualizando ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
      {actualizando && en ? 'Actualizando...' : texto}
    </span>
  );
}

/** Fecha larga de hoy; vacía hasta montar para que no difiera de la del servidor */
function FechaHoy() {
  const [texto, setTexto] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      const f = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      setTexto(f.charAt(0).toUpperCase() + f.slice(1));
    }, 0);
    return () => clearTimeout(t);
  }, []);
  return <>{texto}</>;
}

/** Avances de los últimos N días (Supabase entrega máximo 1000 filas por petición) */
async function cargarAvancesRecientes(dias: number): Promise<AvanceDia[]> {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const filas: AvanceDia[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await supabase.from('avances').select('piezas, created_at').gte('created_at', desde).order('created_at').range(i, i + 999);
    if (error) throw new Error(error.message);
    filas.push(...((data ?? []) as AvanceDia[]));
    if (!data || data.length < 1000) return filas;
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const datosProyectos = useDatos('proyectos', () => cargarProyectos<Proyecto>());
  const datosAreas = useDatos('areas', async () => {
    const { data, error } = await supabase.from('areas').select('*').order('orden', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Area[];
  });
  const datosAvances = useDatos('avance-areas', () => cargarTodas<AvanceEstacion>('producto_area_avance'));
  const datosProductos = useDatos('productos-proyecto', () => cargarTodas<{ id: string; proyecto_id: string }>('proyecto_productos', 'id, proyecto_id'));
  // Avances de los últimos 30 días: la gráfica de actividad y qué áreas trabajaron hoy
  const datosActividad = useDatos('avances-30d', () => cargarAvancesRecientes(DIAS_ACTIVIDAD));
  const datosRecientes = useDatos('avances-24h', async () => {
    const { data, error } = await supabase
      .from('avances')
      .select('area_id, created_at')
      .gte('created_at', new Date(Date.now() - 86_400_000).toISOString())
      .limit(1000);
    if (error) throw new Error(error.message);
    return (data ?? []) as { area_id: string; created_at: string }[];
  });
  const avisos = useAvisosAdmin();

  const proyectos = useMemo(() => datosProyectos.datos ?? [], [datosProyectos.datos]);
  const areas = useMemo(() => datosAreas.datos ?? [], [datosAreas.datos]);
  const avances = useMemo(() => datosAvances.datos ?? [], [datosAvances.datos]);
  const actualizando = datosProyectos.actualizando || datosAreas.actualizando || datosAvances.actualizando;
  const cargandoProyectos = datosProyectos.cargando;

  const fetchMetrics = () => Promise.all([
    datosProyectos.recargar(), datosAreas.recargar(), datosAvances.recargar(),
    datosProductos.recargar(), datosActividad.recargar(), datosRecientes.recargar(),
  ]);
  const actualizadoEn = [datosProyectos.actualizadoEn, datosAreas.actualizadoEn, datosAvances.actualizadoEn].every(Boolean)
    ? Math.min(datosProyectos.actualizadoEn!, datosAreas.actualizadoEn!, datosAvances.actualizadoEn!)
    : null;

  // En vivo: cuando un operador registra piezas se recarga solo (el refresco de cada minuto queda de respaldo)
  const enVivo = useRealtimeAvances(() => void fetchMetrics());

  // Se actualiza solo cada minuto mientras la pestaña está a la vista, y al volver a ella
  const sincronizar = useRef(fetchMetrics);
  useEffect(() => {
    sincronizar.current = fetchMetrics;
  });
  useEffect(() => {
    const siVisible = () => { if (document.visibilityState === 'visible') void sincronizar.current(); };
    const intervalo = setInterval(siVisible, REFRESCO_MS);
    document.addEventListener('visibilitychange', siVisible);
    return () => { clearInterval(intervalo); document.removeEventListener('visibilitychange', siVisible); };
  }, []);

  // Estado de entrega de cada proyecto (misma regla que alertas y calendario)
  const estadoDe = useMemo(() => {
    const mapa = new Map<string, EstadoEntrega>();
    for (const p of proyectos) mapa.set(p.id, estadoEntrega(Number(p.progreso) || 0, fechaEntrega(p)));
    return mapa;
  }, [proyectos]);
  const cuenta = (...estados: EstadoEntrega[]) => proyectos.filter(p => estados.includes(estadoDe.get(p.id)!)).length;

  // Activos: primero los atrasados, luego los que se entregan antes; sin fecha al final
  const activos = useMemo(() => {
    const orden = (p: Proyecto) => (estadoDe.get(p.id) === 'atrasado' ? 0 : 1);
    return proyectos
      .filter(p => { const e = estadoDe.get(p.id); return e === 'en_proceso' || e === 'pendiente' || e === 'atrasado'; })
      .sort((a, b) => orden(a) - orden(b) || (fechaEntrega(a) || '9999').localeCompare(fechaEntrega(b) || '9999') || (Number(b.progreso) || 0) - (Number(a.progreso) || 0));
  }, [proyectos, estadoDe]);
  const topProyectos = activos.slice(0, MAX_TABLA);

  // Rendimiento por área: promedio del avance de cada producto en esa área
  const rendimientoAreas = useMemo(() => areas.map(area => {
    const filas = avances.filter(a => a.area_id === area.id);
    let hechas = 0;
    let totales = 0;
    for (const f of filas) {
      if (f.piezas_totales && f.piezas_totales > 0) {
        totales += f.piezas_totales;
        hechas += Math.min(f.piezas_completadas || 0, f.piezas_totales);
      }
    }
    const rendimiento = filas.length ? Math.round(filas.reduce((s, f) => s + pctFila(f), 0) / filas.length) : 0;
    return { ...area, rendimiento, piezasCompletadas: hechas, piezasTotales: totales, productos: filas.length };
  }), [areas, avances]);

  // Panal: áreas activas en el orden del flujo (el que se define en Áreas), con su actividad de las últimas 24 h
  const estaciones = useMemo(() => {
    const recientes = datosRecientes.datos ?? [];
    return rendimientoAreas
      .filter(a => a.activo)
      .map(a => ({
        id: a.id, nombre: a.nombre, rendimiento: a.rendimiento, hechas: a.piezasCompletadas, totales: a.piezasTotales,
        productos: a.productos, actividad: recientes.filter(x => x.area_id === a.id).length,
      }));
  }, [rendimientoAreas, datosRecientes.datos]);

  // Matriz de calor: avance de cada proyecto en cada área (promedio de sus productos)
  const celdasCalor = useMemo(() => {
    const proyectoDe = new Map((datosProductos.datos ?? []).map(x => [x.id, x.proyecto_id]));
    const suma = new Map<string, { total: number; n: number }>();
    for (const f of avances) {
      const proyecto = f.producto_id ? proyectoDe.get(f.producto_id) : undefined;
      if (!proyecto) continue;
      const clave = `${proyecto}|${f.area_id}`;
      const g = suma.get(clave) ?? { total: 0, n: 0 };
      g.total += pctFila(f); g.n++;
      suma.set(clave, g);
    }
    return new Map([...suma].map(([k, g]) => [k, Math.round(g.total / g.n)]));
  }, [avances, datosProductos.datos]);
  const filasCalor: FilaCalor[] = activos.slice(0, 8).map(p => ({ id: p.id, codigo: p.codigo, nombre: p.nombre }));

  // Eficiencia: piezas terminadas contra programadas en todas las áreas (sin piezas, el avance promedio)
  const piezas = avances.reduce((t, f) => (f.piezas_totales && f.piezas_totales > 0
    ? { hechas: t.hechas + Math.min(f.piezas_completadas || 0, f.piezas_totales), totales: t.totales + f.piezas_totales }
    : t), { hechas: 0, totales: 0 });
  const eficienciaGlobal = piezas.totales
    ? Math.round((piezas.hechas / piezas.totales) * 100)
    : proyectos.length ? Math.round(proyectos.reduce((s, p) => s + (Number(p.progreso) || 0), 0) / proyectos.length) : 0;

  // Actividad: avances por día de los últimos 30 días (también los días sin avances), acumulados
  const actividad = useMemo<DiaActividad[]>(() => {
    const porDia = new Map<string, { avances: number; piezas: number }>();
    for (const a of datosActividad.datos ?? []) {
      const d = diaMexico(a.created_at);
      const g = porDia.get(d) ?? { avances: 0, piezas: 0 };
      g.avances++; g.piezas += a.piezas || 0;
      porDia.set(d, g);
    }
    // Días contados desde hoy (México) a mediodía UTC para que restar días nunca cruce de fecha
    const hoy = Date.parse(`${fechaHoy()}T12:00:00Z`);
    const dias = Array.from({ length: DIAS_ACTIVIDAD }, (_, i) => new Date(hoy - (DIAS_ACTIVIDAD - 1 - i) * 86_400_000).toISOString().slice(0, 10));
    return dias.reduce<DiaActividad[]>((acc, dia) => {
      const g = porDia.get(dia) ?? { avances: 0, piezas: 0 };
      acc.push({ dia, ...g, total: (acc.at(-1)?.total ?? 0) + g.avances });
      return acc;
    }, []);
  }, [datosActividad.datos]);
  const avancesMes = actividad.at(-1)?.total ?? 0;

  const tarjetas: StatCard[] = [
    { icono: FolderOpen, titulo: 'Activos', valor: activos.length, color: 'bg-sky-500/80', detalle: 'Proyectos sin terminar' },
    { icono: CheckCircle2, titulo: 'Completados', valor: cuenta('completado'), color: 'bg-emerald-500/80', detalle: 'Proyectos al 100%' },
    { icono: AlertTriangle, titulo: 'Atrasados', valor: cuenta('atrasado'), color: 'bg-red-500/80', detalle: 'Pasaron su fecha de entrega sin terminar' },
    { icono: Gauge, titulo: 'Eficiencia', valor: eficienciaGlobal, sufijo: '%', color: 'bg-violet-500/80',
      detalle: piezas.totales ? `${piezas.hechas.toLocaleString('es-MX')} de ${piezas.totales.toLocaleString('es-MX')} piezas terminadas en todas las áreas` : 'Avance promedio de los proyectos' },
    { icono: Bell, titulo: 'Alertas pendientes', valor: avisos.sinLeer, color: 'bg-amber-500/80', detalle: 'Notificaciones que todavía no has visto' },
  ];

  const exportarReporte = () => {
    const ahora = new Date();
    const fechaStr = fechaHoy();
    const horaStr = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const texto = (t: string | undefined) => `"${(t || '').replace(/"/g, '""')}"`;
    const lines: string[] = [
      'REPORTE DE PRODUCCIÓN — SULA MOB',
      `Fecha de generación:,${fechaStr} ${horaStr}`,
      '',
      '═══ RESUMEN ═══',
      'Métrica,Valor',
      `Proyectos totales,${proyectos.length}`,
      `Activos,${activos.length}`,
      `Completados,${cuenta('completado')}`,
      `Atrasados,${cuenta('atrasado')}`,
      `Eficiencia global,${eficienciaGlobal}%`,
      `Avances en los últimos ${DIAS_ACTIVIDAD} días,${avancesMes}`,
      '',
      '═══ DETALLE POR PROYECTO ═══',
      'Código,Proyecto,Cliente,Prioridad,Progreso %,Estado,Fecha Entrega',
      ...proyectos.map(p => {
        const estado = estadoDe.get(p.id);
        return `${texto(p.codigo)},${texto(p.nombre)},${texto(p.cliente || 'General')},${(p.prioridad || 'media').toUpperCase()},${p.progreso}%,${estado ? ETIQUETA_ESTADO[estado] : ''},${fechaEntrega(p) || '—'}`;
      }),
      '',
      '═══ RENDIMIENTO POR ÁREA ═══',
      'Área,Peso %,Rendimiento %,Piezas Completadas,Piezas Totales',
      ...rendimientoAreas.map(a => `${texto(a.nombre)},${a.peso || 0}%,${a.rendimiento}%,${a.piezasCompletadas},${a.piezasTotales}`),
      '',
      `Generado por SULA MOB — ${fechaStr}`,
    ];
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Reporte_Produccion_SULA_${fechaStr}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const tarjeta = 'rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl';
  const boton = 'flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] text-white/70 hover:bg-white/[0.12] hover:text-white transition-colors';
  const barra = (p: Proyecto) => (estadoDe.get(p.id) === 'atrasado' ? 'bg-red-500' : 'bg-gradient-to-r from-sky-500 to-emerald-400');
  const colorPct = (p: Proyecto) => (estadoDe.get(p.id) === 'atrasado' ? 'text-red-400' : 'text-emerald-400');

  return (
    <div className="mx-auto max-w-7xl space-y-3 px-1 pb-12 text-white sm:space-y-4 sm:px-4">

      {/* ═══ ENCABEZADO ═══ */}
      <header className={`sula-entrada relative z-30 ${tarjeta} flex items-center justify-between gap-3 p-4 sm:p-5`}>
        <div className="min-w-0">
          <h1 className="whitespace-nowrap text-lg font-bold leading-tight text-white sm:text-xl">Panel de Control</h1>
          <p className="mt-0.5 flex items-center gap-x-2 truncate text-[11px] text-white/50">
            <span className="hidden sm:inline"><FechaHoy /> ·</span>
            <UltimaActualizacion en={actualizadoEn} actualizando={actualizando} />
            <EnVivo estado={enVivo} className="ml-1" />
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => void fetchMetrics()} className={boton} title="Actualizar" aria-label="Actualizar">
            <RefreshCw className={`h-4 w-4 ${actualizando ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={exportarReporte} className={`${boton} max-sm:hidden`} title="Exportar CSV" aria-label="Exportar CSV">
            <Download className="h-4 w-4" />
          </button>
          <NotificationBellAdmin avisos={avisos} />
          <TemaToggle />
        </div>
      </header>

      {/* ═══ INDICADORES ═══ */}
      <div className="sula-entrada" style={{ animationDelay: '50ms' }}>
        <StatCards cards={tarjetas} cargando={cargandoProyectos || datosAvances.cargando} />
      </div>

      {/* ═══ ACTIVIDAD + NOTIFICACIONES ═══ */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-5">
        <section className={`sula-entrada ${tarjeta} flex min-w-0 flex-col p-4 sm:p-5 xl:col-span-3`} style={{ animationDelay: '100ms' }}>
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h3 className="whitespace-nowrap text-sm font-bold text-white">Actividad de Avances</h3>
            <span className="truncate text-[10px] uppercase text-white/40">
              {datosActividad.cargando ? '30 días' : <>{avancesMes} <span className="hidden sm:inline">en los últimos</span><span className="sm:hidden">·</span> 30 días</>}
            </span>
          </div>
          <div className="h-[200px] xl:h-auto xl:min-h-[200px] xl:flex-1">
            {datosActividad.cargando
              ? <div className="h-full min-h-[200px] animate-pulse rounded-xl bg-white/[0.04]" />
              : <ActividadAvances datos={actividad} />}
          </div>
        </section>

        <section className={`sula-entrada ${tarjeta} min-w-0 p-4 sm:p-5 xl:col-span-2`} style={{ animationDelay: '150ms' }}>
          <PanelNotificaciones avisos={avisos} />
        </section>
      </div>

      {/* ═══ PROYECTOS ACTIVOS ═══ */}
      <section className={`sula-entrada ${tarjeta} overflow-hidden`} style={{ animationDelay: '200ms' }}>
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
          <h3 className="text-sm font-bold text-white">
            Proyectos activos <span className="font-mono text-white/40">{activos.length}</span>
          </h3>
          <Link href="/admin/proyectos" className="-my-2 whitespace-nowrap py-2 text-[11px] font-semibold text-blue-400 hover:underline">Ver todos<span className="hidden sm:inline"> los proyectos</span> →</Link>
        </div>

        {cargandoProyectos ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map(i => <div key={i} className="h-10 animate-pulse rounded-lg bg-white/[0.05]" />)}</div>
        ) : topProyectos.length === 0 ? (
          <p className="py-8 text-center text-xs text-white/40">No hay proyectos activos.</p>
        ) : (
          <>
            {/* Celular: tarjetas */}
            <div className="divide-y divide-white/[0.06] md:hidden">
              {topProyectos.map(p => (
                <Link key={p.id} href={`/admin/proyectos/${p.id}`} className="block p-3.5 transition-colors active:bg-white/[0.04]">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-blue-400">{p.codigo}</span>
                    <BadgePrioridad prioridad={p.prioridad} />
                  </div>
                  <p className="truncate text-sm font-semibold text-white">{p.nombre}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/40">
                      <div className={`h-full transition-all ${barra(p)}`} style={{ width: `${p.progreso}%` }} />
                    </div>
                    <span className={`font-mono text-[11px] font-bold ${colorPct(p)}`}>{p.progreso}%</span>
                  </div>
                  {estadoDe.get(p.id) === 'atrasado' && (
                    <p className="mt-1.5 text-[10px] font-bold uppercase text-red-400">Atrasado · entrega {fechaLegible(fechaEntrega(p))}</p>
                  )}
                </Link>
              ))}
            </div>

            {/* md en adelante: tabla */}
            <div className="hidden md:block">
              <table className="w-full table-fixed text-left text-sm">
                <thead className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                  <tr className="border-b border-white/[0.06]">
                    <th className="w-28 px-5 py-2.5">Código</th>
                    <th className="px-3 py-2.5">Nombre</th>
                    <th className="hidden w-[18%] px-3 py-2.5 xl:table-cell">Cliente</th>
                    <th className="w-28 px-3 py-2.5">Entrega</th>
                    <th className="w-[18%] px-3 py-2.5">Progreso</th>
                    <th className="w-28 px-5 py-2.5 text-right">Prioridad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {topProyectos.map(p => {
                    const entrega = fechaEntrega(p);
                    const atrasado = estadoDe.get(p.id) === 'atrasado';
                    return (
                      <tr key={p.id} onClick={() => router.push(`/admin/proyectos/${p.id}`)} className="cursor-pointer transition-colors hover:bg-white/[0.04]">
                        <td className="px-5 py-3 font-mono text-xs font-bold text-blue-400">
                          <Link href={`/admin/proyectos/${p.id}`} onClick={e => e.stopPropagation()}>{p.codigo}</Link>
                        </td>
                        <td className="truncate px-3 py-3 font-semibold text-white" title={p.nombre}>{p.nombre}</td>
                        <td className="hidden truncate px-3 py-3 text-white/55 xl:table-cell" title={p.cliente}>{p.cliente || '—'}</td>
                        <td className={`whitespace-nowrap px-3 py-3 text-xs ${atrasado ? 'font-bold text-red-400' : 'text-white/50'}`}>
                          {entrega ? <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{fechaLegible(entrega)}</span> : '—'}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/40">
                              <div className={`h-full ${barra(p)}`} style={{ width: `${p.progreso}%` }} />
                            </div>
                            <span className={`w-9 text-right font-mono text-[11px] font-bold ${colorPct(p)}`}>{p.progreso}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right"><BadgePrioridad prioridad={p.prioridad} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {activos.length > MAX_TABLA && (
          <p className="border-t border-white/[0.06] px-4 py-2.5 text-center text-[11px] text-white/40">
            Mostrando {MAX_TABLA} de {activos.length} · <Link href="/admin/proyectos" className="text-blue-400 hover:underline">ver todos</Link>
          </p>
        )}
      </section>

      {/* ═══ ÁREAS ═══ */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-3">
        <section className={`sula-entrada ${tarjeta} flex min-h-[280px] min-w-0 flex-col gap-2 p-4 sm:p-5`} style={{ animationDelay: '250ms' }}>
          <h3 className="text-sm font-bold text-white">Áreas de producción</h3>
          <div className="flex flex-1 items-center justify-center">
            {datosAvances.cargando || datosAreas.cargando
              ? <div className="h-[220px] w-full animate-pulse rounded-xl bg-white/[0.04]" />
              : <HexagonGrid areas={estaciones} />}
          </div>
        </section>

        <section className={`sula-entrada ${tarjeta} flex min-w-0 flex-col gap-3 p-4 sm:p-5 xl:col-span-2`} style={{ animationDelay: '300ms' }}>
          <h3 className="text-sm font-bold text-white">Proyecto × área</h3>
          {cargandoProyectos || datosProductos.cargando
            ? <div className="h-[220px] animate-pulse rounded-xl bg-white/[0.04]" />
            : <HeatMatrix proyectos={filasCalor} areas={estaciones} celdas={celdasCalor} />}
        </section>
      </div>
    </div>
  );
}
