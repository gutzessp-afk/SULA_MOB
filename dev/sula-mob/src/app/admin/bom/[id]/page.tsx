'use client';

/**
 * BOM — Espacio de Trabajo — /admin/bom/[id]
 * ────────────────────────────────────────────
 * Primero el Estatus del pedido (EstatusPedido.tsx): por qué no se puede explosionar todavía.
 * Mientras haya motivos sin resolver no se puede iniciar ni capturar materiales.
 * Luego la lista de materiales en blanco, lista para escribir.
 * A un lado, el botón "Partidas" abre el panel con las partidas del pedido:
 *   - Columna Partida: se elige una partida del pedido (sugerencias) o se escribe una
 *     clave propia; vacía = material general.
 *   - Elegir una partida en el panel muestra solo sus materiales y las líneas
 *     nuevas quedan asignadas a ella.
 *
 * El cronómetro arranca al escribir el primer material (o con "Iniciar Explosión"); se puede
 * pausar/reanudar (las pausas no cuentan), corregir a mano (Editar tiempo) o poner en 00:00:00
 * detenido (Reset; la fecha de inicio y los materiales se quedan). "Deshacer inicio" regresa todo a
 * pendiente, como si nunca se hubiera iniciado (por si se dio Iniciar por accidente).
 * La lista de materiales empieza minimizada; se abre con su encabezado.
 * Cada línea se marca con el cuadrito verde; cuando todas están verdes se habilita
 * "Terminar Explosión". Luego se exporta a Excel o PDF (todo o solo algunas partidas).
 *
 * Supabase Realtime sincroniza entre admins. Lo que se está escribiendo y aún no se
 * guarda se conserva encima de cada recarga para no perder teclas.
 *
 * RUTA: src/app/admin/bom/[id]/page.tsx
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Zap, Play, Square, Pencil, Check, Trash2, Clock, Calendar, Loader2,
  AlertCircle, CheckCircle2, ArrowLeft, Download, FileSpreadsheet,
  FileText, X, ListChecks, PanelRightClose, MapPin, Plus, Pause, RotateCcw, Timer, ChevronDown, ChevronRight, ShieldAlert, ShieldCheck, Undo2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRecargaAgrupada } from '@/hooks/useRecargaAgrupada';
import { motivosDe, motivosSinResolver } from '@/lib/bom-motivos';
import { ESTATUS_BOM, duracionLegible, estatusBom, formatTiempo, pausasDe, textoDias } from '@/lib/bom-tiempo';
import { EstatusPedido } from './EstatusPedido';

/* ═══ Tipos ═══ */

interface Proyecto {
  id: string; codigo: string; nombre: string;
  referencia_sucursal: string | null; prioridad: string;
}

interface Partida {
  id: string; clave: string; descripcion: string;
  cantidad: number; orden: number;
}

interface Detalle {
  id: string; explosion_id: string; partida_id: string | null;
  /** Clave propia cuando la línea no es de una partida del pedido ('' = general) */
  clave: string;
  material: string; descripcion: string; cantidad: number;
  unidad: string; checked: boolean; orden: number;
}

type CamposDetalle = Partial<Pick<Detalle, 'partida_id' | 'clave' | 'material' | 'descripcion' | 'cantidad' | 'unidad' | 'checked'>>;

/** Fila en blanco que todavía no existe en la base; se crea al escribir en ella */
interface Borrador {
  key: string; partida_id: string | null; clave: string;
  material: string; descripcion: string; cantidad: number; unidad: string;
  checked: boolean;
  creando: boolean;
}

interface Explosion {
  id: string; proyecto_id: string;
  estado: 'pendiente' | 'en_proceso' | 'completado';
  fecha_inicio: string | null; fecha_termino: string | null;
  duracion_seg: number;
  /** Segundos trabajados antes del tramo actual; tramo_inicio null = en pausa */
  acumulado_seg: number | null; tramo_inicio: string | null;
  usuario_id: string | null; usuario_nombre: string | null;
  /** { motivos } del estatus del pedido (src/lib/bom-motivos.ts) */
  checklist: unknown;
  notas: string | null;
  proyecto: Proyecto | null;
  partidas: Partida[];
  detalles: Detalle[];
}

type AccionExplosion = 'iniciar' | 'pausar' | 'reanudar' | 'reiniciar' | 'finalizar' | 'reabrir' | 'cancelar';

/** Segundos → { h, m, s } para el editor de tiempo */
const partesDe = (seg: number) => ({ h: Math.floor(seg / 3600), m: Math.floor((seg % 3600) / 60), s: seg % 60 });

/** 'todas' | 'general' (sin partida ni clave) | 'clave:XYZ' (clave propia) | id de partida */
type Filtro = string;

/* ═══ Constantes ═══ */

const TARJETA = 'rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]';

const UNIDADES = ['pza', 'm', 'm²', 'kg', 'lt', 'rollo', 'pliego', 'juego', 'par', 'caja'];

const COLUMNAS = 'grid grid-cols-[140px_minmax(0,1fr)_minmax(0,1.4fr)_70px_76px_36px_28px] gap-2';

/** Filas en blanco al abrir, las que agrega el botón y las que siempre quedan como mínimo */
const FILAS_INICIALES = 20;
const FILAS_AL_AGREGAR = 10;
const MINIMO_EN_BLANCO = 1;

/** id del <datalist> con las claves de las partidas (sugerencias de la columna Partida) */
const LISTA_PARTIDAS = 'bom-partidas';

/* ═══ Helpers ═══ */

function fechaLegible(iso: string): string {
  const d = new Date(iso);
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function diaSemana(iso: string): string {
  return ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date(iso).getDay()];
}

function nombreMes(iso: string): string {
  return ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][new Date(iso).getMonth()];
}

/** Una línea cuenta cuando tiene material o descripción */
const tieneContenido = (d: { material: string; descripcion: string }) => !!(d.material.trim() || d.descripcion.trim());

type Destino = { partida_id: string | null; clave: string };

/** A dónde van las filas nuevas según lo elegido en el panel */
const destinoDeFiltro = (filtro: Filtro): Destino =>
  filtro === 'todas' || filtro === 'general' ? { partida_id: null, clave: '' }
    : filtro.startsWith('clave:') ? { partida_id: null, clave: filtro.slice(6) }
      : { partida_id: filtro, clave: '' };

/** Grupo de una línea: id de partida, 'clave:XYZ' o 'general' */
const grupoDe = (d: { partida_id: string | null; clave?: string | null }) =>
  d.partida_id ?? (d.clave?.trim() ? `clave:${d.clave.trim()}` : 'general');

let secuenciaBorrador = 0;
function borradorNuevo(destino: Destino): Borrador {
  secuenciaBorrador += 1;
  return { key: `nuevo-${secuenciaBorrador}`, ...destino, material: '', descripcion: '', cantidad: 0, unidad: 'pza', checked: false, creando: false };
}

/** Fila sin material, descripción ni cantidad (la partida/clave sola no cuenta) */
const estaVacia = (b: Borrador) => !b.creando && !tieneContenido(b) && !b.cantidad;

/** Completa la lista para que haya al menos `minimo` filas vacías al final */
function rellenar(lista: Borrador[], destino: Destino, minimo = MINIMO_EN_BLANCO): Borrador[] {
  const vacias = lista.filter(estaVacia).length;
  const extra = Array.from({ length: Math.max(0, minimo - vacias) }, () => borradorNuevo(destino));
  return [...lista, ...extra];
}

/* ═══ Cronómetro: acumulado + tramo actual; en pausa se queda quieto ═══ */
function Cronometro({ acumulado, tramoInicio }: { acumulado: number; tramoInicio: string | null }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!tramoInicio) return;
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [tramoInicio]);
  const seg = acumulado + (tramoInicio ? Math.max(0, Math.floor((ahora - new Date(tramoInicio).getTime()) / 1000)) : 0);
  const color = tramoInicio ? 'text-blue-400' : 'text-amber-300';
  return (
    <div className="flex items-center gap-3">
      {tramoInicio ? <Clock className="w-5 h-5 text-blue-400 animate-pulse" /> : <Pause className="w-5 h-5 text-amber-300" />}
      <div className="text-right">
        <span className={`font-mono text-3xl sm:text-4xl font-bold tabular-nums ${color}`}>{formatTiempo(seg)}</span>
        {!tramoInicio && <p className="text-[11px] font-bold text-amber-300 tracking-wide">EN PAUSA</p>}
      </div>
    </div>
  );
}

/* ═══ Cantidad: texto local para poder escribir decimales ("1." no se convierte en "1") ═══ */
function CampoCantidad({ valor, disabled, onCambio }: { valor: number; disabled: boolean; onCambio: (n: number) => void }) {
  const [texto, setTexto] = useState(valor ? String(valor) : '');
  const [enfocado, setEnfocado] = useState(false);
  const mostrado = enfocado ? texto : (valor ? String(valor) : '');
  return (
    <input
      type="text"
      inputMode="decimal"
      value={mostrado}
      onFocus={() => { setTexto(valor ? String(valor) : ''); setEnfocado(true); }}
      onBlur={() => setEnfocado(false)}
      onChange={e => {
        const t = e.target.value.replace(',', '.');
        if (!/^\d*\.?\d*$/.test(t)) return;
        setTexto(t);
        onCambio(Number(t) || 0);
      }}
      placeholder="0"
      disabled={disabled}
      aria-label="Cantidad"
      className="bg-transparent border-0 text-sm text-white text-center placeholder:text-white/20 focus:outline-none disabled:opacity-50 w-full"
    />
  );
}

/* ═══ Una fila de la lista (línea guardada o fila en blanco) ═══ */
function FilaMaterial({
  valores, partidas, editable, borrador, guardando, onCambio, onEliminar,
}: {
  valores: { partida_id: string | null; clave: string; material: string; descripcion: string; cantidad: number; unidad: string; checked?: boolean };
  partidas: Partida[];
  editable: boolean;
  borrador: boolean;
  guardando: boolean;
  onCambio: (campos: CamposDetalle, inmediato?: boolean) => void;
  onEliminar?: () => void;
}) {
  const checked = !!valores.checked;
  const input = 'bg-transparent border-0 text-sm text-white placeholder:text-white/20 focus:outline-none disabled:opacity-50 w-full';
  return (
    <div className={`${COLUMNAS} items-center px-2 py-1.5 rounded-xl border ${checked ? 'bg-emerald-500/[0.05] border-emerald-400/20' : borrador ? 'bg-transparent border-white/[0.06] border-dashed' : 'bg-white/[0.02] border-white/10'}`}>
      <input
        type="text"
        list={LISTA_PARTIDAS}
        value={valores.partida_id ? (partidas.find(p => p.id === valores.partida_id)?.clave ?? '') : valores.clave}
        onChange={e => {
          // Si coincide con la clave de una partida del pedido se liga a ella; si no, es clave propia
          const texto = e.target.value;
          const partida = partidas.find(p => p.clave.trim().toLowerCase() === texto.trim().toLowerCase());
          onCambio(partida ? { partida_id: partida.id, clave: '' } : { partida_id: null, clave: texto.slice(0, 100) });
        }}
        placeholder="General"
        disabled={!editable}
        aria-label="Partida o clave"
        title="Elige una partida del pedido o escribe tu propia clave"
        className={`bg-transparent border-0 text-xs font-semibold placeholder:text-white/30 placeholder:font-normal focus:outline-none disabled:opacity-50 w-full ${valores.partida_id ? 'text-amber-300' : 'text-sky-300'}`}
      />
      <input type="text" value={valores.material} onChange={e => onCambio({ material: e.target.value })} placeholder="Material..." disabled={!editable} aria-label="Material" className={input} />
      <input type="text" value={valores.descripcion} onChange={e => onCambio({ descripcion: e.target.value })} placeholder="Descripción..." disabled={!editable} aria-label="Descripción" className={input} />
      <CampoCantidad valor={Number(valores.cantidad) || 0} disabled={!editable} onCambio={n => onCambio({ cantidad: n })} />
      <select
        value={valores.unidad}
        onChange={e => onCambio({ unidad: e.target.value }, true)}
        disabled={!editable}
        aria-label="Unidad"
        className="bg-transparent border-0 text-sm text-white focus:outline-none disabled:opacity-50 w-full appearance-none text-center"
      >
        {!UNIDADES.includes(valores.unidad) && <option value={valores.unidad} className="bg-[#1a1a2e]">{valores.unidad}</option>}
        {UNIDADES.map(u => <option key={u} value={u} className="bg-[#1a1a2e]">{u}</option>)}
      </select>
      <div className="flex justify-center">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={`Verificar ${valores.material || 'material'}`}
          onClick={() => onCambio({ checked: !checked }, true)}
          disabled={!editable}
          className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${checked ? 'bg-emerald-500 border-emerald-400 text-white' : 'border-white/20 hover:border-white/40 text-transparent'} disabled:opacity-50`}
        >
          <Check className="w-4 h-4" />
        </button>
      </div>
      <div className="flex justify-center">
        {guardando ? (
          <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" aria-label="Guardando" />
        ) : editable && onEliminar ? (
          <button type="button" onClick={onEliminar} className="text-red-400/40 hover:text-red-400" title="Eliminar" aria-label="Eliminar material">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   COMPONENTE PRINCIPAL — ESPACIO DE TRABAJO
   ═══════════════════════════════════════════ */

export default function BomTrabajoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const explosionId = params.id;

  const [data, setData] = useState<Explosion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [accionando, setAccionando] = useState(false);
  const [guardando, setGuardando] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [mostrarPartidas, setMostrarPartidas] = useState(true);
  const [listaAbierta, setListaAbierta] = useState(false);
  const [editandoTiempo, setEditandoTiempo] = useState<{ h: string; m: string; s: string } | null>(null);
  const [borradores, setBorradoresState] = useState<Borrador[]>(() => rellenar([], destinoDeFiltro('todas'), FILAS_INICIALES));
  const [showExport, setShowExport] = useState(false);
  const [selExport, setSelExport] = useState<Set<string>>(new Set());
  const [showCompletado, setShowCompletado] = useState(false);

  // Cambios sin guardar (esperando el debounce) y cambios enviados sin respuesta, por línea.
  // Se aplican encima de lo que llega del servidor para no perder lo que se está escribiendo.
  const pendientes = useRef<Record<string, CamposDetalle>>({});
  const enviando = useRef<Record<string, CamposDetalle>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const borradoresRef = useRef(borradores);
  const estadoRef = useRef<Explosion['estado'] | null>(null);
  const iniciando = useRef<Promise<boolean> | null>(null);

  const setBorradores = useCallback((fn: (prev: Borrador[]) => Borrador[]) => {
    borradoresRef.current = fn(borradoresRef.current);
    setBorradoresState(borradoresRef.current);
  }, []);

  /* ── Cargar datos ── */
  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/bom?id=${encodeURIComponent(explosionId)}`, { cache: 'no-store' });
      if (res.status === 404) { setData(null); setError('Explosión no encontrada.'); return; }
      if (!res.ok) throw new Error('Error al cargar');
      const d = await res.json();
      const exp = d.explosion as Explosion;
      exp.detalles = exp.detalles.map(det => ({ ...det, ...enviando.current[det.id], ...pendientes.current[det.id] }));
      estadoRef.current = exp.estado;
      setData(exp);
      setError('');
    } catch {
      setError('No se pudo cargar la explosión.');
    } finally {
      setCargando(false);
    }
  }, [explosionId]);

  /* ── Real-time: carga al abrir y recarga con cada cambio y al reconectarse ──
     Los eventos seguidos (cada guardado genera uno) se agrupan en una sola recarga. */
  const recargar = useRecargaAgrupada(cargar, 300);
  useEffect(() => {
    const ch = supabase
      .channel(`bom-trabajo-${explosionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bom_explosiones', filter: `id=eq.${explosionId}` }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bom_detalles', filter: `explosion_id=eq.${explosionId}` }, recargar)
      .subscribe(status => { if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR') recargar(); });
    // Primera carga de inmediato, sin esperar a que se conecte el tiempo real
    const primera = setTimeout(() => void cargar(), 0);
    return () => { clearTimeout(primera); void supabase.removeChannel(ch); };
  }, [explosionId, cargar, recargar]);

  /* ── PATCH de estado (iniciar, pausar, reanudar, reiniciar, finalizar, reabrir, editar_tiempo) ── */
  const patchExplosion = useCallback(async (accion: AccionExplosion | 'editar_tiempo', extra?: Record<string, unknown>): Promise<boolean> => {
    let res: Response;
    try {
      res = await fetch('/api/bom', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: explosionId, accion, ...extra }),
      });
    } catch {
      setAviso('No hay conexión con el servidor. Intenta de nuevo en unos segundos.');
      return false;
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setAviso(d.error || 'No se pudo completar la acción.');
      return false;
    }
    const d = await res.json().catch(() => ({}));
    if (d.explosion?.estado) estadoRef.current = d.explosion.estado;
    return true;
  }, [explosionId]);

  /* ── Si está pendiente, arrancar la explosión (una sola vez aunque se llame varias) ── */
  const asegurarIniciada = useCallback(async (): Promise<boolean> => {
    if (estadoRef.current === 'en_proceso') return true;
    if (estadoRef.current !== 'pendiente') return false;
    iniciando.current ??= patchExplosion('iniciar').then(async ok => { await cargar(); return ok; }).finally(() => { iniciando.current = null; });
    return iniciando.current;
  }, [patchExplosion, cargar]);

  /* ── Mandar al servidor los cambios acumulados de una línea ── */
  const enviarDetalle = useCallback(async (detalleId: string) => {
    clearTimeout(timers.current[detalleId]);
    const campos = pendientes.current[detalleId];
    if (!campos) return;
    delete pendientes.current[detalleId];
    enviando.current[detalleId] = { ...enviando.current[detalleId], ...campos };

    setGuardando(prev => new Set(prev).add(detalleId));
    try {
      const res = await fetch('/api/bom/detalles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: detalleId, ...campos }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAviso(d.error || 'No se pudo guardar un material.');
        recargar();
      }
    } catch {
      setAviso('No se pudo guardar un material. Revisa tu conexión.');
      recargar();
    } finally {
      // Si se guardó, la pantalla ya muestra el cambio y el evento en tiempo real confirma
      delete enviando.current[detalleId];
      setGuardando(prev => { const n = new Set(prev); n.delete(detalleId); return n; });
    }
  }, [recargar]);

  /* ── Cambiar campos de una línea guardada: se ve al instante y se guarda con debounce ── */
  const cambiarDetalle = useCallback((detalleId: string, campos: CamposDetalle, inmediato = false) => {
    setData(prev => prev && ({
      ...prev,
      detalles: prev.detalles.map(d => (d.id === detalleId ? { ...d, ...campos } : d)),
    }));
    pendientes.current[detalleId] = { ...pendientes.current[detalleId], ...campos };
    clearTimeout(timers.current[detalleId]);
    if (inmediato) void enviarDetalle(detalleId);
    else timers.current[detalleId] = setTimeout(() => void enviarDetalle(detalleId), 800);
  }, [enviarDetalle]);

  /* ── Crear en la base la fila en blanco donde se empezó a escribir ── */
  const crearDesdeBorrador = useCallback(async (key: string) => {
    const quitarCreando = () => setBorradores(prev => prev.map(b => (b.key === key ? { ...b, creando: false } : b)));

    if (!(await asegurarIniciada())) { quitarCreando(); return; }

    const inicial = borradoresRef.current.find(b => b.key === key);
    if (!inicial) return;
    const enviado = { partida_id: inicial.partida_id, clave: inicial.clave, material: inicial.material, descripcion: inicial.descripcion, cantidad: inicial.cantidad, unidad: inicial.unidad, checked: inicial.checked };

    try {
      const res = await fetch('/api/bom/detalles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ explosion_id: explosionId, ...enviado }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.detalle) { setAviso(d.error || 'No se pudo agregar el material.'); quitarCreando(); return; }

      // Lo que se escribió mientras se creaba pasa a la línea nueva
      const ultimo = borradoresRef.current.find(b => b.key === key) ?? inicial;
      const nuevo: Detalle = { ...d.detalle, ...enviado };
      setBorradores(prev => rellenar(prev.filter(b => b.key !== key), { partida_id: ultimo.partida_id, clave: ultimo.clave }));
      setData(prev => prev && ({
        ...prev,
        detalles: prev.detalles.some(x => x.id === nuevo.id)
          ? prev.detalles.map(x => (x.id === nuevo.id ? { ...x, ...enviado } : x))
          : [...prev.detalles, nuevo],
      }));
      const diferencias: CamposDetalle = {};
      if (ultimo.partida_id !== enviado.partida_id) diferencias.partida_id = ultimo.partida_id;
      if (ultimo.clave !== enviado.clave) diferencias.clave = ultimo.clave;
      if (ultimo.material !== enviado.material) diferencias.material = ultimo.material;
      if (ultimo.descripcion !== enviado.descripcion) diferencias.descripcion = ultimo.descripcion;
      if (ultimo.cantidad !== enviado.cantidad) diferencias.cantidad = ultimo.cantidad;
      if (ultimo.unidad !== enviado.unidad) diferencias.unidad = ultimo.unidad;
      if (ultimo.checked !== enviado.checked) diferencias.checked = ultimo.checked;
      if (Object.keys(diferencias).length) cambiarDetalle(nuevo.id, diferencias);
    } catch {
      setAviso('No se pudo agregar el material. Revisa tu conexión.');
      quitarCreando();
    }
  }, [asegurarIniciada, explosionId, setBorradores, cambiarDetalle]);

  /* ── Escribir en una fila en blanco ── */
  const cambiarBorrador = (key: string, campos: CamposDetalle) => {
    const actual = borradoresRef.current.find(b => b.key === key);
    if (!actual) return;
    const actualizado = { ...actual, ...campos };
    // Solo se crea la línea cuando ya tiene algo escrito (marcar el cuadrito no basta)
    const crear = !actual.creando && (tieneContenido(actualizado) || actualizado.cantidad > 0);
    setBorradores(prev => prev.map(b => (b.key === key ? { ...actualizado, creando: b.creando || crear } : b)));
    if (crear) void crearDesdeBorrador(key);
  };

  /* ── Botones de estado ── */
  const accionExplosion = async (tipo: AccionExplosion) => {
    if (tipo === 'cancelar' && !confirm('¿Deshacer el inicio? La explosión regresa a PENDIENTE como si nunca se hubiera iniciado: se borran la fecha de inicio, el término, el tiempo y las pausas. Los materiales y el estatus del pedido se quedan.')) return;
    if (tipo === 'reiniciar' && !confirm('¿Reset del cronómetro? Queda en 00:00:00 detenido, como si no hubiera empezado (da "Reanudar" para que corra). La fecha de inicio y los materiales se quedan.')) return;
    setAccionando(true);
    try {
      // Antes de terminar, guardar lo que esté pendiente
      if (tipo === 'finalizar') await Promise.all(Object.keys(pendientes.current).map(enviarDetalle));
      const ok = tipo === 'iniciar' ? await asegurarIniciada() : await patchExplosion(tipo);
      if (ok && tipo === 'finalizar') setShowCompletado(true);
      if (ok && (tipo === 'iniciar' || tipo === 'reabrir')) setListaAbierta(true);
      if (ok && tipo === 'cancelar') { setEditandoTiempo(null); setListaAbierta(false); }
      await cargar();
    } finally {
      setAccionando(false);
    }
  };

  /* ── Editar el tiempo a mano ── */
  const guardarTiempo = async () => {
    if (!editandoTiempo) return;
    const segundos = (Number(editandoTiempo.h) || 0) * 3600 + (Number(editandoTiempo.m) || 0) * 60 + (Number(editandoTiempo.s) || 0);
    setAccionando(true);
    try {
      if (await patchExplosion('editar_tiempo', { segundos })) setEditandoTiempo(null);
      await cargar();
    } finally {
      setAccionando(false);
    }
  };

  /* ── Guardar el estatus del pedido (motivos por los que no se puede explosionar) ── */
  const guardarEstatus = useCallback(async (motivos: unknown[], notas: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/bom', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: explosionId, accion: 'guardar_estatus', motivos, notas }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAviso(d.error || 'No se pudo guardar el estatus.');
      }
      await cargar();
      return res.ok;
    } catch {
      setAviso('No se pudo guardar el estatus: no hay conexión con el servidor. Vuelve a intentarlo en unos segundos.');
      return false;
    }
  }, [explosionId, cargar]);

  /* ── Eliminar línea ── */
  const eliminarLinea = async (detalleId: string) => {
    clearTimeout(timers.current[detalleId]);
    delete pendientes.current[detalleId];
    setData(prev => prev && ({ ...prev, detalles: prev.detalles.filter(d => d.id !== detalleId) }));
    try {
      const res = await fetch(`/api/bom/detalles?id=${encodeURIComponent(detalleId)}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAviso(d.error || 'No se pudo eliminar el material.');
      }
    } catch {
      setAviso('No se pudo eliminar el material: no hay conexión con el servidor.');
    }
    recargar();
  };

  /* ── Agregar o quitar filas en blanco ── */
  const agregarFilas = () => {
    const destino = destinoDeFiltro(filtro);
    setBorradores(prev => [...prev, ...Array.from({ length: FILAS_AL_AGREGAR }, () => borradorNuevo(destino))]);
  };
  const quitarBorrador = (key: string) => setBorradores(prev => prev.filter(b => b.key !== key || b.creando));
  const quitarVacias = () => setBorradores(prev => rellenar(prev.filter(b => !estaVacia(b)), destinoDeFiltro(filtro)));

  /* ── Elegir partida en el panel: filtra la lista y asigna las filas en blanco ── */
  const elegirFiltro = (nuevo: Filtro) => {
    setFiltro(nuevo);
    const destino = destinoDeFiltro(nuevo);
    setBorradores(prev => prev.map(b => (!b.creando && !tieneContenido(b) && !b.cantidad ? { ...b, ...destino } : b)));
  };

  /* ── Derivados ── */
  const detalles = useMemo(() => data?.detalles ?? [], [data]);
  const utiles = detalles.filter(tieneContenido);
  const totalChecked = utiles.filter(d => d.checked).length;
  const todasVerdes = utiles.length > 0 && totalChecked === utiles.length;

  const conteoPorPartida = useMemo(() => {
    const map: Record<string, { total: number; checked: number }> = {};
    for (const d of detalles) {
      if (!tieneContenido(d)) continue;
      const c = (map[grupoDe(d)] ??= { total: 0, checked: 0 });
      c.total++;
      if (d.checked) c.checked++;
    }
    return map;
  }, [detalles]);

  const opcionesExport = useMemo(() => {
    const ops = (data?.partidas ?? []).map(p => ({ id: p.id, clave: p.clave, descripcion: p.descripcion }));
    const sinPartida = Object.keys(conteoPorPartida).some(k => k === 'general' || k.startsWith('clave:'));
    if (sinPartida) ops.unshift({ id: 'general', clave: 'General', descripcion: 'Materiales generales y claves propias' });
    return ops;
  }, [data, conteoPorPartida]);

  const abrirExportar = () => {
    setSelExport(new Set(opcionesExport.map(o => o.id)));
    setShowExport(true);
  };

  /* ═══ RENDER ═══ */

  if (cargando) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>;
  if (!data) return (
    <div className="space-y-4 max-w-6xl mx-auto px-2 sm:px-0">
      <button type="button" onClick={() => router.push('/admin/bom')} className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Volver a BOM
      </button>
      <div className={`${TARJETA} p-6 flex items-center gap-3 text-red-400`}>
        <AlertCircle className="w-5 h-5" /><span className="text-sm">{error || 'Explosión no encontrada.'}</span>
      </div>
    </div>
  );

  const pendientesEstatus = motivosSinResolver(data.checklist).length;
  const bloqueado = data.estado === 'pendiente' && pendientesEstatus > 0;
  const editable = data.estado !== 'completado' && !bloqueado;
  const motivosGuardados = motivosDe(data.checklist);
  const partidaActiva = data.partidas.find(p => p.id === filtro);
  const visibles = detalles.filter(d =>
    filtro === 'todas' ? true : grupoDe(d) === filtro
  );
  // Claves propias que ya se usaron (para el panel)
  const clavesPropias = [...new Set(detalles.filter(d => !d.partida_id && d.clave?.trim()).map(d => d.clave.trim()))].sort();
  const todasExport = selExport.size === opcionesExport.length;
  const qsExport = todasExport ? '' : `&partidas=${[...selExport].join(',')}`;
  const urlExport = (formato: 'xlsx' | 'pdf') => `/api/bom/exportar?id=${encodeURIComponent(explosionId)}&formato=${formato}${qsExport}`;

  const itemPanel = (activo: boolean) =>
    `w-full text-left px-3 py-2.5 rounded-xl border transition-all ${activo ? 'bg-amber-500/10 border-amber-400/40' : 'border-transparent hover:bg-white/[0.05]'}`;

  return (
    <div className="space-y-5 max-w-6xl mx-auto px-2 sm:px-0 pb-8">

      {/* ═══ Modal "¡Explosión Terminada!" ═══ */}
      {showCompletado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" role="dialog" aria-modal="true" aria-labelledby="bom-terminada">
          <div className={`${TARJETA} p-8 sm:p-10 text-center max-w-md w-full`}>
            <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
            <h2 id="bom-terminada" className="text-2xl font-bold text-white mb-2">¡Explosión Terminada!</h2>
            <p className="text-sm text-white/60 mb-1">{data.proyecto?.codigo} — {data.proyecto?.nombre}</p>
            <dl className="text-left text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 my-5 px-1">
              <dt className="text-white/45">Inicio</dt>
              <dd className="text-white/85">{data.fecha_inicio ? fechaLegible(data.fecha_inicio) : '—'}</dd>
              <dt className="text-white/45">Término</dt>
              <dd className="text-white/85">{data.fecha_termino ? fechaLegible(data.fecha_termino) : '—'}</dd>
              <dt className="text-white/45">Tiempo trabajado</dt>
              <dd><span className="text-emerald-400 font-mono font-bold">{formatTiempo(data.duracion_seg)}</span> <span className="text-white/45">({duracionLegible(data.duracion_seg)})</span></dd>
              <dt className="text-white/45">Días</dt>
              <dd className="text-white/85">{textoDias(data.fecha_inicio, data.fecha_termino)}</dd>
              <dt className="text-white/45">Pausas</dt>
              <dd className="text-white/85">{pausasDe(data.checklist)}</dd>
            </dl>
            <div className="flex gap-3 justify-center flex-wrap">
              <button type="button" onClick={() => { setShowCompletado(false); abrirExportar(); }} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold">
                <Download className="w-4 h-4" /> Exportar
              </button>
              <button type="button" onClick={() => setShowCompletado(false)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.1] hover:bg-white/[0.15] text-white/80 text-sm border border-white/10">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Modal Exportar ═══ */}
      {showExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" role="dialog" aria-modal="true" aria-labelledby="bom-exportar">
          <div className={`${TARJETA} p-6 sm:p-8 max-w-lg w-full`}>
            <div className="flex items-center justify-between mb-4">
              <h3 id="bom-exportar" className="text-lg font-bold text-white">Exportar Explosión</h3>
              <button type="button" onClick={() => setShowExport(false)} aria-label="Cerrar" className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-white/50">Qué exportar ({selExport.size} de {opcionesExport.length}):</p>
              <button
                type="button"
                onClick={() => setSelExport(todasExport ? new Set() : new Set(opcionesExport.map(o => o.id)))}
                className="text-xs text-blue-300 hover:text-blue-200"
              >
                {todasExport ? 'Quitar todas' : 'Seleccionar todas'}
              </button>
            </div>

            <div className="space-y-1 max-h-60 overflow-y-auto mb-4">
              {opcionesExport.map(o => (
                <label key={o.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.05] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selExport.has(o.id)}
                    onChange={() => setSelExport(prev => {
                      const n = new Set(prev);
                      if (n.has(o.id)) n.delete(o.id); else n.add(o.id);
                      return n;
                    })}
                    className="w-4 h-4 rounded accent-blue-500"
                  />
                  <span className="text-sm text-white/80"><span className="font-bold text-white/60">{o.clave}</span> — {o.descripcion}</span>
                </label>
              ))}
            </div>

            {selExport.size === 0 ? (
              <p className="text-xs text-amber-300">Selecciona al menos una opción.</p>
            ) : (
              <div className="flex gap-3 flex-wrap">
                <a href={urlExport('xlsx')} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">
                  <FileSpreadsheet className="w-4 h-4" /> Descargar Excel
                </a>
                <a href={urlExport('pdf')} target="_blank" rel="noopener" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600/80 hover:bg-red-500 text-white text-sm font-semibold">
                  <FileText className="w-4 h-4" /> Descargar PDF
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Volver ═══ */}
      <button type="button" onClick={() => router.push('/admin/bom')} className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Volver a BOM
      </button>

      {/* ═══ Aviso de error ═══ */}
      {aviso && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-400/30 bg-red-500/10 text-red-300 text-sm" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{aviso}</span>
          <button type="button" onClick={() => setAviso('')} aria-label="Cerrar aviso" className="text-red-300/60 hover:text-red-200"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ═══ Header del pedido ═══ */}
      <div className={`${TARJETA} px-5 py-5 sm:px-8 sm:py-6`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <Zap className="w-5 h-5 text-amber-400" />
              <h1 className="text-lg sm:text-xl font-bold text-white">{data.proyecto?.codigo || '—'}</h1>
              <span className="text-white/40">·</span>
              <span className="text-sm text-white/70">{data.proyecto?.nombre || 'Sin nombre'}</span>
              <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${ESTATUS_BOM[estatusBom(data)].css}`}>{ESTATUS_BOM[estatusBom(data)].txt}</span>
            </div>
            {data.proyecto?.referencia_sucursal && (
              <p className="text-xs text-white/45 mt-1.5 flex items-center gap-1.5">
                <MapPin className="w-3 h-3" /> Sucursal: <span className="text-white/70">{data.proyecto.referencia_sucursal}</span>
              </p>
            )}
          </div>

          {data.estado === 'en_proceso' && <Cronometro acumulado={data.acumulado_seg || 0} tramoInicio={data.tramo_inicio} />}
          {data.estado === 'completado' && (
            <div className="text-right space-y-1">
              <span className="text-emerald-400 font-mono text-2xl font-bold">{formatTiempo(data.duracion_seg)}</span>
              <p className="text-[11px] text-white/45">Tiempo trabajado</p>
              {data.fecha_inicio && <p className="text-[11px] text-white/45">{diaSemana(data.fecha_inicio)} · {nombreMes(data.fecha_inicio)}</p>}
            </div>
          )}
        </div>

        {(data.fecha_inicio || data.fecha_termino) && (
          <div className="flex items-center gap-x-6 gap-y-1 mt-3 text-xs text-white/45 flex-wrap">
            {data.fecha_inicio && <span><Calendar className="w-3 h-3 inline mr-1" />Inicio: <span className="text-white/70">{fechaLegible(data.fecha_inicio)}</span></span>}
            {data.fecha_termino && <span><Calendar className="w-3 h-3 inline mr-1" />Término: <span className="text-white/70">{fechaLegible(data.fecha_termino)}</span></span>}
            {data.fecha_inicio && <span>Día: <span className="text-white/70">{diaSemana(data.fecha_inicio)}</span></span>}
            {data.fecha_inicio && <span>Mes: <span className="text-white/70">{nombreMes(data.fecha_inicio)}</span></span>}
            {data.estado === 'completado' && data.fecha_inicio && data.fecha_termino && (() => {
              const total = Math.max(0, Math.round((new Date(data.fecha_termino).getTime() - new Date(data.fecha_inicio).getTime()) / 1000));
              return (
                <>
                  <span>Tiempo total: <span className="text-white/70 font-mono">{formatTiempo(total)}</span></span>
                  <span>En pausa: <span className="text-white/70 font-mono">{formatTiempo(Math.max(0, total - data.duracion_seg))}</span></span>
                  <span>{textoDias(data.fecha_inicio, data.fecha_termino)}</span>
                  <span>Pausas: <span className="text-white/70">{pausasDe(data.checklist)}</span></span>
                </>
              );
            })()}
          </div>
        )}

        <div className="flex items-center gap-3 mt-4 flex-wrap">
          {data.estado === 'pendiente' && (
            <>
              <button type="button" onClick={() => accionExplosion('iniciar')} disabled={accionando || bloqueado} className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold ${bloqueado ? 'bg-white/[0.05] text-white/35 border border-white/10 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50'}`}>
                {accionando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {bloqueado ? `Resuelve ${pendientesEstatus} motivo(s) para iniciar` : 'Iniciar Explosión'}
              </button>
              {!bloqueado && <span className="text-xs text-white/40">o empieza a escribir en la lista y el cronómetro arranca solo.</span>}
            </>
          )}
          {data.estado === 'en_proceso' && (
            <>
              {data.tramo_inicio ? (
                <button type="button" onClick={() => accionExplosion('pausar')} disabled={accionando} className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-sm font-semibold border border-amber-400/30 disabled:opacity-50">
                  <Pause className="w-4 h-4" /> Pausar
                </button>
              ) : (
                <button type="button" onClick={() => accionExplosion('reanudar')} disabled={accionando} className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50">
                  <Play className="w-4 h-4" /> Reanudar
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const p = partesDe(Math.round((data.acumulado_seg || 0) + (data.tramo_inicio ? (Date.now() - new Date(data.tramo_inicio).getTime()) / 1000 : 0)));
                  setEditandoTiempo({ h: String(p.h), m: String(p.m), s: String(p.s) });
                }}
                disabled={accionando}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white/70 text-sm font-semibold border border-white/10 disabled:opacity-50"
              >
                <Timer className="w-4 h-4" /> Editar tiempo
              </button>
              <button type="button" onClick={() => accionExplosion('reiniciar')} disabled={accionando} title="Pone el cronómetro en 00:00:00 detenido" className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white/70 text-sm font-semibold border border-white/10 disabled:opacity-50">
                <RotateCcw className="w-4 h-4" /> Reset
              </button>
              <button type="button" onClick={() => accionExplosion('cancelar')} disabled={accionando} title="Regresa a pendiente, como si nunca se hubiera iniciado" className="inline-flex items-center gap-2 px-4 py-3 rounded-xl text-red-300/80 hover:text-red-200 hover:bg-red-500/10 text-sm font-semibold border border-red-400/20 disabled:opacity-50">
                <Undo2 className="w-4 h-4" /> Deshacer inicio
              </button>
            </>
          )}
          {data.estado === 'en_proceso' && (
            <button
              type="button"
              onClick={() => accionExplosion('finalizar')}
              disabled={accionando || !todasVerdes}
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold ${todasVerdes ? 'bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50' : 'bg-white/[0.05] text-white/30 border border-white/10 cursor-not-allowed'}`}
            >
              {accionando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              {todasVerdes
                ? 'Terminar Explosión'
                : utiles.length === 0 ? 'Agrega materiales para terminar' : `Faltan ${utiles.length - totalChecked} checks`}
            </button>
          )}
          {data.estado === 'completado' && (
            <button type="button" onClick={() => accionExplosion('reabrir')} disabled={accionando} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600/30 hover:bg-amber-500/40 text-amber-300 text-xs font-semibold border border-amber-400/30 disabled:opacity-50">
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
          )}
          {data.estado === 'completado' && (
            <button type="button" onClick={() => accionExplosion('cancelar')} disabled={accionando} title="Regresa a pendiente, como si nunca se hubiera iniciado" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-red-300/80 hover:text-red-200 hover:bg-red-500/10 text-xs font-semibold border border-red-400/20 disabled:opacity-50">
              <Undo2 className="w-3.5 h-3.5" /> Deshacer inicio
            </button>
          )}
          {data.estado !== 'pendiente' && (
            <button type="button" onClick={abrirExportar} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600/30 hover:bg-blue-500/40 text-blue-300 text-xs font-semibold border border-blue-400/30">
              <Download className="w-3.5 h-3.5" /> Exportar
            </button>
          )}
        </div>

        {editandoTiempo && data.estado === 'en_proceso' && (
          <form
            onSubmit={e => { e.preventDefault(); void guardarTiempo(); }}
            className="mt-4 flex items-end gap-2 flex-wrap p-3 rounded-xl border border-white/10 bg-white/[0.03]"
          >
            {(['h', 'm', 's'] as const).map(campo => (
              <label key={campo} className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-white/40">
                {campo === 'h' ? 'Horas' : campo === 'm' ? 'Minutos' : 'Segundos'}
                <input
                  type="number"
                  min={0}
                  max={campo === 'h' ? 999 : 59}
                  value={editandoTiempo[campo]}
                  onChange={e => setEditandoTiempo(prev => prev && { ...prev, [campo]: e.target.value })}
                  className="w-20 px-2 py-2 rounded-lg bg-white/[0.05] border border-white/10 text-white font-mono text-base text-center focus:outline-none focus:border-blue-500/50"
                />
              </label>
            ))}
            <button type="submit" disabled={accionando} className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50">Guardar tiempo</button>
            <button type="button" onClick={() => setEditandoTiempo(null)} className="px-3 py-2.5 rounded-xl text-white/55 hover:text-white text-sm">Cancelar</button>
          </form>
        )}

        {utiles.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-white/50 mb-1">
              <span>Progreso de verificación</span>
              <span className="text-white/80 font-bold">{totalChecked} / {utiles.length}</span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${(totalChecked / utiles.length) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* ═══ ESTATUS DEL PEDIDO ═══ */}
      <EstatusPedido
        key={data.id}
        motivos={motivosGuardados}
        notas={data.notas ?? ''}
        editable={data.estado === 'pendiente'}
        explosionId={data.id}
        onGuardar={guardarEstatus}
      />

      {/* ═══ INDICADOR DE ESTADO ═══ */}
      {(() => {
        const est = estatusBom(data);
        const listo = est === 'pendiente';
        const titulo = est === 'bloqueado' ? 'BLOQUEADO' : listo ? 'LISTO PARA EXPLOSIONAR' : ESTATUS_BOM[est].txt;
        const sub = est === 'bloqueado'
          ? `Faltan ${pendientesEstatus} motivo(s) del estatus por resolver.`
          : listo ? 'Todos los motivos del estatus están resueltos. Ya puedes iniciar la explosión.'
            : est === 'completado' ? `Terminada · ${duracionLegible(data.duracion_seg)} trabajados · ${textoDias(data.fecha_inicio, data.fecha_termino)}`
              : est === 'pausado' ? 'El cronómetro está detenido. Da "Reanudar" para continuar.'
                : 'Explosión en curso.';
        const css = est === 'bloqueado' ? 'border-red-400/40 bg-red-500/10 text-red-200'
          : listo || est === 'completado' ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
            : est === 'pausado' ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
              : 'border-blue-400/40 bg-blue-500/10 text-blue-200';
        return (
          <div className={`flex items-center gap-4 px-5 py-4 rounded-2xl border-2 ${css}`} role="status">
            {est === 'bloqueado' ? <ShieldAlert className="w-8 h-8 shrink-0" /> : <ShieldCheck className="w-8 h-8 shrink-0" />}
            <div className="min-w-0">
              <p className="text-lg sm:text-xl font-extrabold tracking-wide">{titulo}</p>
              <p className="text-xs sm:text-sm opacity-80">{sub}</p>
            </div>
          </div>
        );
      })()}

      {/* ═══ LISTA DE MATERIALES + PANEL DE PARTIDAS ═══ */}
      <div className={`grid gap-4 items-start ${listaAbierta && mostrarPartidas ? 'lg:grid-cols-[minmax(0,1fr)_300px]' : ''}`}>

        {/* ── Lista ── */}
        <div className={`${TARJETA} p-4 sm:p-5 space-y-3 min-w-0`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setListaAbierta(v => !v)}
              aria-expanded={listaAbierta}
              className="min-w-0 flex items-center gap-2 text-left group"
            >
              {listaAbierta ? <ChevronDown className="w-5 h-5 text-white/60 shrink-0" /> : <ChevronRight className="w-5 h-5 text-white/60 shrink-0" />}
              <span className="min-w-0">
              <h2 className="text-sm font-bold text-white group-hover:text-blue-200">Lista de materiales</h2>
              <p className="text-xs text-white/45 truncate">
                {!listaAbierta ? `${utiles.length} materiales · ${totalChecked}/${utiles.length} verificados — clic para ${utiles.length || editable ? 'abrir' : 'ver'}` : filtro === 'todas' ? 'Todas las partidas' : filtro === 'general' ? 'Materiales generales (sin partida)' : filtro.startsWith('clave:') ? `Clave propia: ${filtro.slice(6)}` : partidaActiva ? `${partidaActiva.clave} — ${partidaActiva.descripcion}` : ''}
              </p>
              </span>
            </button>
            {listaAbierta && <div className="flex items-center gap-2">
              {filtro !== 'todas' && (
                <button type="button" onClick={() => elegirFiltro('todas')} className="text-xs text-white/50 hover:text-white px-2 py-1.5">Ver todas</button>
              )}
              <button
                type="button"
                onClick={() => setMostrarPartidas(v => !v)}
                aria-pressed={mostrarPartidas}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${mostrarPartidas ? 'bg-amber-500/15 text-amber-300 border-amber-400/40' : 'bg-white/[0.05] text-white/70 border-white/10 hover:bg-white/[0.1]'}`}
              >
                <ListChecks className="w-4 h-4" /> Partidas ({data.partidas.length})
              </button>
            </div>}
          </div>

          {listaAbierta && (<>
          <datalist id={LISTA_PARTIDAS}>
            {data.partidas.map(p => <option key={p.id} value={p.clave}>{p.descripcion}</option>)}
          </datalist>

          <div className="overflow-x-auto -mx-1 px-1">
            <div className="min-w-[640px] space-y-1.5">
              <div className={`${COLUMNAS} px-2 text-[10px] text-white/40 font-bold uppercase tracking-wide`}>
                <span>Partida / Clave</span>
                <span>Material</span>
                <span>Descripción</span>
                <span className="text-center">Cant.</span>
                <span className="text-center">Unidad</span>
                <span className="text-center">✓</span>
                <span />
              </div>

              {visibles.map(det => (
                <FilaMaterial
                  key={det.id}
                  valores={det}
                  partidas={data.partidas}
                  editable={editable && data.estado === 'en_proceso'}
                  borrador={false}
                  guardando={guardando.has(det.id)}
                  onCambio={(campos, inmediato) => cambiarDetalle(det.id, campos, inmediato)}
                  onEliminar={() => eliminarLinea(det.id)}
                />
              ))}

              {editable && borradores.map(b => (
                <FilaMaterial
                  key={b.key}
                  valores={b}
                  partidas={data.partidas}
                  editable
                  borrador
                  guardando={b.creando}
                  onCambio={campos => cambiarBorrador(b.key, campos)}
                  onEliminar={() => quitarBorrador(b.key)}
                />
              ))}

              {bloqueado && (
                <p className="text-xs text-red-300/80 text-center py-4">Resuelve los motivos del estatus del pedido para empezar la explosión.</p>
              )}
              {!editable && !bloqueado && visibles.length === 0 && (
                <p className="text-xs text-white/30 text-center py-4">Sin materiales registrados.</p>
              )}
            </div>
          </div>

          {editable && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <button
                type="button"
                onClick={agregarFilas}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-white/15 hover:border-blue-400/40 hover:bg-blue-500/[0.05] text-white/60 hover:text-blue-300 text-xs font-semibold transition-all"
              >
                <Plus className="w-4 h-4" /> Agregar {FILAS_AL_AGREGAR} filas
              </button>
              {borradores.filter(estaVacia).length > MINIMO_EN_BLANCO && (
                <button type="button" onClick={quitarVacias} className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl text-white/45 hover:text-red-300 text-xs transition-all">
                  <Trash2 className="w-3.5 h-3.5" /> Quitar filas vacías
                </button>
              )}
              <span className="text-[11px] text-white/35 ml-auto">{visibles.filter(tieneContenido).length} materiales · {borradores.filter(estaVacia).length} filas vacías</span>
            </div>
          )}
          </>)}
        </div>

        {/* ── Panel de partidas ── */}
        {listaAbierta && mostrarPartidas && (
          <aside className={`${TARJETA} p-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto`} aria-label="Partidas del pedido">
            <div className="flex items-center justify-between px-2 pb-2">
              <h2 className="text-sm font-bold text-white">Partidas del pedido</h2>
              <button type="button" onClick={() => setMostrarPartidas(false)} aria-label="Ocultar partidas" className="text-white/40 hover:text-white">
                <PanelRightClose className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1">
              <button type="button" onClick={() => elegirFiltro('todas')} className={itemPanel(filtro === 'todas')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-white/85 font-semibold">Todas</span>
                  <span className="text-xs text-white/40">{totalChecked}/{utiles.length}</span>
                </div>
              </button>
              <button type="button" onClick={() => elegirFiltro('general')} className={itemPanel(filtro === 'general')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-white/70">General <span className="text-white/35 text-xs">(sin partida)</span></span>
                  <span className="text-xs text-white/40">{conteoPorPartida.general ? `${conteoPorPartida.general.checked}/${conteoPorPartida.general.total}` : '—'}</span>
                </div>
              </button>

              {clavesPropias.length > 0 && (
                <>
                  <p className="px-3 pt-2 text-[10px] font-bold uppercase tracking-wide text-white/35">Claves propias</p>
                  {clavesPropias.map(clave => {
                    const k = `clave:${clave}`;
                    const c = conteoPorPartida[k];
                    const verde = !!c && c.total > 0 && c.checked === c.total;
                    return (
                      <button key={k} type="button" onClick={() => elegirFiltro(k)} className={itemPanel(filtro === k)}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-sky-300 truncate">{clave}</span>
                          <span className="flex items-center gap-1.5 text-xs shrink-0">
                            {c && <span className={verde ? 'text-emerald-400 font-bold' : 'text-white/50'}>{c.checked}/{c.total}</span>}
                            {verde && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}

              <div className="border-t border-white/10 my-2" />
              <p className="px-3 text-[10px] font-bold uppercase tracking-wide text-white/35">Partidas del pedido</p>

              {data.partidas.length === 0 ? (
                <p className="text-xs text-white/35 px-3 py-2">Este pedido no tiene partidas.</p>
              ) : data.partidas.map(p => {
                const c = conteoPorPartida[p.id];
                const verde = !!c && c.total > 0 && c.checked === c.total;
                return (
                  <button key={p.id} type="button" onClick={() => elegirFiltro(p.id)} className={itemPanel(filtro === p.id)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-amber-400">{p.clave}</span>
                      <span className="flex items-center gap-1.5 text-xs shrink-0">
                        <span className="text-white/40">×{p.cantidad}</span>
                        {c && <span className={verde ? 'text-emerald-400 font-bold' : 'text-white/50'}>{c.checked}/{c.total}</span>}
                        {verde && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                      </span>
                    </div>
                    <p className="text-xs text-white/65 mt-0.5 line-clamp-2">{p.descripcion}</p>
                  </button>
                );
              })}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
