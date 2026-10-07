'use client';

/**
 * Despiece (BOM) de un proyecto — /admin/proyectos/[id]/despiece
 * ──────────────────────────────────────────────────────────────
 * Tres niveles:  Partida (mueble) → Subensamble → Componente (pieza física)
 * Cada componente tiene una "ruta": las áreas por las que pasa. El avance
 * se captura marcando cada área como completada (tabla avance_componente).
 *
 * El progreso NO se calcula aquí: los triggers de Supabase lo recalculan
 * (componente → subensamble → partida → proyecto) y esta página solo
 * vuelve a leer los datos después de cada cambio.
 *
 * Usa el layout de /admin (menú lateral, fondo y MOBI) automáticamente
 * por estar dentro de src/app/admin/.
 *
 * RUTA: src/app/admin/proyectos/[id]/despiece/page.tsx
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, Check, ChevronDown, ChevronRight, Cog, Layers, Loader2, Package, Plus, Wrench, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

/* ═══════════════════════════════════════
   TIPOS (columnas reales de cada tabla)
   ═══════════════════════════════════════ */

interface Proyecto {
  id: string;
  codigo: string;
  nombre: string;
  cliente?: string | null;
  progreso: number;
}

interface Partida {
  id: string;
  clave: string;
  descripcion: string;
  cantidad: number;
  orden: number;
  progreso: number;
}

interface Subensamble {
  id: string;
  partida_id: string;
  nombre: string;
  orden: number;
  progreso: number;
}

interface Componente {
  id: string;
  subensamble_id: string;
  nombre: string;
  material: string | null;
  dimensiones: string | null;
  cantidad: number;
  areas_ruta: string[] | null;
  orden: number;
  completado: boolean;
}

interface Avance {
  id: string;
  componente_id: string;
  area_id: string;
  completado: boolean;
}

interface Area {
  id: string;
  nombre: string;
  peso: number;
}

/** Datos del mini-formulario "Agregar Componente" */
interface CompForm {
  subId: string;
  nombre: string;
  material: string;
  dimensiones: string;
  cantidad: number;
  areas: string[];
}

/* ═══════════════════════════════════════
   UTILIDADES
   ═══════════════════════════════════════ */

const pct = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

/** Código de colores: verde = completado, azul = en proceso, gris = pendiente */
function colorEstado(p: number) {
  if (p >= 100) return { stroke: '#10b981', fill: 'rgba(16,185,129,0.22)', text: 'text-emerald-400', bar: 'bg-emerald-400' };
  if (p > 0) return { stroke: '#3B82F6', fill: 'rgba(59,130,246,0.22)', text: 'text-blue-400', bar: 'bg-blue-400' };
  return { stroke: 'rgba(255,255,255,0.25)', fill: 'rgba(255,255,255,0.1)', text: 'text-white/40', bar: 'bg-white/20' };
}

const cortar = (t: string, max: number) => (t.length > max ? t.slice(0, max - 1) + '…' : t);

/** true en pantallas md o mayores (para dibujar el plano horizontal o vertical) */
function useIsDesktop() {
  return useSyncExternalStore(
    onChange => {
      const mq = window.matchMedia('(min-width: 768px)');
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia('(min-width: 768px)').matches,
    () => true
  );
}

function BarraProgreso({ valor, className = '' }: { valor: number; className?: string }) {
  const c = colorEstado(valor);
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-2 bg-black/40 rounded-full overflow-hidden border border-white/10">
        <div className={`h-full transition-all duration-500 ${c.bar}`} style={{ width: `${valor}%` }} />
      </div>
      <span className={`font-mono font-bold text-xs w-10 text-right ${c.text}`}>{valor}%</span>
    </div>
  );
}

/* ═══════════════════════════════════════
   PLANO 2D — árbol de ensamble explosionado (SVG)
   Rectángulo grande = el mueble (partida), medianos = subensambles,
   pequeños = componentes. Horizontal en escritorio, vertical en móvil.
   ═══════════════════════════════════════ */

interface Caja { x: number; y: number; w: number; h: number; titulo: string; detalle: string; p: number; }

function PlanoDespiece({ partida, subs, compsDe, progresoComp, horizontal }: {
  partida: Partida;
  subs: Subensamble[];
  compsDe: (subId: string) => Componente[];
  progresoComp: (c: Componente) => number;
  horizontal: boolean;
}) {
  const PAD = 16;
  const cajas: Caja[] = [];
  const lineas: string[] = [];
  let ancho = 0;
  let alto = 0;

  const detalleComp = (c: Componente) => c.dimensiones || c.material || `${progresoComp(c)}%`;

  if (horizontal) {
    // Mueble arriba al centro, subensambles en fila y componentes en columna bajo cada uno
    const COL = 190, GAP = 22, ROOT_W = 280, ROOT_H = 58, SUB_H = 46, COMP_H = 42, COMP_GAP = 10, V_GAP = 44;
    const filaW = subs.length * COL + (subs.length - 1) * GAP;
    ancho = Math.max(ROOT_W, filaW) + PAD * 2;
    const rootX = (ancho - ROOT_W) / 2;
    const subY = PAD + ROOT_H + V_GAP;
    const busY = PAD + ROOT_H + V_GAP / 2;
    const fila0 = (ancho - filaW) / 2;
    let maxComps = 0;

    cajas.push({ x: rootX, y: PAD, w: ROOT_W, h: ROOT_H, titulo: cortar(partida.descripcion, 34), detalle: `${partida.clave} · ${pct(partida.progreso)}%`, p: pct(partida.progreso) });
    lineas.push(`M${ancho / 2},${PAD + ROOT_H} V${busY}`);

    subs.forEach((s, i) => {
      const x = fila0 + i * (COL + GAP);
      const cx = x + COL / 2;
      lineas.push(`M${ancho / 2},${busY} H${cx} V${subY}`);
      cajas.push({ x, y: subY, w: COL, h: SUB_H, titulo: cortar(s.nombre, 22), detalle: `${pct(s.progreso)}%`, p: pct(s.progreso) });

      const comps = compsDe(s.id);
      maxComps = Math.max(maxComps, comps.length);
      comps.forEach((c, j) => {
        const y = subY + SUB_H + COMP_GAP + j * (COMP_H + COMP_GAP);
        lineas.push(`M${x + 10},${j === 0 ? subY + SUB_H : y - COMP_GAP - COMP_H / 2} V${y + COMP_H / 2} H${x + 22}`);
        cajas.push({ x: x + 22, y, w: COL - 22, h: COMP_H, titulo: cortar(c.nombre, 20), detalle: cortar(detalleComp(c), 22), p: progresoComp(c) });
      });
    });
    alto = subY + SUB_H + maxComps * (COMP_H + COMP_GAP) + PAD;
  } else {
    // Móvil: todo en una columna, con sangría por nivel
    const W = 340, ROOT_H = 58, SUB_H = 46, COMP_H = 42, GAP = 10;
    ancho = W;
    let y = PAD;
    cajas.push({ x: PAD, y, w: W - PAD * 2, h: ROOT_H, titulo: cortar(partida.descripcion, 36), detalle: `${partida.clave} · ${pct(partida.progreso)}%`, p: pct(partida.progreso) });
    y += ROOT_H + GAP;
    let troncoY = PAD + ROOT_H;

    subs.forEach(s => {
      lineas.push(`M${PAD + 10},${troncoY} V${y + SUB_H / 2} H${PAD + 22}`);
      troncoY = y + SUB_H / 2;
      cajas.push({ x: PAD + 22, y, w: W - PAD * 2 - 22, h: SUB_H, titulo: cortar(s.nombre, 30), detalle: `${pct(s.progreso)}%`, p: pct(s.progreso) });
      let ramaY = y + SUB_H;
      y += SUB_H + GAP;

      compsDe(s.id).forEach(c => {
        lineas.push(`M${PAD + 32},${ramaY} V${y + COMP_H / 2} H${PAD + 44}`);
        ramaY = y + COMP_H / 2;
        cajas.push({ x: PAD + 44, y, w: W - PAD * 2 - 44, h: COMP_H, titulo: cortar(c.nombre, 26), detalle: cortar(detalleComp(c), 28), p: progresoComp(c) });
        y += COMP_H + GAP;
      });
    });
    alto = y + PAD - GAP;
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        width={horizontal ? ancho : undefined}
        className={horizontal ? 'mx-auto max-w-none' : 'w-full h-auto'}
        role="img"
        aria-label={`Plano de ensamble de ${partida.descripcion}`}
      >
        {lineas.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={1.5} />
        ))}
        {cajas.map((c, i) => {
          const color = colorEstado(c.p);
          return (
            <g key={i}>
              <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={10} fill={color.fill} stroke={color.stroke} strokeWidth={1.5} />
              <text x={c.x + 12} y={c.y + c.h / 2 - 3} fill="#fff" fontSize={12} fontWeight={700}>{c.titulo}</text>
              <text x={c.x + 12} y={c.y + c.h / 2 + 13} fill="rgba(255,255,255,0.6)" fontSize={10.5} fontFamily="monospace">{c.detalle}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════
   PÁGINA
   ═══════════════════════════════════════ */

const TARJETA = 'rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]';
const INPUT = 'max-sm:text-base max-sm:min-h-[44px] h-[40px] rounded-xl border border-white/20 bg-white/[0.07] px-3 text-sm text-white outline-none focus:border-cyan-400/60 placeholder:text-white/30 transition-colors';

export default function DespiecePage() {
  // En un Client Component los parámetros de la ruta se leen con useParams()
  const { id: proyectoId } = useParams<{ id: string }>();
  const isDesktop = useIsDesktop();

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [subs, setSubs] = useState<Subensamble[]>([]);
  const [comps, setComps] = useState<Componente[]>([]);
  const [avances, setAvances] = useState<Avance[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  // Progreso por componente calculado por la base (vista v_despiece_completo)
  const [progresoVista, setProgresoVista] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [chipGuardando, setChipGuardando] = useState('');

  // Qué nodos del árbol están colapsados (por id de partida o subensamble)
  const [colapsado, setColapsado] = useState<Record<string, boolean>>({});
  // Partida que se dibuja en el plano
  const [planoId, setPlanoId] = useState('');
  // Mini-formularios abiertos
  const [subForm, setSubForm] = useState<{ partidaId: string; nombre: string } | null>(null);
  const [compForm, setCompForm] = useState<CompForm | null>(null);

  /* ── Carga de datos: cada nivel se pide con los ids del nivel anterior ── */
  const loadDespiece = useCallback(async () => {
    const [proyectoRes, partidasRes, areasRes] = await Promise.all([
      supabase.from('proyectos').select('id, codigo, nombre, cliente, progreso').eq('id', proyectoId).maybeSingle(),
      supabase.from('partidas').select('id, clave, descripcion, cantidad, orden, progreso').eq('proyecto_id', proyectoId).order('orden'),
      supabase.from('areas').select('id, nombre, peso').eq('activo', true).order('nombre'),
    ]);

    if (proyectoRes.error || !proyectoRes.data) {
      setError(proyectoRes.error?.message || 'No se encontró el proyecto.');
      setLoading(false);
      return;
    }
    if (partidasRes.error) setError('No se pudieron cargar las partidas: ' + partidasRes.error.message);

    const partidasData = (partidasRes.data || []) as Partida[];
    let subsData: Subensamble[] = [];
    let compsData: Componente[] = [];
    let avancesData: Avance[] = [];
    const progresoData: Record<string, number> = {};

    if (partidasData.length > 0) {
      const { data } = await supabase
        .from('subensambles')
        .select('id, partida_id, nombre, orden, progreso')
        .in('partida_id', partidasData.map(p => p.id))
        .order('orden');
      subsData = (data || []) as Subensamble[];
    }
    if (subsData.length > 0) {
      const { data } = await supabase
        .from('componentes')
        .select('id, subensamble_id, nombre, material, dimensiones, cantidad, areas_ruta, orden, completado')
        .in('subensamble_id', subsData.map(s => s.id))
        .order('orden');
      compsData = (data || []) as Componente[];
    }
    if (compsData.length > 0) {
      const [avRes, vistaRes] = await Promise.all([
        supabase.from('avance_componente').select('id, componente_id, area_id, completado').in('componente_id', compsData.map(c => c.id)),
        supabase.from('v_despiece_completo').select('componente_id, componente_progreso').eq('proyecto_id', proyectoId),
      ]);
      avancesData = (avRes.data || []) as Avance[];
      for (const fila of vistaRes.data || []) {
        if (fila.componente_id) progresoData[fila.componente_id as string] = pct(fila.componente_progreso);
      }
    }

    setProyecto(proyectoRes.data as Proyecto);
    setPartidas(partidasData);
    setSubs(subsData);
    setComps(compsData);
    setAvances(avancesData);
    setProgresoVista(progresoData);
    setAreas((areasRes.data || []) as Area[]);
    setLoading(false);
  }, [proyectoId]);

  useEffect(() => {
    async function init() {
      await loadDespiece();
    }
    void init();
  }, [loadDespiece]);

  /* ── Datos derivados ── */
  const subsDe = (partidaId: string) => subs.filter(s => s.partida_id === partidaId);
  const compsDe = (subId: string) => comps.filter(c => c.subensamble_id === subId);
  const areaNombre = (areaId: string) => areas.find(a => a.id === areaId)?.nombre ?? 'Área';
  const estaCompleto = (compId: string, areaId: string) =>
    avances.some(a => a.componente_id === compId && a.area_id === areaId && a.completado);

  /** Progreso del componente: el que calcula la base; si aún no llega, áreas hechas / áreas de su ruta */
  const progresoComp = (c: Componente) => {
    if (progresoVista[c.id] !== undefined) return progresoVista[c.id];
    const ruta = c.areas_ruta || [];
    if (ruta.length === 0) return c.completado ? 100 : 0;
    return pct((ruta.filter(a => estaCompleto(c.id, a)).length / ruta.length) * 100);
  };

  const partidaPlano = partidas.find(p => p.id === planoId) ?? partidas[0];
  const toggleNodo = (nodoId: string) => setColapsado(prev => ({ ...prev, [nodoId]: !prev[nodoId] }));

  /* ── Acciones ── */

  const guardarSubensamble = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subForm || !subForm.nombre.trim()) return;
    setGuardando(true);
    const { error: err } = await supabase.from('subensambles').insert({
      partida_id: subForm.partidaId,
      nombre: subForm.nombre.trim(),
      orden: subsDe(subForm.partidaId).length + 1,
    });
    setGuardando(false);
    if (err) { setError('No se pudo guardar el subensamble: ' + err.message); return; }
    setError('');
    setSubForm(null);
    await loadDespiece();
  };

  const guardarComponente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compForm || !compForm.nombre.trim()) return;
    setGuardando(true);
    const { error: err } = await supabase.from('componentes').insert({
      subensamble_id: compForm.subId,
      nombre: compForm.nombre.trim(),
      material: compForm.material.trim() || null,
      dimensiones: compForm.dimensiones.trim() || null,
      cantidad: compForm.cantidad || 1,
      areas_ruta: compForm.areas,
      orden: compsDe(compForm.subId).length + 1,
    });
    setGuardando(false);
    if (err) { setError('No se pudo guardar el componente: ' + err.message); return; }
    setError('');
    setCompForm(null);
    await loadDespiece();
  };

  /** Marca o desmarca un área de un componente. Los triggers recalculan el progreso. */
  const toggleAvance = async (componenteId: string, areaId: string) => {
    const key = `${componenteId}_${areaId}`;
    setChipGuardando(key);

    const { data: existing, error: errLeer } = await supabase
      .from('avance_componente')
      .select('id, completado')
      .eq('componente_id', componenteId)
      .eq('area_id', areaId)
      .maybeSingle();

    let err = errLeer;
    if (!err && existing) {
      const nuevo = !existing.completado;
      ({ error: err } = await supabase
        .from('avance_componente')
        .update({ completado: nuevo, fecha_completado: nuevo ? new Date().toISOString() : null })
        .eq('id', existing.id));
    } else if (!err) {
      ({ error: err } = await supabase
        .from('avance_componente')
        .insert({ componente_id: componenteId, area_id: areaId, completado: true, fecha_completado: new Date().toISOString() }));
    }

    if (err) setError('No se pudo guardar el avance: ' + err.message);
    else setError('');
    await loadDespiece();
    setChipGuardando('');
  };

  /** Copia las partidas del sistema anterior (proyecto_productos) a la tabla partidas */
  const migrarPartidas = async () => {
    setGuardando(true);
    const { data: oldProducts, error: errLeer } = await supabase
      .from('proyecto_productos')
      .select('nombre, cantidad')
      .eq('proyecto_id', proyectoId)
      .order('created_at');

    if (errLeer || !oldProducts || oldProducts.length === 0) {
      setGuardando(false);
      setError(errLeer ? 'No se pudo leer el sistema anterior: ' + errLeer.message : 'Este proyecto tampoco tiene partidas en el sistema anterior.');
      return;
    }

    // El nombre viejo tiene la forma "[CLAVE] Descripción"
    const inserts = oldProducts.map((prod, idx) => ({
      proyecto_id: proyectoId,
      clave: (prod.nombre as string).match(/\[(.*?)\]/)?.[1] || 'SIN-CLAVE',
      descripcion: (prod.nombre as string).replace(/\[.*?\]\s*/, ''),
      cantidad: prod.cantidad || 1,
      precio_unitario: 0,
      importe: 0,
      orden: idx + 1,
      progreso: 0,
    }));
    const { error: err } = await supabase.from('partidas').insert(inserts);
    setGuardando(false);
    if (err) { setError('No se pudieron migrar las partidas: ' + err.message); return; }
    setError('');
    await loadDespiece();
  };

  /* ── Render ── */

  const progresoProyecto = pct(proyecto?.progreso);
  const planoSubs = partidaPlano ? subsDe(partidaPlano.id) : [];

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
          <div className="w-12 h-12 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400 flex-shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-mono font-bold text-cyan-400">{proyecto?.codigo || 'Despiece'}</span>
            <h1 className="text-lg sm:text-2xl font-bold text-white tracking-wide leading-tight truncate">
              {proyecto?.nombre || (loading ? 'Cargando…' : 'Proyecto no encontrado')}
            </h1>
            <p className="text-[11px] sm:text-xs text-white/65 mt-1">
              Despiece del pedido{proyecto?.cliente ? ` · Cliente: ${proyecto.cliente}` : ''}
            </p>
          </div>
        </div>

        {proyecto && (
          <div className="flex flex-wrap items-stretch gap-3">
            <div className="bg-white/[0.05] border border-white/15 px-5 py-2.5 rounded-2xl text-center">
              <div className="text-xl font-black text-cyan-300 font-mono">{partidas.length}</div>
              <div className="text-[10px] text-white/50 uppercase font-bold">Partidas</div>
            </div>
            <div className="bg-white/[0.05] border border-white/15 px-5 py-2.5 rounded-2xl text-center">
              <div className={`text-xl font-black font-mono ${progresoProyecto > 0 ? 'text-emerald-400' : 'text-white/60'}`}>{progresoProyecto}%</div>
              <div className="text-[10px] text-white/50 uppercase font-bold">Avance Global</div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-300 font-semibold bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">{error}</p>
      )}

      {loading ? (
        <div className="py-16 flex justify-center items-center gap-2 text-white/50 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-cyan-400" /> Cargando despiece...
        </div>
      ) : proyecto && partidas.length === 0 ? (
        /* ═══ SIN PARTIDAS: proyecto anterior al módulo de despiece ═══ */
        <div className={`${TARJETA} p-8 text-center space-y-4`}>
          <div>
            <p className="text-sm text-white/80 font-semibold">Este proyecto no tiene partidas en el despiece.</p>
            <p className="text-xs text-white/45 mt-1">
              Los proyectos creados antes de este módulo no guardaron sus partidas aquí; las órdenes nuevas sí lo hacen.
            </p>
          </div>
          <button
            type="button"
            onClick={migrarPartidas}
            disabled={guardando}
            className="max-sm:min-h-[44px] bg-cyan-500/15 hover:bg-cyan-500/30 disabled:opacity-50 text-cyan-300 border border-cyan-400/30 text-xs font-bold px-5 py-2.5 rounded-xl inline-flex items-center gap-2 transition-all"
          >
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
            Migrar partidas del sistema anterior
          </button>
        </div>
      ) : proyecto && partidaPlano ? (
        <>
          {/* ═══ SECCIÓN 1: PLANO 2D ═══ */}
          <div className={`${TARJETA} p-4 sm:p-6 space-y-4`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-white/60 flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" /> Plano de Ensamble
              </h2>
              <div className="flex items-center gap-4 text-[10px] font-bold uppercase text-white/50">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Completado</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> En proceso</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-white/20" /> Pendiente</span>
              </div>
            </div>

            {/* Con varias partidas, se elige cuál mueble dibujar */}
            {partidas.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {partidas.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlanoId(p.id)}
                    className={`max-sm:min-h-[44px] px-3 py-1.5 rounded-xl text-[11px] font-mono font-bold border transition-all ${
                      p.id === partidaPlano.id
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50'
                        : 'bg-white/[0.07] text-white/60 border-white/10 hover:text-white'
                    }`}
                  >
                    {p.clave}
                  </button>
                ))}
              </div>
            )}

            {planoSubs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-10 px-4 text-center">
                <p className="text-sm text-white/50">Agrega subensambles y componentes para ver el plano</p>
              </div>
            ) : (
              <PlanoDespiece
                partida={partidaPlano}
                subs={planoSubs}
                compsDe={compsDe}
                progresoComp={progresoComp}
                horizontal={isDesktop}
              />
            )}
          </div>

          {/* ═══ SECCIÓN 2: ÁRBOL DE DESPIECE ═══ */}
          <div className="space-y-3">
            {partidas.map(partida => {
              const abierta = !colapsado[partida.id];
              const subsPartida = subsDe(partida.id);

              return (
                <div key={partida.id} className={`${TARJETA} overflow-hidden`}>
                  {/* Nivel 1: Partida */}
                  <button
                    type="button"
                    onClick={() => toggleNodo(partida.id)}
                    className="max-sm:min-h-[44px] w-full text-left p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {abierta ? <ChevronDown className="w-4 h-4 text-white/50 mt-1 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-white/50 mt-1 flex-shrink-0" />}
                      <Package className="w-5 h-5 text-cyan-400 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-400/25 px-2.5 py-0.5 rounded-lg">{partida.clave}</span>
                          <span className="text-[11px] text-white/50">Cant: <strong className="text-sky-300 font-mono">{partida.cantidad}</strong></span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                            {subsPartida.length} subensamble{subsPartida.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-white mt-1.5 leading-snug">{partida.descripcion}</p>
                      </div>
                    </div>
                    <BarraProgreso valor={pct(partida.progreso)} className="sm:w-52 pl-12 sm:pl-0" />
                  </button>

                  {abierta && (
                    <div className="border-t border-white/10 px-3 sm:px-5 py-4 space-y-3">
                      {subsPartida.map(sub => {
                        const subAbierto = !colapsado[sub.id];
                        const compsSub = compsDe(sub.id);

                        return (
                          <div key={sub.id} className="rounded-2xl border border-white/10 bg-white/[0.03]">
                            {/* Nivel 2: Subensamble */}
                            <button
                              type="button"
                              onClick={() => toggleNodo(sub.id)}
                              className="max-sm:min-h-[44px] w-full text-left px-3 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 hover:bg-white/[0.03] rounded-2xl transition-colors"
                            >
                              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                {subAbierto ? <ChevronDown className="w-4 h-4 text-white/40 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-white/40 flex-shrink-0" />}
                                <Wrench className="w-4 h-4 text-sky-400 flex-shrink-0" />
                                <span className="text-sm font-bold text-white truncate">{sub.nombre}</span>
                                <span className="text-[10px] text-white/40 font-bold uppercase flex-shrink-0">
                                  {compsSub.length} pieza{compsSub.length === 1 ? '' : 's'}
                                </span>
                              </div>
                              <BarraProgreso valor={pct(sub.progreso)} className="sm:w-44 pl-11 sm:pl-0" />
                            </button>

                            {subAbierto && (
                              <div className="px-3 sm:px-4 pb-3 space-y-2">
                                {/* Nivel 3: Componentes */}
                                {compsSub.map(comp => {
                                  const p = progresoComp(comp);
                                  const ruta = comp.areas_ruta || [];
                                  return (
                                    <div key={comp.id} className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2.5">
                                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                        <Cog className="w-4 h-4 text-white/50 flex-shrink-0" />
                                        <span className="text-[13px] font-semibold text-white">{comp.nombre}</span>
                                        {comp.material && <span className="text-xs text-white/55">{comp.material}</span>}
                                        {comp.dimensiones && <span className="text-xs text-white/55 font-mono">{comp.dimensiones}</span>}
                                        {/* Total a fabricar = piezas por mueble × muebles pedidos en la partida */}
                                        <span
                                          className="text-xs font-mono font-bold text-sky-300 bg-sky-500/10 border border-sky-400/25 px-2 py-0.5 rounded-lg"
                                          title={`${comp.cantidad || 1} por mueble × ${partida.cantidad} mueble${partida.cantidad === 1 ? '' : 's'} pedidos`}
                                        >
                                          {(comp.cantidad || 1) * partida.cantidad} pzas
                                        </span>
                                        {partida.cantidad > 1 && (
                                          <span className="text-[11px] text-white/45">({comp.cantidad || 1} por mueble × {partida.cantidad})</span>
                                        )}
                                        <span className={`ml-auto text-xs font-mono font-bold ${colorEstado(p).text}`}>
                                          {p >= 100 ? 'Completado' : `${p}%`}
                                        </span>
                                      </div>

                                      {/* Ruta de áreas: clic en un chip = marcar o desmarcar esa área */}
                                      {ruta.length === 0 ? (
                                        <p className="text-[11px] text-white/35 pl-7">Sin ruta de áreas asignada.</p>
                                      ) : (
                                        <div className="flex flex-wrap gap-1.5 pl-7">
                                          {ruta.map(areaId => {
                                            const hecho = estaCompleto(comp.id, areaId);
                                            const ocupado = chipGuardando === `${comp.id}_${areaId}`;
                                            return (
                                              <button
                                                key={areaId}
                                                type="button"
                                                onClick={() => toggleAvance(comp.id, areaId)}
                                                disabled={chipGuardando !== ''}
                                                aria-pressed={hecho}
                                                title={hecho ? 'Clic para desmarcar' : 'Clic para marcar como completado'}
                                                className={`max-sm:min-h-[44px] px-2.5 py-1.5 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1.5 transition-all disabled:cursor-wait ${
                                                  hecho
                                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40 hover:bg-emerald-500/25'
                                                    : 'bg-white/[0.06] text-white/60 border-white/15 hover:bg-white/[0.12] hover:text-white'
                                                }`}
                                              >
                                                {ocupado
                                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                                  : hecho ? <Check className="w-3 h-3" /> : <X className="w-3 h-3 text-white/30" />}
                                                {areaNombre(areaId)}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}

                                {/* Agregar componente */}
                                {compForm?.subId === sub.id ? (
                                  <form onSubmit={guardarComponente} className="rounded-xl border border-cyan-400/25 bg-cyan-500/[0.04] p-3 space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-[2fr_1.2fr_1.2fr_90px] gap-2">
                                      <input
                                        autoFocus
                                        required
                                        placeholder="Nombre de la pieza *"
                                        value={compForm.nombre}
                                        onChange={e => setCompForm({ ...compForm, nombre: e.target.value })}
                                        className={INPUT}
                                      />
                                      <input
                                        placeholder="Material (ej: MDF 18mm)"
                                        value={compForm.material}
                                        onChange={e => setCompForm({ ...compForm, material: e.target.value })}
                                        className={INPUT}
                                      />
                                      <input
                                        placeholder="Dimensiones (ej: 120×60 cm)"
                                        value={compForm.dimensiones}
                                        onChange={e => setCompForm({ ...compForm, dimensiones: e.target.value })}
                                        className={INPUT}
                                      />
                                      <input
                                        type="number"
                                        min="1"
                                        title="Piezas por mueble (el total se calcula con la cantidad de la partida)"
                                        value={compForm.cantidad}
                                        onChange={e => setCompForm({ ...compForm, cantidad: parseInt(e.target.value) || 1 })}
                                        className={`max-sm:text-base max-sm:min-h-[44px] ${INPUT} text-center font-mono font-bold`}
                                      />
                                    </div>

                                    <div>
                                      <p className="text-[10px] font-bold uppercase text-white/50 mb-1.5">Ruta de áreas — marca por cuáles pasa esta pieza</p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {areas.map(a => {
                                          const marcada = compForm.areas.includes(a.id);
                                          return (
                                            <label
                                              key={a.id}
                                              className={`max-sm:min-h-[44px] cursor-pointer px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border inline-flex items-center gap-1.5 transition-all ${
                                                marcada ? 'bg-sky-500/20 text-sky-300 border-sky-400/50' : 'bg-white/[0.06] text-white/60 border-white/10'
                                              }`}
                                            >
                                              <input
                                                type="checkbox"
                                                checked={marcada}
                                                onChange={() => setCompForm({
                                                  ...compForm,
                                                  areas: marcada ? compForm.areas.filter(x => x !== a.id) : [...compForm.areas, a.id],
                                                })}
                                                className="accent-sky-500 w-3 h-3"
                                              />
                                              {a.nombre}
                                            </label>
                                          );
                                        })}
                                      </div>
                                    </div>

                                    <div className="flex justify-end gap-2">
                                      <button type="button" onClick={() => setCompForm(null)} className="max-sm:min-h-[44px] text-xs text-white/60 hover:text-white px-3 py-2 rounded-xl border border-white/15 bg-white/[0.05]">
                                        Cancelar
                                      </button>
                                      <button type="submit" disabled={guardando} className="max-sm:min-h-[44px] text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded-xl inline-flex items-center gap-1.5">
                                        {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Guardar pieza
                                      </button>
                                    </div>
                                  </form>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setCompForm({ subId: sub.id, nombre: '', material: '', dimensiones: '', cantidad: 1, areas: [] })}
                                    className="max-sm:min-h-[44px] text-xs text-sky-400 font-bold hover:underline inline-flex items-center gap-1 px-1 py-1"
                                  >
                                    <Plus className="w-3.5 h-3.5" /> Agregar Componente
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Agregar subensamble */}
                      {subForm?.partidaId === partida.id ? (
                        <form onSubmit={guardarSubensamble} className="flex flex-col sm:flex-row gap-2">
                          <input
                            autoFocus
                            required
                            placeholder="Nombre del subensamble (ej: Estructura principal)"
                            value={subForm.nombre}
                            onChange={e => setSubForm({ ...subForm, nombre: e.target.value })}
                            className={`max-sm:text-base max-sm:min-h-[44px] ${INPUT} flex-1`}
                          />
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setSubForm(null)} className="max-sm:min-h-[44px] text-xs text-white/60 hover:text-white px-3 py-2 rounded-xl border border-white/15 bg-white/[0.05]">
                              Cancelar
                            </button>
                            <button type="submit" disabled={guardando} className="max-sm:min-h-[44px] text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded-xl inline-flex items-center gap-1.5">
                              {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Guardar
                            </button>
                          </div>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSubForm({ partidaId: partida.id, nombre: '' })}
                          className="max-sm:min-h-[44px] bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/30 text-xs font-bold px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 transition-all"
                        >
                          <Plus className="w-3.5 h-3.5" /> Agregar Subensamble
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
