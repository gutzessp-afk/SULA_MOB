'use client';

/**
 * HojaExplosion.tsx
 * ─────────────────
 * La "Hoja de explosión" de /admin/bom/[id]: el formato del Excel de SULA dentro del sistema,
 * con revisiones REV-00, REV-01…
 *
 *   · Arrastrar el Excel (EXPLOSION DE MATERIALES … REV-00.xlsx) lo importa: se ve el encabezado del
 *     formato (cliente, pedido, orden de producción…) y abajo toda la plantilla de materiales.
 *   · La revisión importada queda cerrada. Al modificar cualquier cosa, el sistema abre la siguiente
 *     revisión (REV-01) automáticamente y pinta los cambios con la leyenda de SULA:
 *       azul = actualización actual · rosa = actualización anterior · rojo = disminución.
 *   · "Descargar Excel" baja la revisión en el mismo formato, nombrada por pedido o por sucursal.
 *   · OC y Compra ya aparecen como columnas, vacías y deshabilitadas (se definen después).
 *
 * Responsive: en escritorio es una tabla tipo hoja (con scroll horizontal si no cabe);
 * en celular cada material es una tarjeta.
 *
 * Datos: /api/bom/revisiones (+ /lineas, /importar, /excel). Supabase Realtime recarga cuando
 * otro admin cambia algo. Lo que se está escribiendo se conserva encima de cada recarga.
 *
 * RUTA: src/app/admin/bom/[id]/HojaExplosion.tsx
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Download, FileSpreadsheet, History, Info, ListChecks,
  Loader2, Lock, Plus, Search, Trash2, Undo2, Upload, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRecargaAgrupada } from '@/hooks/useRecargaAgrupada';
import {
  agruparPorUnidad, CLASIFICACIONES, colorClasificacion, colorMarca, compararRevision, costoEstimado, etiquetaRev, LEYENDA,
  lineaConContenido, MONEDAS, normalizar, UNIDADES,
  type CambiosLinea, type CampoEditable, type EncabezadoRev, type LineaRev, type Marca, type NombrarPor, type Revision,
} from '@/lib/explosion-revisiones';

/* ═══ Tipos ═══ */

export interface ResumenHoja {
  numero: number;
  estado: Revision['estado'];
  /** Materiales con clave o descripción en la última revisión */
  materiales: number;
}

interface Partida { id: string; clave: string; descripcion: string; cantidad: number }

interface Props {
  explosionId: string;
  estado: 'pendiente' | 'en_proceso' | 'completado';
  /** true = hay motivos del estatus sin resolver: no se puede capturar */
  bloqueado: boolean;
  partidas: Partida[];
  /** Inicia la explosión si está pendiente (el cronómetro arranca al primer cambio) */
  asegurarIniciada: () => Promise<boolean>;
  onAviso: (mensaje: string) => void;
  onResumen: (resumen: ResumenHoja | null) => void;
  /** La página llama a esta función antes de "Terminar" para guardar lo pendiente */
  guardarRef: MutableRefObject<(() => Promise<void>) | null>;
}

/* ═══ Constantes y helpers ═══ */

const TARJETA = 'rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]';

/** Columnas de la tabla (escritorio): Clave · Descripción · Unidad · Clasificación · Moneda · Costo · Cantidad · Costo est. · OC · Compra · borrar */
const COLUMNAS = 'grid grid-cols-[104px_minmax(200px,1fr)_88px_112px_108px_90px_96px_108px_64px_54px_28px]';

const ETIQUETA_CAMPO: Record<CampoEditable, string> = {
  clave: 'clave', descripcion: 'descripción', unidad: 'unidad', clasificacion: 'clasificación',
  moneda: 'moneda', costo: 'costo', cantidad: 'cantidad',
};

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
function fechaCorta(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate()} ${MESES[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const dinero = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cantidadTxt = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 4 });

/** Texto para el tooltip de una línea cambiada: "cantidad: 10 → 8 · costo: 5 → 6" */
function detalleCambios(campos: CampoEditable[] | undefined, antes: LineaRev | undefined, ahora: LineaRev): string {
  if (!campos?.length || !antes) return '';
  return campos.map(c => `${ETIQUETA_CAMPO[c]}: ${String(antes[c] ?? '—')} → ${String(ahora[c] ?? '—')}`).join(' · ');
}

/** Estilos de fila según la leyenda de revisiones (sobre la hoja clara) */
function estiloMarca(marca: Marca | undefined): { fondo?: string; texto: string } {
  if (marca === 'disminucion') return { fondo: colorMarca('disminucion'), texto: 'text-white' };
  if (marca) return { fondo: colorMarca(marca), texto: 'text-slate-900' };
  return { texto: 'text-slate-800' };
}

/* ═══ Campos de captura ═══ */

const CAMPO_HOJA = 'w-full min-w-0 bg-transparent px-1.5 py-1 rounded-md border border-transparent hover:border-slate-400/40 focus:border-sky-600 focus:bg-white focus:text-slate-900 focus:outline-none disabled:hover:border-transparent placeholder:text-slate-400';

/** Número con texto local: deja escribir "1." o "0.0" sin que se borre */
function CampoNumero({ valor, disabled, onCambio, className = '', etiqueta }: {
  valor: number; disabled: boolean; onCambio: (n: number) => void; className?: string; etiqueta: string;
}) {
  const [texto, setTexto] = useState(valor ? String(valor) : '');
  const [enfocado, setEnfocado] = useState(false);
  const mostrado = enfocado ? texto : valor ? String(valor) : '';
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={etiqueta}
      value={mostrado}
      disabled={disabled}
      placeholder="0"
      onFocus={() => { setTexto(valor ? String(valor) : ''); setEnfocado(true); }}
      onBlur={() => setEnfocado(false)}
      onChange={e => {
        const t = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
        setTexto(t);
        const n = Number(t);
        if (t === '' || Number.isFinite(n)) onCambio(t === '' ? 0 : n);
      }}
      className={`${CAMPO_HOJA} text-right tabular-nums ${className}`}
    />
  );
}

/** Select que acepta el valor actual aunque no esté en el catálogo (viene del Excel) */
function CampoLista({ valor, opciones, disabled, onCambio, etiqueta, className = '' }: {
  valor: string; opciones: string[]; disabled: boolean; onCambio: (v: string) => void; etiqueta: string; className?: string;
}) {
  const lista = valor && !opciones.some(o => normalizar(o) === normalizar(valor)) ? [valor, ...opciones] : opciones;
  return (
    <select aria-label={etiqueta} value={valor} disabled={disabled} onChange={e => onCambio(e.target.value)} className={`${CAMPO_HOJA} cursor-pointer disabled:cursor-default appearance-none ${className}`}>
      {!valor && <option value="">—</option>}
      {lista.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/** Clasificación con el color del Excel */
function CampoClasificacion({ valor, disabled, onCambio }: { valor: string; disabled: boolean; onCambio: (v: string) => void }) {
  return (
    <div className="rounded-md px-0.5 border border-black/10" style={{ backgroundColor: colorClasificacion(valor) }}>
      <CampoLista valor={valor} opciones={CLASIFICACIONES.map(c => c.nombre)} disabled={disabled} onCambio={onCambio} etiqueta="Clasificación" className="text-slate-900 font-semibold hover:border-black/20" />
    </div>
  );
}

/** OC y Compra: visibles pero vacías hasta que se defina cómo funcionan */
const TITULO_COMPRAS = 'Compras: se activa más adelante';

/* ═══ Componente principal ═══ */

export function HojaExplosion({ explosionId, estado, bloqueado, partidas, asegurarIniciada, onAviso, onResumen, guardarRef }: Props) {
  const [revisiones, setRevisiones] = useState<Revision[]>([]);
  const [cargando, setCargando] = useState(true);
  const [vistaId, setVistaId] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; avisos: string[] } | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroClasif, setFiltroClasif] = useState<string>('todas');
  const [cerradas, setCerradas] = useState<Set<string>>(new Set());
  const [verPartidas, setVerPartidas] = useState(false);
  const [enfocar, setEnfocar] = useState<string | null>(null);
  const [encLocal, setEncLocal] = useState<Partial<EncabezadoRev>>({});
  const [motivoLocal, setMotivoLocal] = useState<string | null>(null);
  const [nombrarPor, setNombrarPorState] = useState<NombrarPor>(() => {
    try { return localStorage.getItem('bom-nombrar-por') === 'sucursal' ? 'sucursal' : 'pedido'; } catch { return 'pedido'; }
  });

  const inputArchivo = useRef<HTMLInputElement>(null);
  const contadorArrastre = useRef(0);
  // Cambios por línea esperando el debounce y enviados sin respuesta: se aplican encima de cada recarga
  const pendientes = useRef<Record<string, CambiosLinea>>({});
  const enviando = useRef<Record<string, CambiosLinea>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const timerEnc = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const timerMotivo = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const encPendiente = useRef<Partial<EncabezadoRev>>({});
  const motivoPendiente = useRef<string | null>(null);

  const setNombrarPor = (v: NombrarPor) => {
    setNombrarPorState(v);
    try { localStorage.setItem('bom-nombrar-por', v); } catch { /* sin almacenamiento: no pasa nada */ }
  };

  /* ── Cargar revisiones ── */
  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/bom/revisiones?explosion_id=${encodeURIComponent(explosionId)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const d = await res.json();
      const lista = (d.revisiones as Revision[]).map(r => ({
        ...r,
        // Lo que se está escribiendo gana sobre lo que llega (también si la línea ya es la copia en la REV nueva)
        lineas: r.lineas.map(l => ({
          ...l,
          ...(l.origen_id ? enviando.current[l.origen_id] : undefined), ...enviando.current[l.id],
          ...(l.origen_id ? pendientes.current[l.origen_id] : undefined), ...pendientes.current[l.id],
        })),
      }));
      setRevisiones(lista);
    } catch {
      onAviso('No se pudo cargar la hoja de explosión.');
    } finally {
      setCargando(false);
    }
  }, [explosionId, onAviso]);

  const recargar = useRecargaAgrupada(cargar, 400);
  useEffect(() => {
    const ch = supabase
      .channel(`bom-hoja-${explosionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bom_revisiones', filter: `explosion_id=eq.${explosionId}` }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bom_revision_lineas', filter: `explosion_id=eq.${explosionId}` }, recargar)
      .subscribe(status => { if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR') recargar(); });
    const primera = setTimeout(() => void cargar(), 0);
    return () => { clearTimeout(primera); void supabase.removeChannel(ch); };
  }, [explosionId, cargar, recargar]);

  /* ── Derivados ── */
  const ordenadas = useMemo(() => [...revisiones].sort((a, b) => a.numero - b.numero), [revisiones]);
  const ultima = ordenadas[ordenadas.length - 1] ?? null;
  const idxVista = vistaId ? Math.max(0, ordenadas.findIndex(r => r.id === vistaId)) : ordenadas.length - 1;
  const vista = ordenadas[idxVista] ?? null;
  const esUltima = !!vista && vista.id === ultima?.id;
  const puedeEscribir = esUltima && !bloqueado && estado !== 'completado';
  const comparacion = useMemo(() => compararRevision(ordenadas, idxVista), [ordenadas, idxVista]);
  const previasPorId = useMemo(() => new Map((ordenadas[idxVista - 1]?.lineas ?? []).map(l => [l.id, l])), [ordenadas, idxVista]);

  // Resumen para la página (botón Terminar, modal final)
  useEffect(() => {
    onResumen(ultima ? { numero: ultima.numero, estado: ultima.estado, materiales: ultima.lineas.filter(lineaConContenido).length } : null);
  }, [ultima, onResumen]);

  const lineasVista = useMemo(() => vista?.lineas ?? [], [vista]);
  const filtradas = useMemo(() => {
    const t = normalizar(busqueda);
    return lineasVista.filter(l =>
      (filtroClasif === 'todas' || normalizar(l.clasificacion) === normalizar(filtroClasif)) &&
      (!t || normalizar(`${l.clave} ${l.descripcion}`).includes(t)),
    );
  }, [lineasVista, busqueda, filtroClasif]);
  const grupos = useMemo(() => agruparPorUnidad(filtradas), [filtradas]);
  const totalCosto = useMemo(() => lineasVista.reduce((s, l) => s + costoEstimado(l), 0), [lineasVista]);
  const clasificacionesUsadas = useMemo(() => [...new Set(lineasVista.map(l => l.clasificacion).filter(Boolean))], [lineasVista]);
  const eliminadasPorUnidad = useMemo(() => {
    const m = new Map<string, LineaRev[]>();
    for (const l of comparacion.eliminadas) m.set(l.unidad || 'Pieza', [...(m.get(l.unidad || 'Pieza') ?? []), l]);
    return m;
  }, [comparacion.eliminadas]);
  const enc: EncabezadoRev | null = vista ? { ...vista.encabezado, ...(esUltima ? encLocal : {}) } : null;

  /* ── Antes de escribir: la explosión debe estar en proceso (la arranca si estaba pendiente) ── */
  const prepararEscritura = useCallback(async (): Promise<boolean> => {
    if (estado === 'completado') { onAviso('La explosión está terminada. Da clic en "Editar" (arriba) para abrir una nueva revisión.'); return false; }
    if (bloqueado) { onAviso('Resuelve los motivos del estatus del pedido antes de capturar la explosión.'); return false; }
    return asegurarIniciada();
  }, [estado, bloqueado, onAviso, asegurarIniciada]);

  /** fetch con JSON que devuelve { ok, datos } y avisa los errores */
  const pedir = useCallback(async (url: string, init: RequestInit, error: string) => {
    try {
      const res = await fetch(url, init);
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) { onAviso(datos.error || error); return { ok: false as const, datos }; }
      return { ok: true as const, datos };
    } catch {
      onAviso(`${error} Revisa tu conexión.`);
      return { ok: false as const, datos: {} };
    }
  }, [onAviso]);

  /* ── Guardar cambios de una línea (con debounce) ── */
  const enviarLinea = useCallback(async (lineaId: string) => {
    clearTimeout(timers.current[lineaId]);
    const campos = pendientes.current[lineaId];
    if (!campos) return;
    delete pendientes.current[lineaId];
    enviando.current[lineaId] = { ...enviando.current[lineaId], ...campos };
    try {
      if (!(await prepararEscritura())) { recargar(); return; }
      const r = await pedir('/api/bom/revisiones/lineas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ explosion_id: explosionId, linea_id: lineaId, ...campos }),
      }, 'No se pudo guardar un material.');
      // Si se abrió una revisión nueva, la línea cambió de id: hay que recargar para tomar las copias
      if (!r.ok || r.datos.creada || r.datos.linea?.id !== lineaId) recargar();
    } finally {
      delete enviando.current[lineaId];
    }
  }, [explosionId, prepararEscritura, pedir, recargar]);

  const cambiarLinea = useCallback((linea: LineaRev, campos: CambiosLinea) => {
    if (!puedeEscribir) return;
    setRevisiones(prev => prev.map(r => (r.id !== linea.revision_id ? r : { ...r, lineas: r.lineas.map(l => (l.id === linea.id ? { ...l, ...campos } : l)) })));
    pendientes.current[linea.id] = { ...pendientes.current[linea.id], ...campos };
    clearTimeout(timers.current[linea.id]);
    timers.current[linea.id] = setTimeout(() => void enviarLinea(linea.id), 700);
  }, [puedeEscribir, enviarLinea]);

  /* ── Encabezado y "qué cambió" (con debounce) ── */
  const enviarEncabezado = useCallback(async () => {
    clearTimeout(timerEnc.current);
    const cambios = encPendiente.current;
    if (!Object.keys(cambios).length) return;
    encPendiente.current = {};
    if (!(await prepararEscritura())) { setEncLocal({}); return; }
    const r = await pedir('/api/bom/revisiones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ explosion_id: explosionId, accion: 'encabezado', encabezado: cambios }),
    }, 'No se pudo guardar el encabezado.');
    await cargar();
    // Lo que ya se guardó deja de ser "local" (si no se escribió algo más mientras tanto)
    setEncLocal(prev => {
      if (!r.ok) return encPendiente.current;
      const n = { ...prev };
      for (const k of Object.keys(cambios) as (keyof EncabezadoRev)[]) if (!(k in encPendiente.current)) delete n[k];
      return n;
    });
  }, [explosionId, prepararEscritura, pedir, cargar]);

  const cambiarEncabezado = (campo: keyof EncabezadoRev, valor: string) => {
    if (!puedeEscribir) return;
    setEncLocal(prev => ({ ...prev, [campo]: valor }));
    encPendiente.current = { ...encPendiente.current, [campo]: valor };
    clearTimeout(timerEnc.current);
    timerEnc.current = setTimeout(() => void enviarEncabezado(), 800);
  };

  const enviarMotivo = useCallback(async () => {
    clearTimeout(timerMotivo.current);
    const motivo = motivoPendiente.current;
    if (motivo === null) return;
    motivoPendiente.current = null;
    await pedir('/api/bom/revisiones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ explosion_id: explosionId, accion: 'motivo', motivo }),
    }, 'No se pudo guardar qué cambió.');
    await cargar();
    if (motivoPendiente.current === null) setMotivoLocal(null);
  }, [explosionId, pedir, cargar]);

  const cambiarMotivo = (valor: string) => {
    setMotivoLocal(valor);
    motivoPendiente.current = valor;
    clearTimeout(timerMotivo.current);
    timerMotivo.current = setTimeout(() => void enviarMotivo(), 800);
  };

  /* ── Guardar todo lo pendiente (antes de terminar, cerrar o descargar) ── */
  const guardarTodo = useCallback(async () => {
    await Promise.all([...Object.keys(pendientes.current).map(enviarLinea), enviarEncabezado(), enviarMotivo()]);
  }, [enviarLinea, enviarEncabezado, enviarMotivo]);

  useEffect(() => {
    guardarRef.current = guardarTodo;
    return () => { guardarRef.current = null; };
  }, [guardarRef, guardarTodo]);

  /* ── Agregar y quitar materiales ── */
  const agregarLinea = async (unidad: string) => {
    if (!(await prepararEscritura())) return;
    setTrabajando(true);
    try {
      await guardarTodo();
      const r = await pedir('/api/bom/revisiones/lineas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ explosion_id: explosionId, unidad }),
      }, 'No se pudo agregar el material.');
      if (r.ok) {
        setEnfocar(r.datos.linea?.id ?? null);
        setBusqueda('');
        setFiltroClasif('todas');
        setCerradas(prev => { const n = new Set(prev); n.delete(unidad); return n; });
      }
      await cargar();
    } finally {
      setTrabajando(false);
    }
  };

  const eliminarLinea = async (linea: LineaRev) => {
    if (!puedeEscribir) return;
    clearTimeout(timers.current[linea.id]);
    delete pendientes.current[linea.id];
    setRevisiones(prev => prev.map(r => (r.id !== linea.revision_id ? r : { ...r, lineas: r.lineas.filter(l => l.id !== linea.id) })));
    if (!(await prepararEscritura())) { recargar(); return; }
    await pedir(`/api/bom/revisiones/lineas?explosion_id=${encodeURIComponent(explosionId)}&linea_id=${encodeURIComponent(linea.id)}`, { method: 'DELETE' }, 'No se pudo quitar el material.');
    recargar();
  };

  /* ── Importar el Excel ── */
  const importar = async (archivo: File) => {
    if (!/\.xlsx$/i.test(archivo.name)) { onAviso('El archivo debe ser un Excel .xlsx.'); return; }
    if (ultima) {
      const destino = ultima.estado === 'borrador' ? `reemplaza el borrador ${etiquetaRev(ultima.numero)}` : `se guarda como ${etiquetaRev(ultima.numero + 1)}`;
      if (!confirm(`¿Importar "${archivo.name}"? El contenido del archivo ${destino}. Las revisiones anteriores se conservan.`)) return;
    }
    if (!(await prepararEscritura())) return;
    setImportando(true);
    setMensaje(null);
    try {
      await guardarTodo();
      const form = new FormData();
      form.append('explosion_id', explosionId);
      form.append('archivo', archivo);
      const r = await pedir('/api/bom/revisiones/importar', { method: 'POST', body: form }, 'No se pudo importar el Excel.');
      if (r.ok) {
        setMensaje({ texto: `Se importaron ${r.datos.lineas} materiales como ${etiquetaRev(r.datos.revision.numero)}.`, avisos: r.datos.avisos ?? [] });
        setVistaId(null);
        setEncLocal({});
      }
      await cargar();
    } finally {
      setImportando(false);
    }
  };

  /* ── Empezar en blanco, cerrar y descartar revisión ── */
  const empezarEnBlanco = async () => {
    if (!(await prepararEscritura())) return;
    setTrabajando(true);
    try {
      await pedir('/api/bom/revisiones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ explosion_id: explosionId }) }, 'No se pudo crear la hoja.');
      await cargar();
    } finally {
      setTrabajando(false);
    }
  };

  const accionRevision = async (accion: 'cerrar' | 'descartar') => {
    if (!ultima) return;
    if (accion === 'descartar' && !confirm(`¿Descartar ${etiquetaRev(ultima.numero)}? Se borran sus cambios y la hoja regresa a ${ultima.numero > 0 ? etiquetaRev(ultima.numero - 1) : 'vacía'}.`)) return;
    setTrabajando(true);
    try {
      if (accion === 'cerrar') await guardarTodo();
      else {
        for (const t of Object.values(timers.current)) clearTimeout(t);
        pendientes.current = {};
        encPendiente.current = {};
        motivoPendiente.current = null;
        setEncLocal({});
        setMotivoLocal(null);
      }
      const r = await pedir('/api/bom/revisiones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ explosion_id: explosionId, accion }),
      }, accion === 'cerrar' ? 'No se pudo cerrar la revisión.' : 'No se pudo descartar la revisión.');
      if (r.ok) setMensaje({ texto: accion === 'cerrar' ? `${etiquetaRev(ultima.numero)} quedó cerrada. El siguiente cambio abrirá ${etiquetaRev(ultima.numero + 1)}.` : `Se descartó ${etiquetaRev(ultima.numero)}.`, avisos: [] });
      setVistaId(null);
      await cargar();
    } finally {
      setTrabajando(false);
    }
  };

  const descargar = async () => {
    if (!vista) return;
    await guardarTodo();
    // Descarga con un enlace temporal (es un archivo de la API, no una página)
    const a = document.createElement('a');
    a.href = `/api/bom/revisiones/excel?explosion_id=${encodeURIComponent(explosionId)}&revision_id=${encodeURIComponent(vista.id)}&nombre=${nombrarPor}`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /* ── Arrastrar y soltar ── */
  const puedeImportar = !bloqueado && estado !== 'completado';
  const eventosArrastre = puedeImportar ? {
    onDragEnter: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); contadorArrastre.current++; setArrastrando(true); } },
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); },
    onDragLeave: () => { contadorArrastre.current = Math.max(0, contadorArrastre.current - 1); if (!contadorArrastre.current) setArrastrando(false); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      contadorArrastre.current = 0;
      setArrastrando(false);
      const archivo = e.dataTransfer.files?.[0];
      if (archivo) void importar(archivo);
    },
  } : {};

  const inputOculto = (
    <input
      ref={inputArchivo}
      type="file"
      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      className="hidden"
      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importar(f); }}
    />
  );

  /* ═══ RENDER ═══ */

  if (cargando) {
    return <div className={`${TARJETA} p-10 flex justify-center`}><Loader2 className="w-7 h-7 text-blue-400 animate-spin" /></div>;
  }

  /* ── Sin revisiones: zona para soltar el Excel ── */
  if (!vista || !enc) {
    return (
      <section className={`${TARJETA} p-4 sm:p-6`} {...eventosArrastre}>
        {inputOculto}
        <div className="flex items-center gap-2 mb-4">
          <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
          <h2 className="text-sm font-bold text-white">Hoja de explosión</h2>
        </div>
        {bloqueado ? (
          <div className="flex flex-col items-center text-center gap-3 py-10 px-4 rounded-2xl border-2 border-dashed border-red-400/25 bg-red-500/[0.04]">
            <Lock className="w-9 h-9 text-red-300/80" />
            <p className="text-sm text-red-200/90 font-semibold">Resuelve el estatus del pedido para empezar la explosión.</p>
            <p className="text-xs text-white/40">Cuando no queden motivos pendientes podrás arrastrar aquí el Excel.</p>
          </div>
        ) : estado === 'completado' ? (
          <div className="flex flex-col items-center text-center gap-2 py-10 px-4 rounded-2xl border border-white/10 bg-white/[0.03]">
            <Info className="w-8 h-8 text-white/40" />
            <p className="text-sm text-white/70">Esta explosión se terminó antes de la hoja con revisiones.</p>
            <p className="text-xs text-white/40">Da clic en &quot;Editar&quot; arriba para abrirla e importar su Excel.</p>
          </div>
        ) : (
          <div className={`flex flex-col items-center text-center gap-4 py-12 sm:py-16 px-4 rounded-2xl border-2 border-dashed transition-all ${arrastrando ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]' : 'border-white/15 bg-white/[0.02]'}`}>
            {importando ? <Loader2 className="w-12 h-12 text-emerald-400 animate-spin" /> : <Upload className={`w-12 h-12 ${arrastrando ? 'text-emerald-300' : 'text-white/35'}`} />}
            <div>
              <p className="text-base sm:text-lg font-bold text-white">{importando ? 'Leyendo el Excel…' : arrastrando ? 'Suelta el archivo aquí' : 'Arrastra aquí el Excel de explosión'}</p>
              <p className="text-xs text-white/45 mt-1 break-all">EXPLOSION DE MATERIALES … REV-00.xlsx</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap justify-center">
              <button type="button" disabled={importando} onClick={() => inputArchivo.current?.click()} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50">
                <FileSpreadsheet className="w-4 h-4" /> Elegir archivo
              </button>
              <button type="button" disabled={importando || trabajando} onClick={() => void empezarEnBlanco()} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/75 text-sm font-semibold border border-white/10 disabled:opacity-50">
                {trabajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Empezar en blanco
              </button>
            </div>
            {estado === 'pendiente' && <p className="text-[11px] text-white/35">Al importar o capturar, el cronómetro arranca solo.</p>}
          </div>
        )}
      </section>
    );
  }

  const motivoMostrado = motivoLocal ?? vista.motivo;
  const resumen = comparacion.resumen;
  const hayCambios = resumen.nuevas + resumen.modificadas + resumen.disminuciones + resumen.eliminadas > 0;

  /* ── Una línea (escritorio) ── */
  const filaEscritorio = (l: LineaRev) => {
    const marca = comparacion.marcas[l.id];
    const est = estiloMarca(marca);
    const tip = detalleCambios(comparacion.cambios[l.id], l.origen_id ? previasPorId.get(l.origen_id) : undefined, l);
    const off = !puedeEscribir;
    return (
      <div key={l.id} title={tip || undefined} className={`${COLUMNAS} items-center gap-1 px-2 py-1 border-b border-slate-300/70 text-[12.5px] ${est.texto}`} style={est.fondo ? { backgroundColor: est.fondo } : undefined}>
        <input aria-label="Clave" autoFocus={enfocar === l.id} value={l.clave} disabled={off} placeholder="Clave" onChange={e => cambiarLinea(l, { clave: e.target.value })} className={`${CAMPO_HOJA} font-mono font-semibold`} />
        <input aria-label="Descripción" title={l.descripcion} value={l.descripcion} disabled={off} placeholder="Descripción del material" onChange={e => cambiarLinea(l, { descripcion: e.target.value })} className={CAMPO_HOJA} />
        <CampoLista etiqueta="Unidad" valor={l.unidad} opciones={UNIDADES} disabled={off} onCambio={v => cambiarLinea(l, { unidad: v })} />
        <CampoClasificacion valor={l.clasificacion} disabled={off} onCambio={v => cambiarLinea(l, { clasificacion: v })} />
        <CampoLista etiqueta="Moneda" valor={l.moneda} opciones={MONEDAS} disabled={off} onCambio={v => cambiarLinea(l, { moneda: v })} />
        <CampoNumero etiqueta="Costo" valor={l.costo} disabled={off} onCambio={n => cambiarLinea(l, { costo: n })} />
        <CampoNumero etiqueta="Cantidad necesaria" valor={l.cantidad} disabled={off} onCambio={n => cambiarLinea(l, { cantidad: n })} className="font-bold" />
        <span className="text-right tabular-nums px-1.5 font-semibold">{dinero(costoEstimado(l))}</span>
        <span title={TITULO_COMPRAS} className="text-center opacity-40 select-none">{l.oc || '—'}</span>
        <span title={TITULO_COMPRAS} className="flex justify-center"><input type="checkbox" checked={l.comprado} disabled aria-label="Compra" className="w-4 h-4 opacity-40" /></span>
        {puedeEscribir ? (
          <button type="button" onClick={() => void eliminarLinea(l)} aria-label="Quitar material" className="flex justify-center opacity-40 hover:opacity-100 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
        ) : <span />}
      </div>
    );
  };

  /* ── Una línea (celular) ── */
  const tarjetaCelular = (l: LineaRev) => {
    const marca = comparacion.marcas[l.id];
    const est = estiloMarca(marca);
    const tip = detalleCambios(comparacion.cambios[l.id], l.origen_id ? previasPorId.get(l.origen_id) : undefined, l);
    const off = !puedeEscribir;
    const campoChico = 'flex flex-col gap-0.5 text-[10px] font-bold uppercase tracking-wide opacity-60';
    return (
      <div key={l.id} className={`rounded-xl border border-slate-300 p-2.5 space-y-2 ${est.texto}`} style={{ backgroundColor: est.fondo ?? '#ffffff' }}>
        <div className="flex items-center gap-2">
          <input aria-label="Clave" autoFocus={enfocar === l.id} value={l.clave} disabled={off} placeholder="Clave" onChange={e => cambiarLinea(l, { clave: e.target.value })} className={`${CAMPO_HOJA} font-mono font-bold text-sm flex-1`} />
          <div className="w-32 shrink-0"><CampoClasificacion valor={l.clasificacion} disabled={off} onCambio={v => cambiarLinea(l, { clasificacion: v })} /></div>
        </div>
        <textarea aria-label="Descripción" value={l.descripcion} disabled={off} rows={2} placeholder="Descripción del material" onChange={e => cambiarLinea(l, { descripcion: e.target.value })} className={`${CAMPO_HOJA} text-[13px] resize-none leading-snug`} />
        <div className="grid grid-cols-2 gap-2">
          <label className={campoChico}>Cantidad<span className="normal-case text-sm font-bold opacity-100"><CampoNumero etiqueta="Cantidad necesaria" valor={l.cantidad} disabled={off} onCambio={n => cambiarLinea(l, { cantidad: n })} className="text-left!" /></span></label>
          <label className={campoChico}>Unidad<span className="normal-case text-sm font-normal"><CampoLista etiqueta="Unidad" valor={l.unidad} opciones={UNIDADES} disabled={off} onCambio={v => cambiarLinea(l, { unidad: v })} /></span></label>
          <label className={campoChico}>Costo<span className="normal-case text-sm font-normal"><CampoNumero etiqueta="Costo" valor={l.costo} disabled={off} onCambio={n => cambiarLinea(l, { costo: n })} className="text-left!" /></span></label>
          <label className={campoChico}>Moneda<span className="normal-case text-sm font-normal"><CampoLista etiqueta="Moneda" valor={l.moneda} opciones={MONEDAS} disabled={off} onCambio={v => cambiarLinea(l, { moneda: v })} /></span></label>
        </div>
        {tip && <p className="text-[11px] font-semibold opacity-80">{tip}</p>}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-black/10 text-[12px]">
          <span>Costo est. <b className="tabular-nums">${dinero(costoEstimado(l))}</b></span>
          <span className="flex items-center gap-3 opacity-50" title={TITULO_COMPRAS}>
            <span>OC {l.oc || '—'}</span>
            <span className="flex items-center gap-1"><input type="checkbox" checked={l.comprado} disabled aria-label="Compra" className="w-4 h-4" />Compra</span>
          </span>
          {puedeEscribir && (
            <button type="button" onClick={() => void eliminarLinea(l)} aria-label="Quitar material" className="p-1.5 -m-1 opacity-50 hover:opacity-100 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
          )}
        </div>
      </div>
    );
  };

  /** Línea quitada en esta revisión: se muestra tachada, solo lectura */
  const filaQuitada = (l: LineaRev, celular: boolean) => celular ? (
    <div key={`q-${l.id}`} className="rounded-xl border border-red-300 bg-red-50 p-2.5 text-[12px] text-red-700">
      <span className="font-mono font-bold line-through">{l.clave}</span> <span className="line-through">{l.descripcion}</span>
      <p className="text-[10px] font-bold uppercase mt-1">Quitado en {etiquetaRev(vista.numero)} · antes {cantidadTxt(l.cantidad)} {l.unidad}</p>
    </div>
  ) : (
    <div key={`q-${l.id}`} title={`Quitado en ${etiquetaRev(vista.numero)}`} className={`${COLUMNAS} items-center gap-1 px-2 py-1.5 border-b border-red-200 bg-red-50 text-[12.5px] text-red-700`}>
      <span className="px-1.5 font-mono line-through">{l.clave}</span>
      <span className="px-1.5 line-through truncate">{l.descripcion}</span>
      <span className="px-1.5">{l.unidad}</span>
      <span className="px-1.5">{l.clasificacion}</span>
      <span className="px-1.5">{l.moneda}</span>
      <span className="px-1.5 text-right tabular-nums">{dinero(l.costo)}</span>
      <span className="px-1.5 text-right tabular-nums line-through">{cantidadTxt(l.cantidad)}</span>
      <span className="px-1.5 text-right text-[10px] font-bold uppercase col-span-4">Quitado</span>
    </div>
  );

  return (
    <section className={`${TARJETA} relative overflow-hidden`} {...eventosArrastre}>
      {inputOculto}

      {/* Capa al arrastrar un archivo encima */}
      {arrastrando && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-emerald-950/80 backdrop-blur-sm border-2 border-dashed border-emerald-400 rounded-[inherit] pointer-events-none">
          <Upload className="w-12 h-12 text-emerald-300" />
          <p className="text-lg font-bold text-white text-center px-4">Suelta para importar como {ultima?.estado === 'borrador' ? etiquetaRev(ultima.numero) : etiquetaRev((ultima?.numero ?? -1) + 1)}</p>
        </div>
      )}

      {/* ═══ Barra de la hoja ═══ */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400 shrink-0" />
            <h2 className="text-sm font-bold text-white">Hoja de explosión</h2>
          </div>
          <p className="text-[11px] text-white/45 mt-0.5 truncate">
            {vista.origen === 'importado' && vista.archivo_nombre ? `Importado de ${vista.archivo_nombre}` : 'Capturada en el sistema'}
            {vista.creado_por ? ` · ${vista.creado_por}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-0.5 text-[11px] font-semibold" role="group" aria-label="Nombre del archivo">
            {(['pedido', 'sucursal'] as const).map(op => (
              <button key={op} type="button" onClick={() => setNombrarPor(op)} aria-pressed={nombrarPor === op} className={`px-2.5 py-1.5 rounded-lg transition-all ${nombrarPor === op ? 'bg-white/[0.12] text-white' : 'text-white/45 hover:text-white/75'}`}>
                {op === 'pedido' ? 'Por pedido' : 'Por sucursal'}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => void descargar()} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold">
            <Download className="w-4 h-4" /> Descargar {etiquetaRev(vista.numero)}
          </button>
          {puedeImportar && (
            <button type="button" disabled={importando} onClick={() => inputArchivo.current?.click()} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/75 text-xs font-semibold border border-white/10 disabled:opacity-50">
              {importando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Subir Excel
            </button>
          )}
        </div>
      </div>

      {/* ═══ Línea de revisiones ═══ */}
      <div className="px-4 sm:px-6 pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Revisiones">
          <History className="w-4 h-4 text-white/35 shrink-0 mr-1" />
          {ordenadas.map((r, i) => {
            const activa = r.id === vista.id;
            return (
              <div key={r.id} className="flex items-center gap-1.5 shrink-0">
                {i > 0 && <span className="w-4 h-px bg-white/20" />}
                <button
                  type="button"
                  role="tab"
                  aria-selected={activa}
                  onClick={() => setVistaId(i === ordenadas.length - 1 ? null : r.id)}
                  title={`${r.estado === 'borrador' ? 'Borrador' : `Cerrada ${fechaCorta(r.cerrada_en)}`}${r.motivo ? ` · ${r.motivo}` : ''}`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-mono font-bold transition-all ${activa ? 'bg-white text-slate-900 border-white' : r.estado === 'borrador' ? 'bg-sky-500/10 text-sky-300 border-sky-400/40 hover:bg-sky-500/20' : 'bg-white/[0.04] text-white/60 border-white/10 hover:bg-white/[0.08]'}`}
                >
                  {r.estado === 'borrador' ? <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" /> : <CheckCircle2 className="w-3 h-3" />}
                  {etiquetaRev(r.numero)}
                  <span className="font-sans font-medium opacity-60">{r.estado === 'borrador' ? 'borrador' : fechaCorta(r.cerrada_en ?? r.created_at).split(' ').slice(0, 2).join(' ')}</span>
                </button>
              </div>
            );
          })}
          {ultima?.estado === 'cerrada' && puedeEscribir && (
            <span className="shrink-0 ml-2 text-[10px] text-white/35 whitespace-nowrap">El siguiente cambio abre {etiquetaRev(ultima.numero + 1)}</span>
          )}
        </div>
      </div>

      {/* Mensajes */}
      {mensaje && (
        <div className="mx-4 sm:mx-6 mb-3 flex items-start gap-3 px-4 py-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 text-xs" role="status">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="font-semibold">{mensaje.texto}</p>
            {mensaje.avisos.map(a => <p key={a} className="text-amber-200/90 flex gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{a}</p>)}
          </div>
          <button type="button" onClick={() => setMensaje(null)} aria-label="Cerrar mensaje" className="opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}
      {!esUltima && (
        <div className="mx-4 sm:mx-6 mb-3 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] text-white/60 text-xs">
          <Lock className="w-4 h-4 shrink-0" />
          <span className="flex-1">Estás viendo {etiquetaRev(vista.numero)} (solo lectura).</span>
          <button type="button" onClick={() => setVistaId(null)} className="text-sky-300 hover:text-sky-200 font-semibold whitespace-nowrap">Ir a la actual</button>
        </div>
      )}

      {/* Borrador de revisión: qué cambió + cerrar / descartar */}
      {esUltima && vista.estado === 'borrador' && (
        <div className="mx-4 sm:mx-6 mb-3 p-3 rounded-xl border border-sky-400/30 bg-sky-500/[0.07] space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-sky-200 font-semibold">
              {etiquetaRev(vista.numero)} en borrador
              {hayCambios && <span className="font-normal text-sky-200/70"> · {[resumen.nuevas && `${resumen.nuevas} nuevo(s)`, resumen.modificadas && `${resumen.modificadas} modificado(s)`, resumen.disminuciones && `${resumen.disminuciones} disminución(es)`, resumen.eliminadas && `${resumen.eliminadas} quitado(s)`].filter(Boolean).join(' · ')}</span>}
            </p>
            {puedeEscribir && (
              <div className="flex items-center gap-2">
                <button type="button" disabled={trabajando} onClick={() => void accionRevision('descartar')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-red-300/85 hover:text-red-200 hover:bg-red-500/10 border border-red-400/20 disabled:opacity-50">
                  <Undo2 className="w-3.5 h-3.5" /> Descartar
                </button>
                <button type="button" disabled={trabajando} onClick={() => void accionRevision('cerrar')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50">
                  {trabajando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Cerrar {etiquetaRev(vista.numero)}
                </button>
              </div>
            )}
          </div>
          {vista.numero > 0 && (
            <input
              value={motivoMostrado}
              disabled={!puedeEscribir}
              onChange={e => cambiarMotivo(e.target.value)}
              placeholder={`¿Qué cambió en ${etiquetaRev(vista.numero)}? (sale en el Excel)`}
              className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-sky-400/50"
            />
          )}
        </div>
      )}
      {vista.estado === 'cerrada' && vista.motivo.trim() && (
        <p className="mx-4 sm:mx-6 mb-3 text-[11px] text-white/50"><b className="text-white/70">Cambios en {etiquetaRev(vista.numero)}:</b> {vista.motivo}</p>
      )}

      {/* ═══ LA HOJA (formato SULA) ═══ */}
      <div className="mx-2 sm:mx-4 mb-4 rounded-2xl bg-[#f8f7f3] text-slate-900 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-black/10 overflow-hidden">

        {/* Encabezado del formato */}
        <div className="px-3 sm:px-6 pt-4 sm:pt-5 pb-3 border-b-2 border-slate-800/80">
          <div className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2">
            <div className="row-span-2 sm:row-span-1 flex flex-col items-center justify-center rounded-xl border-2 border-slate-900 px-3 py-2 min-w-[92px]">
              <span className="text-[9px] font-bold tracking-[0.2em] text-slate-500">REVISIÓN</span>
              <span className="text-2xl sm:text-3xl font-black tracking-tight leading-none whitespace-nowrap">{etiquetaRev(vista.numero)}</span>
            </div>
            <div className="min-w-0 sm:text-center">
              <p className="text-sm sm:text-xl font-extrabold tracking-tight leading-tight">GRUPO AVANT CIM, S.A. DE C.V.</p>
              <p className="text-[11px] sm:text-base font-bold text-slate-600 leading-tight">REPORTE DE EXPLOSIÓN DE MATERIALES</p>
            </div>
            <div className="text-[11px] sm:text-right text-slate-600 col-start-2 sm:col-start-auto">
              <p><b className="text-slate-800">PÁGINA:</b> 1/1</p>
              <label className="inline-flex items-center gap-1"><b className="text-slate-800">FECHA:</b>
                <input type="date" value={enc.fecha || ''} disabled={!puedeEscribir} onChange={e => cambiarEncabezado('fecha', e.target.value)} className={`${CAMPO_HOJA} w-auto py-0.5 text-[11px]`} aria-label="Fecha" />
              </label>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-[12px]">
            <div className="grid grid-cols-[72px_1fr] items-center gap-x-2 gap-y-1">
              <span className="font-bold text-slate-500">CLIENTE:</span>
              <input value={enc.cliente || ''} disabled={!puedeEscribir} onChange={e => cambiarEncabezado('cliente', e.target.value)} placeholder="Cliente" aria-label="Cliente" className={`${CAMPO_HOJA} text-base sm:text-lg font-extrabold`} />
              <span className="font-bold text-slate-500">PROYECTO:</span>
              <input value={enc.proyecto || ''} disabled={!puedeEscribir} onChange={e => cambiarEncabezado('proyecto', e.target.value)} placeholder="Sucursal / referencia" aria-label="Proyecto o sucursal" className={`${CAMPO_HOJA} font-bold`} />
            </div>
            <div className="grid grid-cols-[auto_120px] items-center gap-x-2 gap-y-1 md:justify-end">
              <span className="font-bold text-slate-500 md:text-right">PEDIDO:</span>
              <input value={enc.pedido || ''} disabled={!puedeEscribir} onChange={e => cambiarEncabezado('pedido', e.target.value)} placeholder="—" aria-label="Pedido" className={`${CAMPO_HOJA} text-base sm:text-lg font-extrabold text-center`} />
              <span className="font-bold text-slate-500 md:text-right">ORDEN PRODUCCIÓN:</span>
              <input value={enc.orden_produccion || ''} disabled={!puedeEscribir} onChange={e => cambiarEncabezado('orden_produccion', e.target.value)} placeholder="—" aria-label="Orden de producción" className={`${CAMPO_HOJA} font-bold text-center`} />
            </div>
          </div>
        </div>

        {/* Leyenda + totales */}
        <div className="px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3 flex-wrap border-b border-slate-300 bg-white/60">
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[10.5px] font-semibold text-slate-600">
            {LEYENDA.map(l => (
              <span key={l.marca} className="inline-flex items-center gap-1.5">
                <span className="w-4 h-3 rounded-sm border border-black/15" style={{ backgroundColor: l.color }} />{l.texto}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-600">
            <span><b className="text-slate-900">{lineasVista.filter(lineaConContenido).length}</b> materiales</span>
            <span>Costo estimado <b className="text-slate-900 tabular-nums">${dinero(totalCosto)}</b></span>
          </div>
        </div>

        {/* Herramientas: buscar, filtrar por clasificación, partidas */}
        <div className="px-3 sm:px-6 py-2.5 flex items-center gap-2 flex-wrap border-b border-slate-300">
          <label className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar clave o descripción…" aria-label="Buscar material" className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white border border-slate-300 text-[12px] focus:outline-none focus:border-sky-600" />
          </label>
          <div className="flex items-center gap-1 overflow-x-auto max-w-full">
            {['todas', ...clasificacionesUsadas].map(c => (
              <button key={c} type="button" onClick={() => setFiltroClasif(c)} aria-pressed={filtroClasif === c}
                className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all ${filtroClasif === c ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'}`}>
                {c !== 'todas' && <span className="w-2.5 h-2.5 rounded-full border border-black/15" style={{ backgroundColor: colorClasificacion(c) }} />}
                {c === 'todas' ? 'Todas' : c}
              </button>
            ))}
          </div>
          {partidas.length > 0 && (
            <button type="button" onClick={() => setVerPartidas(v => !v)} aria-expanded={verPartidas}
              className={`ml-auto shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold ${verPartidas ? 'border-amber-500 bg-amber-100 text-amber-900' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'}`}>
              <ListChecks className="w-3.5 h-3.5" /> Partidas del pedido ({partidas.length})
            </button>
          )}
        </div>

        {/* Partidas del pedido (referencia) */}
        {verPartidas && (
          <div className="px-3 sm:px-6 py-3 border-b border-slate-300 bg-amber-50/70 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-72 overflow-y-auto">
            {partidas.map(p => (
              <div key={p.id} className="rounded-lg border border-amber-200 bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold text-amber-700">{p.clave}</span>
                  <span className="text-[11px] font-bold text-slate-500">×{p.cantidad}</span>
                </div>
                <p className="text-[11px] text-slate-700 leading-snug line-clamp-2">{p.descripcion}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Tabla (tablet y escritorio) ── */}
        <div className="hidden md:block overflow-x-auto">
          <div className="min-w-[1100px]">
            <div className={`${COLUMNAS} gap-1 px-2 py-2 text-[10.5px] font-extrabold uppercase tracking-wide text-slate-700 border-b-[3px] border-double border-slate-800 bg-white sticky top-0`}>
              <span className="px-1.5">Clave</span>
              <span className="px-1.5">Descripción</span>
              <span className="px-1.5">Unidad</span>
              <span className="px-1.5">Clasificación</span>
              <span className="px-1.5">Moneda</span>
              <span className="px-1.5 text-right">Costo</span>
              <span className="px-1.5 text-right">Cant. necesaria</span>
              <span className="px-1.5 text-right">Costo estimado</span>
              <span className="px-1.5 text-center text-slate-400" title={TITULO_COMPRAS}>OC</span>
              <span className="px-1.5 text-center text-slate-400" title={TITULO_COMPRAS}>Compra</span>
              <span />
            </div>

            {grupos.map(g => {
              const abierta = !cerradas.has(g.unidad);
              return (
                <div key={g.unidad}>
                  <button type="button" onClick={() => setCerradas(prev => { const n = new Set(prev); if (n.has(g.unidad)) n.delete(g.unidad); else n.add(g.unidad); return n; })}
                    aria-expanded={abierta} className="w-full flex items-center gap-2 px-3 py-1.5 bg-slate-200/70 border-b border-slate-300 text-[12px] font-extrabold text-slate-800 hover:bg-slate-200">
                    {abierta ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    {g.unidad}
                    <span className="font-semibold text-slate-500">· {g.lineas.length}</span>
                  </button>
                  {abierta && (<>
                    {g.lineas.map(filaEscritorio)}
                    {(eliminadasPorUnidad.get(g.unidad) ?? []).map(l => filaQuitada(l, false))}
                    {puedeEscribir && (
                      <button type="button" disabled={trabajando} onClick={() => void agregarLinea(g.unidad)} className="w-full flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold text-slate-500 hover:text-sky-700 hover:bg-sky-50 border-b border-slate-300 disabled:opacity-50">
                        <Plus className="w-3.5 h-3.5" /> Agregar material en {g.unidad}
                      </button>
                    )}
                  </>)}
                  <div className={`${COLUMNAS} gap-1 px-2 py-1.5 border-b-2 border-slate-400 text-[12px] font-extrabold bg-white`}>
                    <span className="col-span-6 text-right px-1.5">Totales {g.unidad}:</span>
                    <span className="text-right tabular-nums px-1.5">{cantidadTxt(g.totalCantidad)}</span>
                    <span className="text-right tabular-nums px-1.5">{dinero(g.totalCosto)}</span>
                  </div>
                </div>
              );
            })}
            {grupos.length === 0 && (
              <p className="text-center text-[12px] text-slate-500 py-8">{lineasVista.length ? 'Ningún material coincide con la búsqueda.' : 'La hoja está vacía.'}</p>
            )}
          </div>
        </div>

        {/* ── Tarjetas (celular) ── */}
        <div className="md:hidden p-2 space-y-3">
          {grupos.map(g => (
            <div key={g.unidad} className="space-y-2">
              <div className="flex items-center justify-between px-1 text-[12px] font-extrabold text-slate-800">
                <span>{g.unidad} <span className="font-semibold text-slate-500">· {g.lineas.length}</span></span>
                <span className="tabular-nums">${dinero(g.totalCosto)}</span>
              </div>
              {g.lineas.map(tarjetaCelular)}
              {(eliminadasPorUnidad.get(g.unidad) ?? []).map(l => filaQuitada(l, true))}
              {puedeEscribir && (
                <button type="button" disabled={trabajando} onClick={() => void agregarLinea(g.unidad)} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-dashed border-slate-300 text-[12px] font-semibold text-slate-500 active:bg-sky-50 disabled:opacity-50">
                  <Plus className="w-4 h-4" /> Agregar en {g.unidad}
                </button>
              )}
            </div>
          ))}
          {grupos.length === 0 && (
            <p className="text-center text-[12px] text-slate-500 py-8">{lineasVista.length ? 'Ningún material coincide con la búsqueda.' : 'La hoja está vacía.'}</p>
          )}
        </div>

        {/* Pie: usuario + agregar en otra unidad */}
        <div className="px-3 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap border-t border-slate-300 bg-white/60 text-[12px]">
          <label className="inline-flex items-center gap-1.5 font-bold text-slate-600">Usuario:
            <input value={enc.usuario || ''} disabled={!puedeEscribir} onChange={e => cambiarEncabezado('usuario', e.target.value)} aria-label="Usuario" className={`${CAMPO_HOJA} w-48 font-semibold`} />
          </label>
          {puedeEscribir && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-slate-500 text-[11px]">Agregar material en:</span>
              {UNIDADES.filter(u => !grupos.some(g => g.unidad === u)).slice(0, 4).map(u => (
                <button key={u} type="button" disabled={trabajando} onClick={() => void agregarLinea(u)} className="px-2.5 py-1 rounded-full border border-slate-300 bg-white text-[11px] font-semibold text-slate-600 hover:border-sky-600 hover:text-sky-700 disabled:opacity-50">
                  + {u}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
