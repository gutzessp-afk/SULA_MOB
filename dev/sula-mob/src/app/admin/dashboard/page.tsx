'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { cargarProyectos, cargarTodas, useDatos } from '@/lib/cache-datos';
import { useRouter } from 'next/navigation';
import { TemaToggle } from '@/components/TemaToggle';
import { HexagonGrid } from '@/components/dashboard/HexagonGrid';
import { HeatMatrix, type FilaCalor } from '@/components/dashboard/HeatMatrix';
import { AlertasInteligentes } from '@/components/dashboard/AlertasInteligentes';
import { StatCards, type StatCard } from '@/components/dashboard/StatCards';
import { BurndownChart, type BurndownProyecto } from '@/components/dashboard/BurndownChart';
import { NotificationBellAdmin } from '@/components/dashboard/NotificationBellAdmin';
import { UltimosMovimientos, type Movimiento } from '@/components/dashboard/UltimosMovimientos';
import { useCountUp } from '@/hooks/useCountUp';
import { ETIQUETA_ESTADO, diasEntre, estadoEntrega, fechaEntrega, fechaHoy, ZONA_HORARIA, type EstadoEntrega } from '@/lib/entregas';
import {
  Clock,
  Timer,
  RefreshCw,
  Download,
  Factory,
  ChevronRight,
  TrendingUp,
  Package,
  AlertTriangle
} from 'lucide-react';

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
  id?: string;
  producto_id?: string;
  proyecto_id?: string;
  area_id: string;
  porcentaje: number;
  completado: boolean;
  piezas_totales?: number;
  piezas_completadas?: number;
  updated_at?: string;
}

/** Número que cuenta hasta su valor cuando llegan los datos, con un latido al terminar */
function Contador({ valor, activo, sufijo = '' }: { valor: number; activo: boolean; sufijo?: string }) {
  const { valor: mostrado, llego } = useCountUp(valor, 900, activo);
  return <span className={llego ? 'sula-latido' : 'inline-block'}>{mostrado}{sufijo}</span>;
}

/** Orden de las áreas en la línea de producción (sin acentos ni mayúsculas) */
const FLUJO = ['corte de lamina', 'corte de laser', 'corte de tubo', 'doblez', 'troquel', 'punteado', 'soldadura y pulido', 'pintura', 'empaque'];
const normal = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

interface EstacionArea { id: string; nombre: string; rendimiento: number; hechas: number; totales: number; productos: number; actividad: number }

type FiltroEstado = 'todos' | 'proceso' | 'finalizados' | 'atrasados';
const FILTROS: Record<FiltroEstado, { nombre: string; incluye: (e: EstadoEntrega) => boolean }> = {
  todos: { nombre: 'Todos', incluye: () => true },
  proceso: { nombre: ETIQUETA_ESTADO.en_proceso, incluye: e => e === 'en_proceso' || e === 'pendiente' },
  finalizados: { nombre: 'Finalizados', incluye: e => e === 'completado' },
  atrasados: { nombre: 'Atrasados', incluye: e => e === 'atrasado' },
};
const REFRESCO_MS = 60_000;
const MAX_MOVIMIENTOS = 8;

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
    <p className="text-[10px] text-white/40 flex items-center gap-1.5" aria-live="polite">
      <span className={`h-1.5 w-1.5 rounded-full ${actualizando ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
      {actualizando && en ? 'Actualizando...' : texto} · se actualiza solo cada minuto
    </p>
  );
}

const INICIO_SESION = 'sula_session_start';
const dosDigitos = (n: number) => String(n).padStart(2, '0');

/**
 * Reloj en vivo y tiempo que lleva abierta la sesión en esta pestaña
 * (sobrevive a recargas; se reinicia al cerrar la pestaña). En celular solo va el reloj.
 */
function TimeTracker() {
  // null hasta montar: la hora del servidor no coincide con la del navegador
  const [ahora, setAhora] = useState<Date | null>(null);
  const [inicio, setInicio] = useState<number | null>(null);

  useEffect(() => {
    const tic = () => setAhora(new Date());
    const primero = setTimeout(() => {
      let guardado = NaN;
      try {
        guardado = Number(sessionStorage.getItem(INICIO_SESION));
        if (!guardado) {
          guardado = Date.now();
          sessionStorage.setItem(INICIO_SESION, String(guardado));
        }
      } catch {
        guardado = Date.now();
      }
      setInicio(guardado);
      tic();
    }, 0);
    const intervalo = setInterval(tic, 1000);
    return () => { clearTimeout(primero); clearInterval(intervalo); };
  }, []);

  const hora = ahora ? ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '--:--:--';
  const fechaLarga = ahora ? ahora.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const fecha = fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1);
  const transcurrido = ahora && inicio ? Math.max(0, ahora.getTime() - inicio) : 0;
  const sesion = `${dosDigitos(Math.floor(transcurrido / 3_600_000))}:${dosDigitos(Math.floor((transcurrido % 3_600_000) / 60_000))}:${dosDigitos(Math.floor((transcurrido % 60_000) / 1000))}`;

  return (
    <div className="flex items-center gap-4 text-xs" aria-label="Reloj y tiempo de sesión">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-blue-400 shrink-0" />
        <div>
          <span className="text-lg font-black font-mono text-white tabular-nums leading-none" suppressHydrationWarning>{hora}</span>
          <p className="text-[10px] text-white/40 min-h-[15px]">{fecha}</p>
        </div>
      </div>
      <div className="hidden sm:block w-px h-8 bg-white/10" />
      <div className="hidden sm:flex items-center gap-2">
        <Timer className="w-4 h-4 text-emerald-400 shrink-0" />
        <div>
          <span className="text-sm font-bold font-mono text-emerald-400 tabular-nums leading-none">{sesion}</span>
          <p className="text-[10px] text-white/40">Sesión activa</p>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  // Se muestran al instante si ya se habían cargado (también desde la lista de proyectos) y se actualizan solos
  const datosProyectos = useDatos('proyectos', () => cargarProyectos<Proyecto>());
  const datosAreas = useDatos('areas', async () => {
    const { data, error } = await supabase.from('areas').select('*').order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Area[];
  });
  const datosAvances = useDatos('avance-areas', () => cargarTodas<AvanceEstacion>('producto_area_avance'));
  const proyectos = useMemo(() => datosProyectos.datos ?? [], [datosProyectos.datos]);
  const areas = useMemo(() => datosAreas.datos ?? [], [datosAreas.datos]);
  const avances = useMemo(() => datosAvances.datos ?? [], [datosAvances.datos]);
  const loading = datosProyectos.actualizando || datosAreas.actualizando || datosAvances.actualizando;
  const cargandoProyectos = datosProyectos.cargando;
  // Avances de las últimas 24 horas: chispas en la escena 3D
  const datosRecientes = useDatos('avances-24h', async () => {
    const { data, error } = await supabase
      .from('avances')
      .select('area_id, piezas, created_at')
      .gte('created_at', new Date(Date.now() - 86_400_000).toISOString())
      .limit(1000);
    if (error) throw new Error(error.message);
    return (data ?? []) as { area_id: string; piezas: number | null; created_at: string }[];
  });
  const datosProductos = useDatos('productos-proyecto', () => cargarTodas<{ id: string; proyecto_id: string }>('proyecto_productos', 'id, proyecto_id'));
  const router = useRouter();
  // Últimos movimientos: avances recientes con el nombre del operador
  const datosMovimientos = useDatos('ultimos-movimientos', async () => {
    const { data, error } = await supabase
      .from('avances')
      .select('id, piezas, operacion, created_at, operador_id, area_id')
      .order('created_at', { ascending: false })
      .limit(MAX_MOVIMIENTOS);
    if (error) throw new Error(error.message);
    const filas = data ?? [];
    const ids = [...new Set(filas.map(f => f.operador_id).filter(Boolean))] as string[];
    const nombres = new Map<string, string>();
    if (ids.length) {
      const { data: us } = await supabase.from('usuarios').select('id, nombre, apellidos').in('id', ids);
      for (const u of us ?? []) nombres.set(u.id, `${u.nombre ?? ''} ${u.apellidos ?? ''}`.trim());
    }
    return filas.map(f => ({ ...f, operador: (f.operador_id && nombres.get(f.operador_id)) || 'Operador' }));
  });
  // Historial de avances: la línea real del burndown
  const datosHistorial = useDatos('avances-historial', () => cargarTodas<{ proyecto_id: string; piezas: number | null; created_at: string }>('avances', 'id, proyecto_id, piezas, created_at'));
  // Reloj para los "hace X min": se mueve cada 30 s
  const [ahora, setAhora] = useState(0);
  useEffect(() => {
    const tic = () => setAhora(Date.now());
    const primero = setTimeout(tic, 0);
    const intervalo = setInterval(tic, 30_000);
    return () => { clearTimeout(primero); clearInterval(intervalo); };
  }, []);
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos');

  const fetchMetrics = () => Promise.all([datosProyectos.recargar(), datosAreas.recargar(), datosAvances.recargar(), datosRecientes.recargar(), datosProductos.recargar(), datosMovimientos.recargar(), datosHistorial.recargar()]);
  const actualizadoEn = [datosProyectos.actualizadoEn, datosAreas.actualizadoEn, datosAvances.actualizadoEn].every(Boolean)
    ? Math.min(datosProyectos.actualizadoEn!, datosAreas.actualizadoEn!, datosAvances.actualizadoEn!)
    : null;

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
  const cuentaEstado = (f: FiltroEstado) => (f === 'todos' ? proyectos.length : proyectos.filter(p => FILTROS[f].incluye(estadoDe.get(p.id)!)).length);

  // Proyectos Filtrados
  const proyectosFiltrados = useMemo(() => {
    return proyectos.filter(p => filtroEstado === 'todos' || FILTROS[filtroEstado].incluye(estadoDe.get(p.id)!));
  }, [proyectos, filtroEstado, estadoDe]);

  // Cálculo de Rendimiento Comparativo por Área
  const rendimientoAreas = useMemo(() => {
    if (!areas.length || !avances.length) return [];

    return areas.map(area => {
      const avancesArea = avances.filter(a => a.area_id === area.id);
      if (!avancesArea.length) return { ...area, rendimiento: 0, piezasCompletadas: 0, piezasTotales: 0 };

      let totalPiezas = 0;
      let piezasHechas = 0;
      let sumaPcts = 0;

      avancesArea.forEach(item => {
        if (item.piezas_totales && item.piezas_totales > 0) {
          totalPiezas += item.piezas_totales;
          piezasHechas += item.piezas_completadas || 0;
          sumaPcts += Math.min(100, Math.round(((item.piezas_completadas || 0) / item.piezas_totales) * 100));
        } else {
          sumaPcts += item.porcentaje || (item.completado ? 100 : 0);
        }
      });

      const promedio = Math.round(sumaPcts / avancesArea.length);

      return {
        ...area,
        rendimiento: promedio,
        piezasCompletadas: piezasHechas,
        piezasTotales: totalPiezas
      };
    });
  }, [areas, avances]);

  // Detección de Atrasos
  // Escena 3D: áreas en el orden de la línea y los proyectos que están en producción
  const estacionesEscena = useMemo<EstacionArea[]>(() => {
    const recientes = datosRecientes.datos ?? [];
    const lugar = (nombre: string) => { const i = FLUJO.indexOf(normal(nombre)); return i === -1 ? FLUJO.length : i; };
    return areas
      .filter(a => a.activo)
      .map(a => {
        const r = rendimientoAreas.find(x => x.id === a.id);
        return {
          id: a.id,
          nombre: a.nombre,
          rendimiento: r?.rendimiento ?? 0,
          hechas: r?.piezasCompletadas ?? 0,
          totales: r?.piezasTotales ?? 0,
          productos: avances.filter(x => x.area_id === a.id).length,
          actividad: recientes.filter(x => x.area_id === a.id).length,
        };
      })
      .sort((a, b) => lugar(a.nombre) - lugar(b.nombre));
  }, [areas, avances, rendimientoAreas, datosRecientes.datos]);

  // Resumen de producción
  const piezas = avances.reduce((t, f) => (f.piezas_totales && f.piezas_totales > 0
    ? { hechas: t.hechas + Math.min(f.piezas_completadas || 0, f.piezas_totales), totales: t.totales + f.piezas_totales }
    : t), { hechas: 0, totales: 0 });
  const areasActivas = estacionesEscena.filter(e => e.actividad > 0).length;

  // Burndown: proyectos sin terminar con fecha de entrega, primero los más atrasados respecto al plan
  const burndown = useMemo<BurndownProyecto[]>(() => {
    const hoy = fechaHoy();
    const dia = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA });
    const historial = datosHistorial.datos ?? [];
    return proyectos
      .filter(p => { const e = estadoDe.get(p.id); return e !== 'completado' && e !== 'cancelado' && !!fechaEntrega(p) && !!p.created_at; })
      .map(p => {
        const inicio = dia(p.created_at!);
        const entrega = fechaEntrega(p);
        const progreso = Math.min(100, Math.max(0, Number(p.progreso) || 0));
        const total = diasEntre(inicio, entrega);
        const planeadoHoy = total <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((diasEntre(inicio, hoy) / total) * 100)));
        // Piezas registradas por día, acumuladas y escaladas para terminar en el avance actual
        const porDia = new Map<string, number>();
        for (const a of historial) if (a.proyecto_id === p.id) porDia.set(dia(a.created_at), (porDia.get(dia(a.created_at)) ?? 0) + (a.piezas || 0));
        const dias = [...porDia.keys()].sort();
        const totalPiezas = dias.reduce((n, d) => n + porDia.get(d)!, 0);
        let acumulado = 0;
        const puntosReales = totalPiezas ? dias.map(d => { acumulado += porDia.get(d)!; return { dia: d, progreso: Math.round((acumulado / totalPiezas) * progreso) }; }) : [];
        return { id: p.id, codigo: p.codigo, nombre: p.nombre, cliente: p.cliente || '', progreso, inicio, entrega, hoy, planeadoHoy, desviacion: progreso - planeadoHoy, puntosReales };
      })
      .sort((a, b) => a.desviacion - b.desviacion);
  }, [proyectos, estadoDe, datosHistorial.datos]);
  const nombreArea = new Map(areas.map(a => [a.id, a.nombre]));
  const movimientos: Movimiento[] = (datosMovimientos.datos ?? []).map(m => ({
    id: m.id, operador: m.operador, area: nombreArea.get(m.area_id) || 'Área', piezas: m.piezas ?? 0, operacion: m.operacion || '', created_at: m.created_at,
  }));

  const metricasAtrasos = useMemo(() => {
    let proyectosAtrasados = 0;
    let proyectosRiesgo = 0;
    let dentroDeTiempo = 0;

    proyectos.forEach(p => {
      if (p.progreso === 100) {
        dentroDeTiempo++;
        return;
      }

      let fechaEntrega: Date | null = null;
      if (p.descripcion && p.descripcion.includes('Entrega:')) {
        const match = p.descripcion.match(/Entrega:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
        if (match && match[1]) {
          fechaEntrega = new Date(match[1]);
        }
      }

      const hoy = new Date();
      if (fechaEntrega && fechaEntrega < hoy && p.progreso < 100) {
        proyectosAtrasados++;
      } else if (p.progreso < 30 && p.prioridad === 'urgente') {
        proyectosRiesgo++;
      } else {
        dentroDeTiempo++;
      }
    });

    const total = proyectos.length || 1;
    return {
      atrasados: proyectosAtrasados,
      riesgo: proyectosRiesgo,
      aTiempo: dentroDeTiempo,
      pctAtraso: Math.round((proyectosAtrasados / total) * 100)
    };
  }, [proyectos]);

  // Swimlanes: los 6 proyectos más relevantes (activos primero, luego por avance)
  const ordenRelevancia = (p: Proyecto) => { const e = estadoDe.get(p.id); return e === 'atrasado' ? 0 : e === 'en_proceso' ? 1 : e === 'pendiente' ? 2 : 3; };
  const relevantes = useMemo(
    () => [...proyectosFiltrados].sort((a, b) => ordenRelevancia(a) - ordenRelevancia(b) || (Number(b.progreso) || 0) - (Number(a.progreso) || 0)),
    // ordenRelevancia solo lee estadoDe
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proyectosFiltrados, estadoDe]
  );

  // Matriz de calor: avance de cada proyecto en cada área (promedio de sus productos)
  const celdasCalor = useMemo(() => {
    const proyectoDe = new Map((datosProductos.datos ?? []).map(x => [x.id, x.proyecto_id]));
    const suma = new Map<string, { total: number; n: number }>();
    for (const f of avances) {
      const proyecto = f.producto_id ? proyectoDe.get(f.producto_id) : undefined;
      if (!proyecto) continue;
      const pct = f.piezas_totales && f.piezas_totales > 0
        ? Math.min(100, Math.round(((f.piezas_completadas || 0) / f.piezas_totales) * 100))
        : f.porcentaje || (f.completado ? 100 : 0);
      const clave = `${proyecto}|${f.area_id}`;
      const g = suma.get(clave) ?? { total: 0, n: 0 };
      g.total += pct; g.n++;
      suma.set(clave, g);
    }
    return new Map([...suma].map(([k, g]) => [k, Math.round(g.total / g.n)]));
  }, [avances, datosProductos.datos]);
  const filasCalor: FilaCalor[] = relevantes.slice(0, 8).map(p => ({ id: p.id, codigo: p.codigo, nombre: p.nombre }));

  const cuenta = (e: EstadoEntrega) => proyectos.filter(p => estadoDe.get(p.id) === e).length;
  const totales = { proceso: cuenta('en_proceso') + cuenta('pendiente'), finalizados: cuenta('completado'), atrasados: cuenta('atrasado') };

  // Eficiencia global
  const eficienciaGlobal = useMemo(() => {
    if (!proyectos.length) return 0;
    const sum = proyectos.reduce((acc, p) => acc + p.progreso, 0);
    return Math.round(sum / proyectos.length);
  }, [proyectos]);

  const exportarReporte = () => {
    const fecha = new Date();
    const fechaStr = fecha.toISOString().slice(0, 10);
    const horaStr = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

    const lines: string[] = [];

    // ═══ ENCABEZADO DEL REPORTE ═══
    lines.push('REPORTE DE PRODUCCIÓN — SULA MOB');
    lines.push(`Fecha de generación:,${fechaStr} ${horaStr}`);
    lines.push(`Total de proyectos:,${proyectos.length}`);
    lines.push(`Eficiencia global:,${eficienciaGlobal}%`);
    lines.push('');

    // ═══ SECCIÓN 1: RESUMEN EJECUTIVO ═══
    lines.push('═══ RESUMEN EJECUTIVO ═══');
    lines.push('Métrica,Valor');
    lines.push(`Proyectos totales,${proyectos.length}`);
    lines.push(`En proceso,${proyectos.filter(p => p.progreso > 0 && p.progreso < 100).length}`);
    lines.push(`Finalizados,${proyectos.filter(p => p.progreso === 100).length}`);
    lines.push(`Sin iniciar,${proyectos.filter(p => p.progreso === 0).length}`);
    lines.push(`Atrasados,${metricasAtrasos.atrasados}`);
    lines.push(`En riesgo,${metricasAtrasos.riesgo}`);
    lines.push(`A tiempo,${metricasAtrasos.aTiempo}`);
    lines.push(`% de atraso,${metricasAtrasos.pctAtraso}%`);
    lines.push(`Eficiencia global,${eficienciaGlobal}%`);
    lines.push('');

    // ═══ SECCIÓN 2: DETALLE POR PROYECTO ═══
    lines.push('═══ DETALLE POR PROYECTO ═══');
    lines.push('Código,Proyecto,Cliente,Prioridad,Progreso %,Estado,Fecha Entrega');
    proyectos.forEach(p => {
      let fechaEntrega = '—';
      if (p.descripcion && p.descripcion.includes('Entrega:')) {
        const match = p.descripcion.match(/Entrega:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
        if (match?.[1]) fechaEntrega = match[1];
      }

      let estado = 'Sin iniciar';
      if (p.progreso === 100) estado = 'Finalizado';
      else if (p.progreso > 0) estado = 'En proceso';

      // Verificar atraso
      if (fechaEntrega !== '—' && p.progreso < 100) {
        const fEntrega = new Date(fechaEntrega);
        if (fEntrega < new Date()) estado = '⚠ ATRASADO';
      }

      lines.push(`${p.codigo},"${p.nombre}","${p.cliente || 'General'}",${(p.prioridad || 'media').toUpperCase()},${p.progreso}%,${estado},${fechaEntrega}`);
    });
    lines.push('');

    // ═══ SECCIÓN 3: RENDIMIENTO POR ÁREA ═══
    lines.push('═══ RENDIMIENTO POR ÁREA / ESTACIÓN ═══');
    lines.push('Área,Peso %,Rendimiento %,Piezas Completadas,Piezas Totales');
    rendimientoAreas.forEach(a => {
      lines.push(`"${a.nombre}",${a.peso || 0}%,${a.rendimiento}%,${a.piezasCompletadas},${a.piezasTotales}`);
    });
    lines.push('');

    // ═══ PIE DE REPORTE ═══
    lines.push('═══ FIN DEL REPORTE ═══');
    lines.push(`Generado por SULA MOB — ${fechaStr}`);

    const csvContent = '﻿' + lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Reporte_Produccion_SULA_${fechaStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /* ── Glass card base ── */
  const glass = 'backdrop-blur-2xl backdrop-saturate-[1.7] bg-white/[0.04] border border-white/[0.10] rounded-2xl shadow-[0_8px_32px_-8px_rgba(0,0,0,0.6)]';

  const enRiesgo = totales.atrasados + metricasAtrasos.riesgo;
  const tarjetas: StatCard[] = [
    { icono: <TrendingUp className="h-4 w-4" />, etiqueta: 'Eficiencia', valor: `${eficienciaGlobal}%`, detalle: 'Avance promedio de los proyectos', progreso: eficienciaGlobal,
      color: eficienciaGlobal >= 70 ? 'emerald' : eficienciaGlobal >= 30 ? 'amber' : 'red' },
    { icono: <Package className="h-4 w-4" />, etiqueta: 'Piezas', valor: piezas.hechas.toLocaleString('es-MX'), detalle: `de ${piezas.totales.toLocaleString('es-MX')} programadas`,
      progreso: piezas.totales ? (piezas.hechas / piezas.totales) * 100 : 0, color: 'blue' },
    { icono: <Factory className="h-4 w-4" />, etiqueta: 'Áreas activas', valor: `${areasActivas}/${estacionesEscena.length}`, detalle: 'Con avances en las últimas 24 h',
      progreso: estacionesEscena.length ? (areasActivas / estacionesEscena.length) * 100 : 0,
      color: areasActivas === 0 ? 'red' : areasActivas < estacionesEscena.length / 2 ? 'amber' : 'emerald' },
    { icono: <AlertTriangle className="h-4 w-4" />, etiqueta: 'En riesgo', valor: enRiesgo, detalle: `${totales.atrasados} atrasado(s) · ${metricasAtrasos.riesgo} urgente(s) con poco avance`,
      progreso: proyectos.length ? (enRiesgo / proyectos.length) * 100 : 0, color: enRiesgo ? 'red' : 'emerald' },
  ];

  const tile = `${glass} p-4 sm:p-5`;
  const titulo = 'text-[11px] font-bold uppercase tracking-wider text-white/45';

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12 px-2 sm:px-4 text-white">

      {/* ═══ ENCABEZADO — franja compacta ═══ */}
      <div style={{ animationDelay: '0ms' }} className={`sula-entrada ${glass} p-4 sm:p-5 space-y-3`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-500/25 bg-blue-500/15">
              <Factory className="h-5 w-5 text-blue-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white sm:whitespace-nowrap">Inteligencia de Producción</h1>
              <UltimaActualizacion en={actualizadoEn} actualizando={loading} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-start lg:justify-end gap-3">
            <TimeTracker />
            <button
              onClick={exportarReporte}
              className="max-sm:min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-xs font-bold text-white/80 hover:bg-white/[0.1] transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
            <button
              onClick={() => void fetchMetrics()}
              className="max-sm:min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-900/40 hover:bg-blue-500 active:scale-95 transition-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Sincronizar
            </button>
            <NotificationBellAdmin />
            <TemaToggle />
          </div>
        </div>

        {/* Filtro por estado: afecta las barras de proyectos y la matriz de calor */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar proyectos por estado">
          {(Object.keys(FILTROS) as FiltroEstado[]).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltroEstado(f)}
              aria-pressed={filtroEstado === f}
              className={`max-sm:min-h-[40px] inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                filtroEstado === f ? 'border-blue-400/50 bg-blue-600 text-white' : 'border-white/10 bg-white/[0.05] text-white/60 hover:text-white hover:bg-white/[0.1]'
              }`}
            >
              {FILTROS[f].nombre}
              <span className={`font-mono ${filtroEstado === f ? 'text-white/80' : 'text-white/35'}`}>{cuentaEstado(f)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ INDICADORES ═══ */}
      <div style={{ animationDelay: '50ms' }} className="sula-entrada">
        <StatCards cards={tarjetas} glass={glass} cargando={cargandoProyectos || datosAvances.cargando} />
      </div>

      {/* ═══ BENTO ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">

        {/* 1. Proyectos (compacto) */}
        <section style={{ animationDelay: '100ms' }} className={`sula-entrada ${tile} col-span-2 lg:col-span-1 flex flex-col justify-between gap-4 min-h-[200px]`}>
          <p className={titulo}>Proyectos</p>
          <p className="flex items-baseline gap-2">
            <span className="font-black font-mono leading-none text-white tabular-nums" style={{ fontSize: 48 }}>
              {cargandoProyectos ? <span className="inline-block h-10 w-16 rounded-xl bg-white/[0.07] animate-pulse align-middle" /> : <Contador valor={proyectos.length} activo />}
            </span>
            <span className="text-sm text-white/50">pedidos</span>
          </p>
          <ul className="space-y-1.5 text-sm text-white/70">
            {[['bg-blue-500', totales.proceso, 'en proceso'], ['bg-emerald-500', totales.finalizados, 'finalizados'], ['bg-red-500', totales.atrasados, 'atrasados']].map(([c, n, t]) => (
              <li key={t as string} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${c}`} />
                <span className="font-mono font-bold text-white">{n}</span> {t}
              </li>
            ))}
          </ul>
        </section>

        {/* 2. Alertas inteligentes */}
        <section style={{ animationDelay: '150ms' }} className={`sula-entrada ${tile} col-span-2 lg:col-span-1 flex flex-col gap-3 min-h-[200px]`}>
          <p className={titulo}>Necesita atención</p>
          <AlertasInteligentes />
        </section>

        {/* 3. Plan contra real */}
        <section style={{ animationDelay: '200ms' }} className={`sula-entrada ${tile} col-span-2 min-w-0 flex flex-col gap-3`}>
          <p className={titulo}>Plan contra real</p>
          <BurndownChart proyectos={burndown} cargando={cargandoProyectos || datosHistorial.cargando} />
        </section>

        {/* 4. Últimos movimientos */}
        <section style={{ animationDelay: '250ms' }} className={`sula-entrada ${tile} col-span-2 lg:col-span-1 flex flex-col gap-3 min-h-[280px]`}>
          <p className={titulo}>Últimos movimientos</p>
          <UltimosMovimientos movimientos={movimientos} cargando={datosMovimientos.cargando} ahora={ahora} />
        </section>

        {/* 5. Panal de áreas */}
        <section style={{ animationDelay: '300ms' }} className={`sula-entrada ${tile} col-span-2 lg:col-span-1 min-h-[280px] flex flex-col gap-2`}>
          <p className={titulo}>Áreas de producción</p>
          <div className="flex flex-1 items-center justify-center">
            {datosAvances.cargando || datosAreas.cargando
              ? <div className="h-[220px] w-full rounded-xl bg-white/[0.04] animate-pulse" />
              : <HexagonGrid areas={estacionesEscena} />}
          </div>
        </section>

        {/* 6. Matriz de calor proyecto × área */}
        <section style={{ animationDelay: '350ms' }} className={`sula-entrada ${tile} col-span-2 min-w-0 flex flex-col gap-3`}>
          <p className={titulo}>Proyecto × área</p>
          {cargandoProyectos || datosProductos.cargando
            ? <div className="h-[220px] rounded-xl bg-white/[0.04] animate-pulse" />
            : <HeatMatrix proyectos={filasCalor} areas={estacionesEscena} celdas={celdasCalor} />}
        </section>

        {/* 7. Carriles de proyectos */}
        <section style={{ animationDelay: '400ms' }} className={`sula-entrada ${tile} col-span-2 lg:col-span-4 space-y-3`}>
          <p className={titulo}>Proyectos</p>
          {cargandoProyectos ? (
            <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-9 rounded-lg bg-white/[0.05] animate-pulse" />)}</div>
          ) : relevantes.length === 0 ? (
            <p className="py-6 text-center text-xs text-white/40">No hay proyectos que coincidan con el filtro.</p>
          ) : (
            <ul className="space-y-2">
              {relevantes.slice(0, 6).map((p, i) => {
                const pct = Math.min(100, Math.max(0, Number(p.progreso) || 0));
                const estado = estadoDe.get(p.id);
                const barra = estado === 'completado' ? 'bg-emerald-500 shadow-[0_0_14px_rgba(16,185,129,0.3)]'
                  : estado === 'atrasado' ? 'bg-red-500 shadow-[0_0_14px_rgba(239,68,68,0.3)]'
                  : pct > 0 ? 'bg-blue-500 shadow-[0_0_14px_rgba(59,130,246,0.3)]' : 'bg-white/10';
                const nombreDentro = pct > 25;
                return (
                  <li key={p.id} className="sula-entrada" style={{ animationDelay: `${400 + i * 60}ms` }}>
                    <button
                      type="button"
                      onClick={() => router.push(`/admin/proyectos/${p.id}`)}
                      className="group flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-white/[0.04] transition-colors"
                      title={`${p.codigo} — ${p.nombre}: ${pct}%${estado ? ` (${ETIQUETA_ESTADO[estado]})` : ''}`}
                    >
                      <span className="w-20 shrink-0 font-mono text-[11px] font-bold text-blue-300">{p.codigo}</span>
                      <span className="relative h-7 flex-1 overflow-hidden rounded-md bg-white/[0.03] border border-white/[0.06]">
                        <span className={`sula-llenado-x absolute inset-y-0 left-0 rounded-md ${barra}`} style={{ width: `${Math.max(pct, 1)}%` }}>
                          <span className="absolute inset-x-0 top-0 h-px bg-white/30" />
                        </span>
                        <span className={`absolute inset-y-0 flex items-center truncate text-[11px] font-semibold ${nombreDentro ? 'left-2 text-white' : 'text-white/60'}`} style={nombreDentro ? { maxWidth: `calc(${pct}% - 12px)` } : { left: `calc(${Math.max(pct, 1)}% + 8px)` }}>
                          {p.nombre}
                        </span>
                      </span>
                      <span className="w-10 shrink-0 text-right font-mono text-xs font-bold text-white">{pct}%</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-white/0 transition-colors group-hover:text-white/60" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

      </div>
    </div>
  );
}
