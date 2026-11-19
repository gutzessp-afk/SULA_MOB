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
 *   · Compras: arrastrar los PDF de ORDEN DE COMPRA escribe su folio (NÚMERO) en la columna OC de
 *     cada material cuya Clave viene en la orden; se valida que la REFERENCIA sea este pedido.
 *     Cada OC muestra su total (leído del PDF), lo pagado y lo que falta por pagar; arriba van los
 *     totales: Pagado · Por pagar · Falta por comprar (costo estimado de lo que no tiene OC).
 *     OC también se escribe a mano; Compra se palomea y lleva su fecha (al palomear se propone la de hoy).
 *   · FINANZAS y ALMACÉN por partida (como la plantilla de SULA): estado de pago (pendiente /
 *     parcialmente pagado / pagado) y estado de almacén (por recibir / parcialmente recibido + cantidad /
 *     recibido); la fecha se pone sola al cambiar el estado (editable). Almacén siempre es a mano.
 *     En cada OC, "Marcar sus N partidas como…" cambia el pago de todas a la vez. Nada de esto abre revisión.
 *   · Menú "Excel" por si se subió el archivo equivocado: subir como nueva revisión, reemplazar la
 *     última revisión con otro Excel (conserva su número), eliminar la última revisión o vaciar la hoja.
 *
 * Modo compras (soloCompras, panel del área de madera /madera): solo se editan OC, Compra, Almacén,
 * fechas y PDF de órdenes de compra; no se importa Excel ni se tocan materiales ni revisiones.
 *
 * Perfiles ERP (perfil = 'compras' | 'finanzas' | 'almacen', panel /erp): cada uno edita solo su parte
 * (misma tabla que src/lib/admin-api.ts → puede; aquí solo muestra u oculta, las API validan):
 *   compras  → subir/reemplazar Excel, OC (a mano y PDF), Compra + fecha
 *   finanzas → panel de pagos de las OC
 *   almacen  → Almacén + fecha; no se dibujan costos, totales en $ ni el panel de pagos
 * Materiales, revisiones, cronómetro y estatus son solo del administrador.
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
  AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Download, Eraser, FileSpreadsheet, FileText, History, Info, ListChecks, Replace, ShoppingCart,
  Loader2, Lock, Plus, Search, Trash2, Undo2, Upload, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRecargaAgrupada } from '@/hooks/useRecargaAgrupada';
import {
  agruparPorUnidad, CLASIFICACIONES, colorClasificacion, colorMarca, compararRevision, costoEstimado, etiquetaRev, LEYENDA,
  hoyMexico, lineaConContenido, MONEDAS, normalizar, UNIDADES,
  estadoPedido, resumenPedidos, type EstadoPedido,
  COLOR_ESTADO, ESTADO_CORTO, ESTADOS_ALMACEN, ESTADOS_PAGO, estadoAlmacenDe, estadoAlmacenPorCantidad, estadoPagoDe, faltanDe, fechaMx,
  pagadoIncompleto, resumenEstados, tieneFolio,
  type EstadoAlmacen, type EstadoPago,
  type CambiosLinea, type CampoEditable, type EncabezadoRev, type LineaRev, type Marca, type NombrarPor, type Revision,
} from '@/lib/explosion-revisiones';

/* ═══ Estado de compra ("YA PEDIDO") ═══ */

const ESTILO_PEDIDO: Record<EstadoPedido, { txt: string; css: string }> = {
  falta: { txt: 'Falta pedir', css: 'bg-amber-100 text-amber-800 border-amber-300' },
  pedido: { txt: 'Pedido', css: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  comprado: { txt: 'Comprado', css: 'bg-emerald-600 text-white border-emerald-700' },
  almacen: { txt: 'En almacén', css: 'bg-sky-600 text-white border-sky-700' },
  no_se_compra: { txt: 'No se compra', css: 'bg-slate-100 text-slate-400 border-slate-200' },
};

/** Pastilla con la etapa más avanzada del material y sus folios de OC */
function PastillaPedido({ l }: { l: LineaRev }) {
  const e = estadoPedido(l);
  const folios = String(l.oc ?? '').split(/[,;/]+/).map(f => f.trim()).filter(Boolean);
  const conOc = folios.length > 0 && e !== 'falta' && e !== 'no_se_compra';
  return (
    <span title={folios.length ? `OC ${folios.join(', ')}` : undefined}
      className={`inline-flex items-center gap-1 max-w-full px-1.5 py-0.5 rounded-md border text-[10.5px] font-bold whitespace-nowrap overflow-hidden ${ESTILO_PEDIDO[e].css}`}>
      <span className="truncate">{ESTILO_PEDIDO[e].txt}{conOc ? ` · OC ${folios.join(', ')}` : ''}</span>
    </span>
  );
}

/** Estado de FINANZAS o ALMACÉN: selector con el color de la leyenda; sin permiso, solo la pastilla */
function SelectorEstado<E extends EstadoPago | EstadoAlmacen>({ valor, estados, disabled, onCambio, etiqueta, corto = false }: {
  valor: E; estados: readonly E[]; disabled: boolean; onCambio: (v: E) => void; etiqueta: string; corto?: boolean;
}) {
  const color = COLOR_ESTADO[valor];
  const estilo = { backgroundColor: color.fondo, color: color.texto, borderColor: `${color.texto}55` };
  if (disabled) {
    return (
      <span title={valor} style={estilo} className="inline-flex max-w-full px-1.5 py-1 rounded-md border text-[10.5px] font-bold whitespace-nowrap overflow-hidden">
        <span className="truncate">{corto ? ESTADO_CORTO[valor] : valor}</span>
      </span>
    );
  }
  return (
    <select aria-label={etiqueta} title={valor} value={valor} onChange={e => onCambio(e.target.value as E)} style={estilo}
      className="w-full min-w-0 px-1 py-1 rounded-md border text-[10.5px] font-bold cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500">
      {estados.map(e => <option key={e} value={e} style={{ backgroundColor: '#fff', color: '#0f172a' }}>{e}</option>)}
    </select>
  );
}

/** Fecha en dd/mm/aaaa; el <input type="date"> (cuyo formato depende del navegador) solo al dar clic */
function FechaCelda({ valor, disabled, onCambio, etiqueta, className = '' }: {
  valor: string | null | undefined; disabled: boolean; onCambio: (v: string | null) => void; etiqueta: string; className?: string;
}) {
  const [editando, setEditando] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editando) return;
    ref.current?.focus();
    // Abre el calendario de una vez (el clic todavía cuenta como gesto del usuario)
    try { ref.current?.showPicker(); } catch { /* el navegador no lo permite: queda el campo enfocado */ }
  }, [editando]);
  const texto = fechaMx(valor);
  if (editando && !disabled) {
    return (
      <input ref={ref} type="date" aria-label={etiqueta} value={valor ?? ''} onChange={e => onCambio(e.target.value || null)} onBlur={() => setEditando(false)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditando(false); }} className={`${CAMPO_FECHA} ${className}`} />
    );
  }
  if (disabled) return <span aria-label={etiqueta} className={`block px-1 py-1 text-center text-[11.5px] tabular-nums text-slate-700 ${className}`}>{texto || '—'}</span>;
  return (
    <button type="button" aria-label={`${etiqueta}: ${texto || 'sin fecha'}`} onClick={() => setEditando(true)}
      className={`${CAMPO_FECHA} text-center hover:border-sky-500 ${texto ? '' : 'text-slate-400'} ${className}`}>
      {texto || 'dd/mm/aaaa'}
    </button>
  );
}

/** Pastilla roja: se pagó completo pero no ha llegado todo */
function PastillaIncompleto({ l }: { l: LineaRev }) {
  const faltan = faltanDe(l);
  return (
    <span title="Finanzas = PAGADO, pero el material no ha llegado completo" className="inline-flex max-w-full items-center px-1.5 py-0.5 rounded-md border border-red-300 bg-red-100 text-red-700 text-[10px] font-extrabold whitespace-nowrap overflow-hidden">
      <span className="truncate">⚠ Pagado · faltan {cantidadTxt(faltan)}{l.unidad ? ` ${l.unidad}` : ''}</span>
    </span>
  );
}

/** Cantidad recibida: "4 de 5" (de la cantidad necesaria); al enfocar se escribe el total. Se guarda al salir o con Enter */
function CampoRecibida({ valor, necesaria, disabled, resaltar, onGuardar, className = '' }: {
  valor: number | null | undefined; necesaria: number; disabled: boolean; resaltar: boolean; onGuardar: (n: number | null) => void; className?: string;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const mostrado = texto ?? (valor != null ? `${cantidadTxt(Number(valor))} de ${cantidadTxt(necesaria)}` : '');
  const guardar = () => {
    if (texto === null) return;
    const limpio = texto.replace(/[^\d.]/g, '');
    setTexto(null);
    const n = limpio === '' ? null : Number(limpio);
    if (n !== (valor ?? null)) onGuardar(n !== null && Number.isFinite(n) ? n : null);
  };
  return (
    <input type="text" inputMode="decimal" aria-label="Cantidad recibida" value={mostrado} disabled={disabled} autoFocus={resaltar}
      placeholder={resaltar ? '¿Cuánto?' : '—'}
      onFocus={() => setTexto(valor != null ? String(valor) : '')}
      onChange={e => setTexto(e.target.value)} onBlur={guardar} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className={`w-full min-w-0 px-1.5 py-1 rounded-md border text-right tabular-nums text-[11.5px] focus:border-sky-600 focus:bg-white focus:outline-none disabled:bg-transparent disabled:border-transparent ${resaltar ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-300' : 'border-slate-300 bg-white/70'} ${className}`} />
  );
}

/** Selector SI / NO / — de "Se compra o no" */
function CampoSeCompra({ valor, disabled, onCambio }: { valor: boolean | null | undefined; disabled: boolean; onCambio: (v: boolean | null) => void }) {
  return (
    <select aria-label="Se compra" value={valor === true ? 'si' : valor === false ? 'no' : ''} disabled={disabled}
      onChange={e => onCambio(e.target.value === 'si' ? true : e.target.value === 'no' ? false : null)}
      className="w-full bg-transparent px-1 py-0.5 rounded text-center text-[11.5px] font-semibold disabled:opacity-100 disabled:appearance-none focus:outline-none focus:ring-1 focus:ring-sky-500">
      <option value="">—</option>
      <option value="si">SI</option>
      <option value="no">NO</option>
    </select>
  );
}

/* ═══ Tipos ═══ */

export interface ResumenHoja {
  numero: number;
  estado: Revision['estado'];
  /** Materiales con clave o descripción en la última revisión */
  materiales: number;
}

interface Partida { id: string; clave: string; descripcion: string; cantidad: number }

/** Orden de compra (PDF) ya subida — tabla bom_ordenes_compra */
interface OrdenCompra {
  id: string; folio: string; referencia: string; proveedor: string; fecha: string;
  archivo_nombre: string | null; subido_por: string | null; created_at: string;
  /** Importes leídos del PDF (null si el PDF no los traía o falta sql/bom_pagos_oc.sql) */
  subtotal?: number | null; iva?: number | null; total?: number | null;
  monto_pagado?: number | null; fecha_pago?: string | null;
  partidas: { clave: string; descripcion: string; cantidad: number; unidad: string; encontrada?: boolean }[];
}

type CambiosCompra = Partial<Pick<LineaRev, 'oc' | 'comprado' | 'fecha_compra' | 'almacen' | 'fecha_almacen' | 'estado_pago' | 'fecha_estado_pago' | 'estado_almacen' | 'cantidad_recibida'>>;

export type PerfilHoja = 'admin' | 'madera' | 'compras' | 'finanzas' | 'almacen';

/** Qué edita cada perfil (copia de PERMISOS en src/lib/admin-api.ts; ahí se valida de verdad) */
const PERMISOS_HOJA: Record<'excel' | 'oc' | 'pagos' | 'almacen', PerfilHoja[]> = {
  excel: ['admin', 'madera', 'compras'],
  oc: ['admin', 'madera', 'compras'],
  pagos: ['admin', 'madera', 'finanzas'],
  almacen: ['admin', 'madera', 'almacen'],
};

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
  /** Panel de madera: solo compras (OC, Compra, Almacén, fechas, PDF de OC) */
  soloCompras?: boolean;
  /** Clasificación con la que abre el filtro (ej. 'Madera'); si no hay de esa, se ven todas */
  filtroInicial?: string;
  /** Perfil que ve la hoja (default admin). Los perfiles ERP solo editan su parte */
  perfil?: PerfilHoja;
  /** Madera en "Subir archivos": todos los materiales (no solo los de madera) en la hoja y las descargas */
  completa?: boolean;
  /** Avisa qué revisión se está viendo (la página de madera la usa para sus botones de descarga) */
  onVista?: (vista: { id: string; numero: number; estado: Revision['estado'] } | null) => void;
}

/* ═══ Constantes y helpers ═══ */

const TARJETA = 'rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]';

/**
 * Columnas de la tabla (escritorio): Clave · Descripción · Unidad · Clasificación · Moneda · Costo · Cantidad · Costo est. ·
 * Estado · Se compra · COMPRAS (OC · Fecha · Check) · FINANZAS (estado · fecha) · ALMACÉN (estado · recibido · faltan · fecha) · borrar.
 * Clave y Descripción se quedan fijas a la izquierda al desplazar la tabla hacia las columnas de la derecha.
 */
const COLUMNAS = 'grid grid-cols-[104px_minmax(260px,1fr)_88px_112px_104px_88px_92px_104px_128px_64px_92px_124px_54px_150px_124px_168px_150px_76px_124px_28px]';
/** Las mismas sin Costo ni Costo estimado (perfil almacén) */
const COLUMNAS_SIN_COSTO = 'grid grid-cols-[104px_minmax(260px,1fr)_88px_112px_104px_92px_128px_64px_92px_124px_54px_150px_124px_168px_150px_76px_124px_28px]';

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

/** Casillas OC / Compra */
/** Fechas de compra / almacén (input date) */
/** Fondo de la hoja (las filas sin color lo usan para que la clave fija tape lo que pasa debajo) */
const FONDO_HOJA = '#f8f7f3';

/** Clave y Descripción fijas a la izquierda (necesitan fondo para tapar lo que pasa debajo) */
const STICKY_CLAVE = 'sticky left-0 z-[2]';
const STICKY_DESC = 'sticky left-[104px] z-[2] shadow-[6px_0_8px_-6px_rgba(0,0,0,0.25)]';

const CAMPO_FECHA = 'w-full min-w-0 bg-white/70 px-1 py-1 rounded-md border border-slate-300 text-[11.5px] tabular-nums text-slate-800 focus:border-sky-600 focus:bg-white focus:outline-none disabled:bg-transparent disabled:border-transparent';

const CAMPO_OC = 'w-full min-w-0 bg-white/70 px-1.5 py-1 rounded-md border border-slate-300 text-center font-mono font-semibold focus:border-sky-600 focus:bg-white focus:outline-none disabled:bg-transparent disabled:border-transparent placeholder:text-slate-300';

/* ═══ Componente principal ═══ */

export function HojaExplosion({ explosionId, estado, bloqueado, partidas, asegurarIniciada, onAviso, onResumen, guardarRef, soloCompras = false, filtroInicial = 'todas', perfil = 'admin', completa = false, onVista }: Props) {
  const extraCompleta = completa ? '&completa=1' : '';
  // Permisos del perfil (solo para mostrar u ocultar; las API responden 403 si no le toca)
  const permExcel = PERMISOS_HOJA.excel.includes(perfil);
  const permOc = PERMISOS_HOJA.oc.includes(perfil);
  const permPagos = PERMISOS_HOJA.pagos.includes(perfil);
  const permAlmacen = PERMISOS_HOJA.almacen.includes(perfil);
  const totalColsAntesCompras = perfil !== 'almacen' ? 10 : 8;
  const verCostos = perfil !== 'almacen';
  const esAdminHoja = perfil === 'admin';
  const COLS = verCostos ? COLUMNAS : COLUMNAS_SIN_COSTO;
  const [revisiones, setRevisiones] = useState<Revision[]>([]);
  const [cargando, setCargando] = useState(true);
  const [vistaId, setVistaId] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; avisos: string[] } | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroClasif, setFiltroClasif] = useState<string>(filtroInicial);
  // Filtro rápido: todos · falta pedir · pedidos · pendiente de pago · por recibir · parciales (pago o almacén)
  const [filtroPedido, setFiltroPedido] = useState<'todos' | 'falta' | 'pedidos' | 'pend_pago' | 'por_recibir' | 'parciales' | 'pagado_incompleto'>('todos');
  // Partidas donde se eligió PARCIALMENTE RECIBIDO y falta escribir cuánto llegó (todavía no se guardan)
  const [esperandoCantidad, setEsperandoCantidad] = useState<Set<string>>(new Set());
  const [cerradas, setCerradas] = useState<Set<string>>(new Set());
  const [verPartidas, setVerPartidas] = useState(false);
  const [menuExcel, setMenuExcel] = useState(false);
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [subiendoOc, setSubiendoOc] = useState(false);
  const [enfocar, setEnfocar] = useState<string | null>(null);
  const [encLocal, setEncLocal] = useState<Partial<EncabezadoRev>>({});
  const [motivoLocal, setMotivoLocal] = useState<string | null>(null);
  const [nombrarPor, setNombrarPorState] = useState<NombrarPor>(() => {
    try { return localStorage.getItem('bom-nombrar-por') === 'sucursal' ? 'sucursal' : 'pedido'; } catch { return 'pedido'; }
  });

  const inputArchivo = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Cómo se va a importar el archivo que se elija: como siguiente revisión o reemplazando la última
  const modoImport = useRef<'siguiente' | 'reemplazar'>('siguiente');
  const inputPdf = useRef<HTMLInputElement>(null);
  // OC / Compra escritos a mano: esperando el debounce (no abren revisión, van por /compras)
  const pendCompra = useRef<Record<string, CambiosCompra>>({});
  const timersCompra = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
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
      const [res, resOc] = await Promise.all([
        fetch(`/api/bom/revisiones?explosion_id=${encodeURIComponent(explosionId)}${extraCompleta}`, { cache: 'no-store' }),
        fetch(`/api/bom/revisiones/compras?explosion_id=${encodeURIComponent(explosionId)}`, { cache: 'no-store' }),
      ]);
      if (!res.ok) throw new Error();
      const d = await res.json();
      // Si la tabla de OC todavía no existe (falta el SQL), la hoja sigue funcionando sin ellas
      if (resOc.ok) setOrdenes(((await resOc.json()).ordenes ?? []) as OrdenCompra[]);
      const lista = (d.revisiones as Revision[]).map(r => ({
        ...r,
        // Lo que se está escribiendo gana sobre lo que llega (también si la línea ya es la copia en la REV nueva)
        lineas: r.lineas.map(l => ({
          ...l,
          ...(l.origen_id ? enviando.current[l.origen_id] : undefined), ...enviando.current[l.id],
          ...(l.origen_id ? pendientes.current[l.origen_id] : undefined), ...pendientes.current[l.id],
          ...(l.origen_id ? pendCompra.current[l.origen_id] : undefined), ...pendCompra.current[l.id],
        })),
      }));
      setRevisiones(lista);
    } catch {
      onAviso('No se pudo cargar la hoja de explosión.');
    } finally {
      setCargando(false);
    }
  }, [explosionId, onAviso, extraCompleta]);

  const recargar = useRecargaAgrupada(cargar, 400);
  useEffect(() => {
    const ch = supabase
      .channel(`bom-hoja-${explosionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bom_revisiones', filter: `explosion_id=eq.${explosionId}` }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bom_revision_lineas', filter: `explosion_id=eq.${explosionId}` }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bom_ordenes_compra', filter: `explosion_id=eq.${explosionId}` }, recargar)
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
  const puedeEscribir = !soloCompras && esAdminHoja && esUltima && !bloqueado && estado !== 'completado';
  const comparacion = useMemo(() => compararRevision(ordenadas, idxVista), [ordenadas, idxVista]);
  const previasPorId = useMemo(() => new Map((ordenadas[idxVista - 1]?.lineas ?? []).map(l => [l.id, l])), [ordenadas, idxVista]);

  useEffect(() => {
    onVista?.(vista ? { id: vista.id, numero: vista.numero, estado: vista.estado } : null);
  }, [vista, onVista]);

  // Resumen para la página (botón Terminar, modal final)
  useEffect(() => {
    onResumen(ultima ? { numero: ultima.numero, estado: ultima.estado, materiales: ultima.lineas.filter(lineaConContenido).length } : null);
  }, [ultima, onResumen]);

  const lineasVista = useMemo(() => vista?.lineas ?? [], [vista]);
  // Si la clasificación elegida no existe en esta hoja (ej. filtro inicial "Madera" en un pedido sin madera), se ven todas
  const filtroEfectivo = filtroClasif === 'todas' || lineasVista.some(l => normalizar(l.clasificacion) === normalizar(filtroClasif)) ? filtroClasif : 'todas';
  const filtradas = useMemo(() => {
    const t = normalizar(busqueda);
    return lineasVista.filter(l => {
      const e = estadoPedido(l);
      const pago = estadoPagoDe(l);
      const alm = estadoAlmacenDe(l);
      const pasaPedido =
        filtroPedido === 'todos' ? true
        : filtroPedido === 'falta' ? e === 'falta'
        : filtroPedido === 'pedidos' ? e !== 'falta' && e !== 'no_se_compra'
        : filtroPedido === 'pend_pago' ? pago === 'PENDIENTE DE PAGO'
        : filtroPedido === 'por_recibir' ? alm !== 'RECIBIDO'
        : filtroPedido === 'pagado_incompleto' ? pagadoIncompleto(l)
        : pago === 'PARCIALMENTE PAGADO' || alm === 'PARCIALMENTE RECIBIDO';
      // El renglón vacío (material recién agregado sin clave ni descripción) solo lo ve quien puede editar materiales
      if (!puedeEscribir && !lineaConContenido(l)) return false;
      return (filtroEfectivo === 'todas' || normalizar(l.clasificacion) === normalizar(filtroEfectivo)) && pasaPedido &&
        (!t || normalizar(`${l.clave} ${l.descripcion}`).includes(t));
    });
  }, [lineasVista, busqueda, filtroEfectivo, filtroPedido, puedeEscribir]);
  const pedidosResumen = useMemo(() => resumenPedidos(lineasVista), [lineasVista]);
  const estadosResumen = useMemo(() => resumenEstados(lineasVista), [lineasVista]);
  const grupos = useMemo(() => agruparPorUnidad(filtradas), [filtradas]);
  const totalCosto = useMemo(() => lineasVista.reduce((s, l) => s + costoEstimado(l), 0), [lineasVista]);
  const conContenido = useMemo(() => lineasVista.filter(lineaConContenido), [lineasVista]);
  const compradas = conContenido.filter(l => l.comprado).length;
  const enAlmacen = conContenido.filter(l => l.almacen).length;
  const conOc = conContenido.filter(l => l.oc.trim()).length;
  // Dinero de compras: lo de las OC subidas y lo estimado de lo que todavía no tiene OC
  const totalOcs = ordenes.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const pagadoOcs = ordenes.reduce((s, o) => s + Math.min(Number(o.monto_pagado) || 0, Number(o.total) || Infinity), 0);
  const porPagar = Math.max(0, totalOcs - pagadoOcs);
  const faltaComprar = conContenido.filter(l => !l.oc.trim()).reduce((s, l) => s + costoEstimado(l), 0);
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

  /* ── Compras: OC a mano y casilla Compra (no abren revisión) ── */
  const puedeComprar = esUltima && !!ultima;
  // OC y Compra (compras) · Almacén (almacén)
  const editaOc = puedeComprar && permOc;
  const editaAlmacen = puedeComprar && permAlmacen;
  const editaPago = puedeComprar && permPagos;

  const enviarCompra = useCallback(async (lineaId: string) => {
    clearTimeout(timersCompra.current[lineaId]);
    const campos = pendCompra.current[lineaId];
    if (!campos) return;
    const r = await pedir('/api/bom/revisiones/compras', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ explosion_id: explosionId, linea_id: lineaId, ...campos }),
    }, 'No se pudo guardar la OC.');
    // Solo se suelta si no se escribió algo más mientras se guardaba
    if (pendCompra.current[lineaId] === campos) delete pendCompra.current[lineaId];
    // El cambio quedó guardado pero el aviso a otro perfil falló: se dice, no se oculta
    if (r.ok && r.datos.aviso) onAviso(r.datos.aviso);
    if (!r.ok || r.datos.linea?.id !== lineaId) recargar();
  }, [explosionId, pedir, recargar, onAviso]);

  /** soloLocal: lo que el servidor calcula solo (fechas, casilla almacen) y aquí solo se muestra mientras responde */
  const cambiarCompra = useCallback((linea: LineaRev, campos: CambiosCompra, inmediato = false, soloLocal: CambiosCompra = {}) => {
    if (!puedeComprar) return;
    setRevisiones(prev => prev.map(r => (r.id !== linea.revision_id ? r : { ...r, lineas: r.lineas.map(l => (l.id === linea.id ? { ...l, ...soloLocal, ...campos } : l)) })));
    pendCompra.current[linea.id] = { ...pendCompra.current[linea.id], ...campos };
    clearTimeout(timersCompra.current[linea.id]);
    if (inmediato) void enviarCompra(linea.id);
    else timersCompra.current[linea.id] = setTimeout(() => void enviarCompra(linea.id), 700);
  }, [puedeComprar, enviarCompra]);

  /** Palomear Compra: si no tiene fecha, propone la de hoy (se puede cambiar o borrar) */
  const palomear = (linea: LineaRev, valor: boolean) => {
    cambiarCompra(linea, { comprado: valor, ...(valor && !linea.fecha_compra ? { fecha_compra: hoyMexico() } : {}) }, true);
  };

  /** FINANZAS: el servidor pone la fecha de hoy al cambiar (y la borra al regresar a pendiente) */
  const cambiarPago = (linea: LineaRev, estado: EstadoPago) => {
    if (estado === estadoPagoDe(linea)) return;
    cambiarCompra(linea, { estado_pago: estado }, true, { fecha_estado_pago: estado === 'PENDIENTE DE PAGO' ? null : hoyMexico() });
  };

  const quitarEspera = (id: string) => setEsperandoCantidad(prev => { if (!prev.has(id)) return prev; const n = new Set(prev); n.delete(id); return n; });

  /** ALMACÉN: siempre a mano. PARCIALMENTE RECIBIDO espera la cantidad antes de guardar */
  const cambiarAlmacen = (linea: LineaRev, estado: EstadoAlmacen) => {
    const antes = estadoAlmacenDe(linea);
    if (estado === 'PARCIALMENTE RECIBIDO') {
      const r = Number(linea.cantidad_recibida) || 0;
      if (antes !== 'PARCIALMENTE RECIBIDO' && !(r > 0 && r < Number(linea.cantidad))) {
        setEsperandoCantidad(prev => new Set(prev).add(linea.id));
        return;
      }
    }
    quitarEspera(linea.id);
    if (estado === antes) return;
    const fecha = estado === 'PENDIENTE DE RECIBIR' ? null : hoyMexico();
    const r = Number(linea.cantidad_recibida) || 0;
    if (estado === 'RECIBIDO') cambiarCompra(linea, { estado_almacen: estado }, true, { almacen: true, fecha_almacen: fecha, cantidad_recibida: r >= Number(linea.cantidad) ? r : linea.cantidad });
    else if (estado === 'PENDIENTE DE RECIBIR') cambiarCompra(linea, { estado_almacen: estado }, true, { almacen: false, fecha_almacen: null, cantidad_recibida: null });
    else cambiarCompra(linea, { estado_almacen: estado }, true, { almacen: false, fecha_almacen: fecha });
  };

  /** Lo que se ve mientras responde el servidor al cambiar la cantidad: el estado sale de la cantidad */
  const localPorCantidad = (linea: LineaRev, n: number | null): CambiosCompra => {
    const estado = estadoAlmacenPorCantidad(n, Number(linea.cantidad) || 0);
    return { estado_almacen: estado, almacen: estado === 'RECIBIDO', ...(estado !== estadoAlmacenDe(linea) ? { fecha_almacen: estado === 'PENDIENTE DE RECIBIR' ? null : hoyMexico() } : {}) };
  };

  /**
   * Total recibido escrito a mano: el estado se ajusta solo (0 → por recibir, menos → parcial, todo → recibido).
   * Si se acaba de elegir PARCIALMENTE RECIBIDO, tiene que ser más de 0 y menos de lo necesario.
   */
  const guardarRecibida = (linea: LineaRev, n: number | null) => {
    const necesaria = Number(linea.cantidad) || 0;
    if (n !== null && Math.abs(n * 1000 - Math.round(n * 1000)) > 1e-6) { onAviso('La cantidad recibida admite hasta 3 decimales.'); return; }
    if (esperandoCantidad.has(linea.id) && (!n || n <= 0 || (necesaria > 0 && n >= necesaria))) {
      onAviso(`Escribe cuánto llegó (más de 0 y menos de lo necesario${necesaria ? `: ${cantidadTxt(necesaria)}` : ''}). Si llegó todo, elige RECIBIDO.`);
      return;
    }
    quitarEspera(linea.id);
    const total = n && n > 0 ? n : null;
    cambiarCompra(linea, { cantidad_recibida: total }, true, localPorCantidad(linea, total));
  };

  /** "+ llegada": otra entrega del mismo material, se suma al total */
  const sumarLlegada = async (linea: LineaRev) => {
    const texto = prompt(`¿Cuánto llegó ahora de ${linea.clave || linea.descripcion}? (ya van ${cantidadTxt(Number(linea.cantidad_recibida) || 0)} de ${cantidadTxt(Number(linea.cantidad) || 0)}${linea.unidad ? ` ${linea.unidad}` : ''})`);
    if (texto === null) return;
    const n = Number(texto.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(n) || n <= 0) { onAviso('Escribe cuánto llegó en esta entrega (más de 0).'); return; }
    if (Math.abs(n * 1000 - Math.round(n * 1000)) > 1e-6) { onAviso('La cantidad admite hasta 3 decimales.'); return; }
    await Promise.all(Object.keys(pendCompra.current).map(enviarCompra));
    const total = Math.round(((Number(linea.cantidad_recibida) || 0) + n) * 1000) / 1000;
    setRevisiones(prev => prev.map(r => (r.id !== linea.revision_id ? r : { ...r, lineas: r.lineas.map(l => (l.id === linea.id ? { ...l, cantidad_recibida: total, ...localPorCantidad(linea, total) } : l)) })));
    const r = await pedir('/api/bom/revisiones/compras', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ explosion_id: explosionId, linea_id: linea.id, sumar_llegada: n }),
    }, 'No se pudo sumar la llegada.');
    if (r.ok && r.datos.aviso) onAviso(r.datos.aviso);
    recargar();
  };

  /** Sube uno o varios PDF de órdenes de compra y escribe sus folios en la columna OC */
  const subirOrdenes = async (archivos: File[]) => {
    const pdfs = archivos.filter(f => /\.pdf$/i.test(f.name));
    if (!pdfs.length) return;
    if (!ultima) { onAviso('Primero sube la explosión (Excel) y después las órdenes de compra.'); return; }
    setSubiendoOc(true);
    setMensaje(null);
    const lineasMsg: string[] = [];
    const avisos: string[] = [];
    try {
      await Promise.all(Object.keys(pendCompra.current).map(enviarCompra));
      for (const archivo of pdfs) {
        const enviar = async (forzar: boolean) => {
          const form = new FormData();
          form.append('explosion_id', explosionId);
          form.append('archivo', archivo);
          if (forzar) form.append('forzar', '1');
          try {
            const res = await fetch('/api/bom/revisiones/compras', { method: 'POST', body: form });
            return { res, datos: await res.json().catch(() => ({})) };
          } catch {
            return { res: null, datos: { error: `${archivo.name}: no hay conexión con el servidor.` } };
          }
        };
        let { res, datos } = await enviar(false);
        if (res?.status === 409 && datos.confirmar) {
          if (!confirm(`${datos.error}\n\n¿Aplicar la OC ${datos.folio} a este pedido de todos modos?`)) { avisos.push(`OC ${datos.folio} no se aplicó (es de otro pedido).`); continue; }
          ({ res, datos } = await enviar(true));
        }
        if (!res?.ok) { avisos.push(datos.error || `${archivo.name}: no se pudo leer.`); continue; }
        const o = datos.orden as OrdenCompra;
        const totalOc = Number(o.total) || 0;
        const porPagarOc = Math.max(0, totalOc - (Number(o.monto_pagado) || 0));
        const fuera = datos.no_encontradas?.length ?? 0;
        const pedidosOc = o.partidas.length - fuera;
        lineasMsg.push(`OC ${o.folio}${o.proveedor ? ` (${o.proveedor})` : ''}: ${pedidosOc} material${pedidosOc === 1 ? ' quedó' : 'es quedaron'} como PEDIDO${fuera ? `; ${fuera} clave${fuera === 1 ? ' no está' : 's no están'} en la explosión` : ''}${totalOc ? ` · total $${dinero(totalOc)} · ${porPagarOc ? `por pagar $${dinero(porPagarOc)}` : 'pagada'}` : ''}.`);
        for (const p of (datos.no_encontradas ?? []) as OrdenCompra['partidas']) avisos.push(`La OC ${o.folio} trae ${p.clave} (${p.descripcion.slice(0, 50)}), que no está en la explosión.`);
      }
      if (lineasMsg.length || avisos.length) setMensaje({ texto: lineasMsg.join(' · ') || 'No se aplicó ninguna orden de compra.', avisos });
      await cargar();
    } finally {
      setSubiendoOc(false);
    }
  };

  /* ── Pagos de las OC (se guardan al momento; el monto escrito, al salir del campo) ── */
  const pagarOrden = async (o: OrdenCompra, cambios: { pagada?: boolean; monto_pagado?: number; fecha_pago?: string | null }) => {
    const extra = cambios.pagada && !o.fecha_pago ? { fecha_pago: hoyMexico() } : {};
    setOrdenes(prev => prev.map(x => (x.id !== o.id ? x : {
      ...x, ...extra,
      ...(cambios.fecha_pago !== undefined ? { fecha_pago: cambios.fecha_pago } : {}),
      ...(cambios.monto_pagado !== undefined ? { monto_pagado: cambios.monto_pagado } : {}),
      ...(cambios.pagada !== undefined ? { monto_pagado: cambios.pagada ? Number(x.total) || 0 : 0 } : {}),
    })));
    const r = await pedir('/api/bom/revisiones/compras', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ explosion_id: explosionId, folio: o.folio, ...extra, ...cambios }),
    }, 'No se pudo guardar el pago.');
    if (!r.ok) recargar();
  };

  /** Masivo: el pago de todas las partidas de una OC (un solo aviso a almacén) */
  const marcarPartidasOc = async (o: OrdenCompra, estado: EstadoPago, cuantas: number) => {
    if (!confirm(`¿Marcar las ${cuantas} partida(s) de la OC ${o.folio} como ${estado}? Se pone la fecha de hoy y se avisa a almacén.`)) return;
    setSubiendoOc(true);
    try {
      await Promise.all(Object.keys(pendCompra.current).map(enviarCompra));
      const r = await pedir('/api/bom/revisiones/compras', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ explosion_id: explosionId, oc: o.folio, estado_pago: estado }),
      }, 'No se pudo cambiar el pago de las partidas.');
      if (r.ok) setMensaje({
        texto: r.datos.cambiadas ? `OC ${o.folio}: ${r.datos.cambiadas} partida(s) quedaron como ${estado}.` : `Las partidas de la OC ${o.folio} ya estaban como ${estado}.`,
        avisos: r.datos.aviso ? [r.datos.aviso] : [],
      });
      await cargar();
    } finally {
      setSubiendoOc(false);
    }
  };

  const quitarOrden = async (o: OrdenCompra) => {
    if (!confirm(`¿Quitar la OC ${o.folio}? Se borra su folio de la columna OC (las casillas de Compra no se tocan).`)) return;
    setSubiendoOc(true);
    try {
      await pedir(`/api/bom/revisiones/compras?explosion_id=${encodeURIComponent(explosionId)}&folio=${encodeURIComponent(o.folio)}`, { method: 'DELETE' }, 'No se pudo quitar la OC.');
      await cargar();
    } finally {
      setSubiendoOc(false);
    }
  };

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
  const importar = async (archivo: File, modo: 'siguiente' | 'reemplazar' = 'siguiente') => {
    if (!/\.xlsx$/i.test(archivo.name)) { onAviso('El archivo debe ser un Excel .xlsx.'); return; }
    if (ultima) {
      const destino = modo === 'reemplazar'
        ? `sustituye a ${etiquetaRev(ultima.numero)} (se borra lo que tenía y conserva el número)`
        : ultima.estado === 'borrador' ? `reemplaza el borrador ${etiquetaRev(ultima.numero)}` : `se guarda como ${etiquetaRev(ultima.numero + 1)}`;
      if (!confirm(`¿Importar "${archivo.name}"? El contenido del archivo ${destino}.`)) return;
    }
    if (!(await prepararEscritura())) return;
    setImportando(true);
    setMensaje(null);
    try {
      await guardarTodo();
      const form = new FormData();
      form.append('explosion_id', explosionId);
      form.append('modo', modo);
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

  /* ── Quitar revisiones (Excel equivocado) ── */
  const limpiarPendientes = () => {
    for (const t of Object.values(timers.current)) clearTimeout(t);
    clearTimeout(timerEnc.current);
    clearTimeout(timerMotivo.current);
    pendientes.current = {};
    encPendiente.current = {};
    motivoPendiente.current = null;
    setEncLocal({});
    setMotivoLocal(null);
  };

  const quitarRevisiones = async (accion: 'eliminar_ultima' | 'vaciar') => {
    if (!ultima) return;
    if (estado === 'completado') { onAviso('La explosión está terminada. Da clic en "Editar" (arriba) antes de quitar revisiones.'); return; }
    const pregunta = accion === 'vaciar'
      ? `¿Vaciar la hoja? Se borran TODAS las revisiones (${ordenadas.map(r => etiquetaRev(r.numero)).join(', ')}) y sus materiales. Podrás volver a subir el Excel. No se puede deshacer.`
      : `¿Eliminar ${etiquetaRev(ultima.numero)}${ultima.origen === 'importado' && ultima.archivo_nombre ? ` (${ultima.archivo_nombre})` : ''}? La hoja regresa a ${ultima.numero > 0 && ordenadas.length > 1 ? etiquetaRev(ordenadas[ordenadas.length - 2].numero) : 'vacía'}. No se puede deshacer.`;
    if (!confirm(pregunta)) return;
    setTrabajando(true);
    try {
      limpiarPendientes();
      const r = await pedir('/api/bom/revisiones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ explosion_id: explosionId, accion }),
      }, accion === 'vaciar' ? 'No se pudo vaciar la hoja.' : 'No se pudo eliminar la revisión.');
      if (r.ok) setMensaje({ texto: accion === 'vaciar' ? 'La hoja quedó vacía. Ya puedes subir el Excel correcto.' : `Se eliminó ${etiquetaRev(ultima.numero)}.`, avisos: [] });
      setVistaId(null);
      await cargar();
    } finally {
      setTrabajando(false);
    }
  };

  /** Abre el selector de archivo para importar de cierta forma */
  const elegirArchivo = (modo: 'siguiente' | 'reemplazar') => {
    modoImport.current = modo;
    setMenuExcel(false);
    inputArchivo.current?.click();
  };

  // El menú se cierra al hacer clic fuera o con Escape
  useEffect(() => {
    if (!menuExcel) return;
    const fuera = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuExcel(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuExcel(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
  }, [menuExcel]);

  /** Descarga la revisión que se está viendo, en Excel o en PDF */
  const descargar = async (formato: 'xlsx' | 'pdf' = 'xlsx') => {
    if (!vista) return;
    await guardarTodo();
    // Descarga con un enlace temporal (es un archivo de la API, no una página)
    const a = document.createElement('a');
    a.href = `/api/bom/revisiones/excel?explosion_id=${encodeURIComponent(explosionId)}&revision_id=${encodeURIComponent(vista.id)}&nombre=${nombrarPor}${extraCompleta}${formato === 'pdf' ? '&formato=pdf' : ''}`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /* ── Arrastrar y soltar ── */
  const puedeImportar = !soloCompras && permExcel && !bloqueado && estado !== 'completado';
  // Los PDF de OC se pueden soltar siempre que ya haya hoja (también con la explosión terminada)
  const aceptaArrastre = puedeImportar || (!!ultima && permOc);
  const eventosArrastre = aceptaArrastre ? {
    onDragEnter: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); contadorArrastre.current++; setArrastrando(true); } },
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); },
    onDragLeave: () => { contadorArrastre.current = Math.max(0, contadorArrastre.current - 1); if (!contadorArrastre.current) setArrastrando(false); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      contadorArrastre.current = 0;
      setArrastrando(false);
      const archivos = Array.from(e.dataTransfer.files ?? []);
      const pdfs = archivos.filter(f => /\.pdf$/i.test(f.name));
      const excel = archivos.find(f => /\.xlsx$/i.test(f.name));
      if (excel) {
        if (puedeImportar) void importar(excel);
        else onAviso(soloCompras ? 'Aquí solo se suben órdenes de compra (PDF). El Excel de la explosión se sube en "Subir archivos".' : !permExcel ? 'Tu perfil no sube el Excel de la explosión.' : estado === 'completado' ? 'La explosión está terminada: da clic en "Editar" para subir otro Excel.' : 'Resuelve el estatus del pedido antes de subir el Excel.');
      } else if (pdfs.length) {
        if (permOc) void subirOrdenes(pdfs);
        else onAviso('Tu perfil no sube órdenes de compra.');
      }
      else onAviso('Suelta un Excel (.xlsx) de explosión o PDF de órdenes de compra.');
    },
  } : {};

  const inputOculto = (
    <input
      ref={inputArchivo}
      type="file"
      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      className="hidden"
      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importar(f, modoImport.current); }}
    />
  );
  const inputOcultoPdf = (
    <input
      ref={inputPdf}
      type="file"
      multiple
      accept=".pdf,application/pdf"
      className="hidden"
      onChange={e => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; if (fs.length) void subirOrdenes(fs); }}
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
        {soloCompras || !permExcel ? (
          <div className="flex flex-col items-center text-center gap-2 py-10 px-4 rounded-2xl border border-white/10 bg-white/[0.03]">
            <Info className="w-8 h-8 text-white/40" />
            <p className="text-sm text-white/70">Este pedido todavía no tiene explosión de materiales.</p>
            <p className="text-xs text-white/40">{soloCompras ? 'Cuando el administrador suba el Excel, aquí podrás capturar las órdenes de compra.' : 'Cuando se suba el Excel de la explosión, aquí aparecerán sus materiales.'}</p>
          </div>
        ) : bloqueado ? (
          <div className="flex flex-col items-center text-center gap-3 py-10 px-4 rounded-2xl border-2 border-dashed border-red-400/25 bg-red-500/[0.04]">
            <Lock className="w-9 h-9 text-red-300/80" />
            <p className="text-sm text-red-200/90 font-semibold">Resuelve el estatus del pedido para empezar la explosión.</p>
            <p className="text-xs text-white/40">Cuando no queden motivos pendientes podrás arrastrar aquí el Excel.</p>
          </div>
        ) : estado === 'completado' ? (
          <div className="flex flex-col items-center text-center gap-2 py-10 px-4 rounded-2xl border border-white/10 bg-white/[0.03]">
            <Info className="w-8 h-8 text-white/40" />
            <p className="text-sm text-white/70">Esta explosión se terminó antes de la hoja con revisiones.</p>
            <p className="text-xs text-white/40">{esAdminHoja ? 'Da clic en "Editar" arriba para abrirla e importar su Excel.' : 'Pide al administrador que la abra para subir su Excel.'}</p>
          </div>
        ) : (
          <div className={`flex flex-col items-center text-center gap-4 py-12 sm:py-16 px-4 rounded-2xl border-2 border-dashed transition-all ${arrastrando ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]' : 'border-white/15 bg-white/[0.02]'}`}>
            {importando ? <Loader2 className="w-12 h-12 text-emerald-400 animate-spin" /> : <Upload className={`w-12 h-12 ${arrastrando ? 'text-emerald-300' : 'text-white/35'}`} />}
            <div>
              <p className="text-base sm:text-lg font-bold text-white">{importando ? 'Leyendo el Excel…' : arrastrando ? 'Suelta el archivo aquí' : 'Arrastra aquí el Excel de explosión'}</p>
              <p className="text-xs text-white/45 mt-1 break-all">EXPLOSION DE MATERIALES … REV-00.xlsx</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap justify-center">
              <button type="button" disabled={importando} onClick={() => elegirArchivo('siguiente')} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50">
                <FileSpreadsheet className="w-4 h-4" /> Elegir archivo
              </button>
              {esAdminHoja && <button type="button" disabled={importando || trabajando} onClick={() => void empezarEnBlanco()} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/75 text-sm font-semibold border border-white/10 disabled:opacity-50">
                {trabajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Empezar en blanco
              </button>}
            </div>
            {estado === 'pendiente' && esAdminHoja && <p className="text-[11px] text-white/35">Al importar o capturar, el cronómetro arranca solo.</p>}
          </div>
        )}
      </section>
    );
  }

  const motivoMostrado = motivoLocal ?? vista.motivo;
  const resumen = comparacion.resumen;
  const hayCambios = resumen.nuevas + resumen.modificadas + resumen.disminuciones + resumen.eliminadas > 0;

  /** RECIBIDO: "4 de 5" (editable), botón "+ llegada" y aviso si llegó de más */
  const celdaRecibido = (l: LineaRev, className = '') => {
    const necesaria = Number(l.cantidad) || 0;
    const recibida = Number(l.cantidad_recibida) || 0;
    const deMas = Math.round((recibida - necesaria) * 1000) / 1000;
    return (
      <span className="min-w-0 flex flex-col gap-0.5">
        <span className="flex items-center gap-1 min-w-0">
          <CampoRecibida valor={l.cantidad_recibida} necesaria={necesaria} resaltar={esperandoCantidad.has(l.id)} disabled={!editaAlmacen} onGuardar={n => guardarRecibida(l, n)} className={className} />
          {editaAlmacen && estadoAlmacenDe(l) !== 'PENDIENTE DE RECIBIR' && !esperandoCantidad.has(l.id) && (
            <button type="button" onClick={() => void sumarLlegada(l)} title="Llegó otra entrega: se suma al total" className="shrink-0 px-1.5 py-1 rounded-md border border-sky-300 bg-sky-50 text-sky-800 text-[10px] font-bold whitespace-nowrap hover:bg-sky-100">+ llegada</button>
          )}
        </span>
        {deMas > 0 && <span className="text-[10px] font-bold text-amber-700">+{cantidadTxt(deMas)} de más</span>}
      </span>
    );
  };

  /* ── Una línea (escritorio) ── */
  const filaEscritorio = (l: LineaRev) => {
    const marca = comparacion.marcas[l.id];
    const est = estiloMarca(marca);
    const tip = detalleCambios(comparacion.cambios[l.id], l.origen_id ? previasPorId.get(l.origen_id) : undefined, l);
    const off = !puedeEscribir;
    return (
      <div key={l.id} title={tip || undefined} className={`${COLS} items-center gap-1 px-2 py-1 border-b border-slate-300/70 text-[12.5px] ${est.texto}`} style={{ backgroundColor: est.fondo ?? FONDO_HOJA }}>
        {/* Clave y descripción se quedan fijas a la izquierda al desplazar la tabla hacia COMPRAS / FINANZAS / ALMACÉN */}
        <input aria-label="Clave" autoFocus={enfocar === l.id} value={l.clave} disabled={off} placeholder="Clave" onChange={e => cambiarLinea(l, { clave: e.target.value })} className={`${CAMPO_HOJA} font-mono font-semibold ${STICKY_CLAVE}`} style={{ backgroundColor: est.fondo ?? FONDO_HOJA }} />
        {off ? (
          <span title={l.descripcion} className={`px-1.5 self-stretch flex items-center ${STICKY_DESC}`} style={{ backgroundColor: est.fondo ?? FONDO_HOJA }}>
            <span className="leading-snug line-clamp-2 break-words">{l.descripcion}</span>
          </span>
        ) : (
          <input aria-label="Descripción" title={l.descripcion} value={l.descripcion} placeholder="Descripción del material" onChange={e => cambiarLinea(l, { descripcion: e.target.value })} className={`${CAMPO_HOJA} ${STICKY_DESC}`} style={{ backgroundColor: est.fondo ?? FONDO_HOJA }} />
        )}
        <CampoLista etiqueta="Unidad" valor={l.unidad} opciones={UNIDADES} disabled={off} onCambio={v => cambiarLinea(l, { unidad: v })} />
        <CampoClasificacion valor={l.clasificacion} disabled={off} onCambio={v => cambiarLinea(l, { clasificacion: v })} />
        <CampoLista etiqueta="Moneda" valor={l.moneda} opciones={MONEDAS} disabled={off} onCambio={v => cambiarLinea(l, { moneda: v })} />
        {verCostos && <CampoNumero etiqueta="Costo" valor={l.costo} disabled={off} onCambio={n => cambiarLinea(l, { costo: n })} />}
        <CampoNumero etiqueta="Cantidad necesaria" valor={l.cantidad} disabled={off} onCambio={n => cambiarLinea(l, { cantidad: n })} className="font-bold" />
        {verCostos && <span className="text-right tabular-nums px-1.5 font-semibold">{dinero(costoEstimado(l))}</span>}
        <span className="px-0.5 min-w-0"><PastillaPedido l={l} /></span>
        <CampoSeCompra valor={l.se_compra} disabled={off} onCambio={v => cambiarLinea(l, { se_compra: v })} />
        {/* COMPRAS: orden de compra · fecha · check */}
        <input aria-label="Orden de compra" title={l.oc ? `OC ${l.oc}` : 'Folio de la orden de compra'} value={l.oc} disabled={!editaOc} placeholder="—" onChange={e => cambiarCompra(l, { oc: e.target.value })} className={`${CAMPO_OC} text-[11.5px]`} />
        <FechaCelda etiqueta="Fecha de compra" valor={l.fecha_compra} disabled={!editaOc} onCambio={v => cambiarCompra(l, { fecha_compra: v }, true)} />
        <span className="flex justify-center"><input type="checkbox" checked={l.comprado} disabled={!editaOc} onChange={e => palomear(l, e.target.checked)} aria-label="Compra" title="Comprado" className="w-4 h-4 accent-emerald-600 cursor-pointer disabled:cursor-default" /></span>
        {/* FINANZAS: estado · fecha */}
        <span className="min-w-0"><SelectorEstado etiqueta="Estado de pago" valor={estadoPagoDe(l)} estados={ESTADOS_PAGO} disabled={!editaPago} onCambio={v => cambiarPago(l, v)} /></span>
        <FechaCelda etiqueta="Fecha del estado de pago" valor={l.fecha_estado_pago} disabled={!editaPago} onCambio={v => cambiarCompra(l, { fecha_estado_pago: v }, true)} />
        {/* ALMACÉN: estado · recibido · faltan · fecha */}
        <span className="min-w-0 flex flex-col gap-0.5">
          <SelectorEstado etiqueta="Estado de almacén" valor={esperandoCantidad.has(l.id) ? 'PARCIALMENTE RECIBIDO' : estadoAlmacenDe(l)} estados={ESTADOS_ALMACEN} disabled={!editaAlmacen} onCambio={v => cambiarAlmacen(l, v)} />
          {pagadoIncompleto(l) && <PastillaIncompleto l={l} />}
        </span>
        {celdaRecibido(l)}
        <span className={`text-right tabular-nums px-1.5 ${faltanDe(l) > 0 ? 'font-bold text-red-700' : 'text-slate-400'}`} title="Cantidad necesaria − recibido">{cantidadTxt(faltanDe(l))}</span>
        <FechaCelda etiqueta="Fecha de almacén" valor={l.fecha_almacen} disabled={!editaAlmacen} onCambio={v => cambiarCompra(l, { fecha_almacen: v }, true)} />
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
          {verCostos && <label className={campoChico}>Costo<span className="normal-case text-sm font-normal"><CampoNumero etiqueta="Costo" valor={l.costo} disabled={off} onCambio={n => cambiarLinea(l, { costo: n })} className="text-left!" /></span></label>}
          <label className={campoChico}>Moneda<span className="normal-case text-sm font-normal"><CampoLista etiqueta="Moneda" valor={l.moneda} opciones={MONEDAS} disabled={off} onCambio={v => cambiarLinea(l, { moneda: v })} /></span></label>
        </div>
        {tip && <p className="text-[11px] font-semibold opacity-80">{tip}</p>}
        <div className="flex items-center justify-between gap-2">
          <PastillaPedido l={l} />
          <label className="flex items-center gap-1.5 text-[11px] font-bold">Se compra<span className="w-16"><CampoSeCompra valor={l.se_compra} disabled={off} onCambio={v => cambiarLinea(l, { se_compra: v })} /></span></label>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-black/10 text-[12px]">
          {verCostos && <span>Costo est. <b className="tabular-nums">${dinero(costoEstimado(l))}</b></span>}
          <span className="order-last w-full space-y-2 pt-1">
            {/* COMPRAS */}
            <span className="block rounded-lg border-l-4 border-emerald-600 bg-white/60 p-2 space-y-1.5">
              <span className="block text-[10px] font-extrabold uppercase tracking-wide text-emerald-800">Compras</span>
              <span className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
                <span className="font-bold">OC</span>
                <input aria-label="Orden de compra" value={l.oc} disabled={!editaOc} placeholder="—" onChange={e => cambiarCompra(l, { oc: e.target.value })} className={`${CAMPO_OC} text-[13px]`} />
                <label className="flex items-center gap-1.5 font-bold"><input type="checkbox" checked={l.comprado} disabled={!editaOc} onChange={e => palomear(l, e.target.checked)} aria-label="Compra" className="w-5 h-5 accent-emerald-600" />Check</label>
                <FechaCelda etiqueta="Fecha de compra" valor={l.fecha_compra} disabled={!editaOc} onCambio={v => cambiarCompra(l, { fecha_compra: v }, true)} className="text-[13px] py-1.5 w-[140px]" />
              </span>
            </span>
            {/* FINANZAS */}
            <span className="block rounded-lg border-l-4 border-blue-700 bg-white/60 p-2 space-y-1.5">
              <span className="block text-[10px] font-extrabold uppercase tracking-wide text-blue-800">Finanzas</span>
              <span className="grid grid-cols-[1fr_auto] items-center gap-2">
                <SelectorEstado etiqueta="Estado de pago" valor={estadoPagoDe(l)} estados={ESTADOS_PAGO} disabled={!editaPago} onCambio={v => cambiarPago(l, v)} />
                <FechaCelda etiqueta="Fecha del estado de pago" valor={l.fecha_estado_pago} disabled={!editaPago} onCambio={v => cambiarCompra(l, { fecha_estado_pago: v }, true)} className="text-[13px] py-1.5 w-[140px]" />
              </span>
            </span>
            {/* ALMACÉN */}
            <span className="block rounded-lg border-l-4 border-amber-600 bg-white/60 p-2 space-y-1.5">
              <span className="block text-[10px] font-extrabold uppercase tracking-wide text-amber-800">Almacén</span>
              <SelectorEstado etiqueta="Estado de almacén" valor={esperandoCantidad.has(l.id) ? 'PARCIALMENTE RECIBIDO' : estadoAlmacenDe(l)} estados={ESTADOS_ALMACEN} disabled={!editaAlmacen} onCambio={v => cambiarAlmacen(l, v)} />
              {pagadoIncompleto(l) && <PastillaIncompleto l={l} />}
              <span className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
                <span className="font-bold text-[11px]">Recibido</span>
                {celdaRecibido(l, 'text-[13px] py-1.5')}
                <span className="font-bold text-[11px]">Faltan</span>
                <span className={`tabular-nums text-[13px] ${faltanDe(l) > 0 ? 'font-bold text-red-700' : 'text-slate-500'}`}>{cantidadTxt(faltanDe(l))}{l.unidad ? ` ${l.unidad}` : ''}</span>
                <span className="font-bold text-[11px]">Fecha</span>
                <FechaCelda etiqueta="Fecha de almacén" valor={l.fecha_almacen} disabled={!editaAlmacen} onCambio={v => cambiarCompra(l, { fecha_almacen: v }, true)} className="text-[13px] py-1.5 w-[140px]" />
              </span>
            </span>
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
    <div key={`q-${l.id}`} title={`Quitado en ${etiquetaRev(vista.numero)}`} className={`${COLS} items-center gap-1 px-2 py-1.5 border-b border-red-200 bg-red-50 text-[12.5px] text-red-700`}>
      <span className={`px-1.5 font-mono line-through bg-red-50 ${STICKY_CLAVE}`}>{l.clave}</span>
      <span className={`px-1.5 line-through line-clamp-2 bg-red-50 ${STICKY_DESC}`}>{l.descripcion}</span>
      <span className="px-1.5">{l.unidad}</span>
      <span className="px-1.5">{l.clasificacion}</span>
      <span className="px-1.5">{l.moneda}</span>
      {verCostos && <span className="px-1.5 text-right tabular-nums">{dinero(l.costo)}</span>}
      <span className="px-1.5 text-right tabular-nums line-through">{cantidadTxt(l.cantidad)}</span>
      <span className={`px-1.5 text-right text-[10px] font-bold uppercase ${verCostos ? 'col-span-13' : 'col-span-12'}`}>Quitado</span>
    </div>
  );

  return (
    <section className={`${TARJETA} relative`} {...eventosArrastre}>
      {inputOculto}
      {inputOcultoPdf}

      {/* Capa al arrastrar un archivo encima */}
      {arrastrando && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-emerald-950/80 backdrop-blur-sm border-2 border-dashed border-emerald-400 rounded-[inherit] pointer-events-none">
          <Upload className="w-12 h-12 text-emerald-300" />
          <p className="text-lg font-bold text-white text-center px-4">Suelta aquí</p>
          <p className="text-xs text-emerald-100/80 text-center px-4 max-w-md">
            {soloCompras || !puedeImportar && !esAdminHoja ? 'PDF de órdenes de compra → su folio va a la columna OC' : <>{puedeImportar ? `Excel → se importa como ${ultima?.estado === 'borrador' ? etiquetaRev(ultima.numero) : etiquetaRev((ultima?.numero ?? -1) + 1)}` : 'Excel: la explosión no admite otro archivo ahora'} · PDF de órdenes de compra → su folio va a la columna OC</>}
          </p>
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
        <div className="relative flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-0.5 text-[11px] font-semibold" role="group" aria-label="Nombre del archivo">
            {(['pedido', 'sucursal'] as const).map(op => (
              <button key={op} type="button" onClick={() => setNombrarPor(op)} aria-pressed={nombrarPor === op} className={`px-2.5 py-1.5 rounded-lg transition-all ${nombrarPor === op ? 'bg-white/[0.12] text-white' : 'text-white/45 hover:text-white/75'}`}>
                {op === 'pedido' ? 'Por pedido' : 'Por sucursal'}
              </button>
            ))}
          </div>
          {/* Descargar la revisión que se ve: Excel (formato SULA) o PDF */}
          <div className="inline-flex rounded-xl overflow-hidden shadow-sm" role="group" aria-label={`Descargar ${etiquetaRev(vista.numero)}`}>
            <button type="button" onClick={() => void descargar('xlsx')} title="Descargar en Excel (formato SULA)" className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold">
              <Download className="w-4 h-4" /> Excel {etiquetaRev(vista.numero)}
            </button>
            <button type="button" onClick={() => void descargar('pdf')} title="Descargar en PDF" className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-600/90 hover:bg-red-500 text-white text-xs font-semibold border-l border-white/20">
              <FileText className="w-4 h-4" /> PDF
            </button>
          </div>
          {!soloCompras && permExcel && estado !== 'completado' && ultima && (esAdminHoja || !bloqueado) && (
            <div ref={menuRef}>
              <button type="button" disabled={importando || trabajando} onClick={() => setMenuExcel(v => !v)} aria-haspopup="menu" aria-expanded={menuExcel} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/75 text-xs font-semibold border border-white/10 disabled:opacity-50">
                {importando || trabajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Excel <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {menuExcel && (
                <div role="menu" className="absolute left-0 right-0 sm:left-auto sm:w-80 top-full mt-2 z-30 rounded-2xl border border-white/15 bg-[#0d111a] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9)] p-1.5 text-left">
                  {!bloqueado && (<>
                    <button type="button" role="menuitem" onClick={() => elegirArchivo('siguiente')} className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.07]">
                      <Upload className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-white">Subir como nueva revisión</span>
                        <span className="block text-[11px] text-white/45">{ultima.estado === 'borrador' ? `Reemplaza el borrador ${etiquetaRev(ultima.numero)}` : `Entra como ${etiquetaRev(ultima.numero + 1)}`}</span></span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => elegirArchivo('reemplazar')} className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.07]">
                      <Replace className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-white">Reemplazar {etiquetaRev(ultima.numero)} con otro Excel</span>
                        <span className="block text-[11px] text-white/45">Me equivoqué de archivo: se cambia y conserva el número</span></span>
                    </button>
                    <div className="my-1 h-px bg-white/10" />
                  </>)}
                  {esAdminHoja && (<>
                  <button type="button" role="menuitem" onClick={() => { setMenuExcel(false); void quitarRevisiones('eliminar_ultima'); }} className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-red-500/10">
                    <Trash2 className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-red-200">Eliminar {etiquetaRev(ultima.numero)}</span>
                      <span className="block text-[11px] text-white/45">{ordenadas.length > 1 ? `Regresa a ${etiquetaRev(ordenadas[ordenadas.length - 2].numero)}` : 'La hoja queda vacía'}</span></span>
                  </button>
                  {ordenadas.length > 1 && (
                    <button type="button" role="menuitem" onClick={() => { setMenuExcel(false); void quitarRevisiones('vaciar'); }} className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-red-500/10">
                      <Eraser className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-red-200">Vaciar la hoja</span>
                        <span className="block text-[11px] text-white/45">Borra todas las revisiones y empiezas de cero</span></span>
                    </button>
                  )}
                  </>)}
                </div>
              )}
            </div>
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
                <FechaCelda etiqueta="Fecha" valor={enc.fecha || null} disabled={!puedeEscribir} onCambio={v => cambiarEncabezado('fecha', v ?? '')} className="w-auto text-[11px]" />
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
          <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] text-slate-600">
            <span><b className="text-slate-900">{conContenido.length}</b> materiales</span>
            <span title="Materiales con folio de orden de compra">Con OC <b className="text-slate-900">{conOc}</b></span>
            <span title="Casilla Compra palomeada">Comprados <b className="text-emerald-700">{compradas}/{conContenido.length}</b></span>
            <span title="Casilla Almacén palomeada">En almacén <b className="text-sky-700">{enAlmacen}/{conContenido.length}</b></span>
            {verCostos && <span>Costo estimado <b className="text-slate-900 tabular-nums">${dinero(totalCosto)}</b></span>}
          </div>
          {conContenido.length > 0 && (
            <div className="w-full flex items-center gap-x-4 gap-y-1 flex-wrap text-[11.5px] text-slate-700">
              <span><b className="text-blue-800">Finanzas:</b> Pagadas <b className="text-emerald-700">{estadosResumen.pagadas}</b> · Parciales <b className="text-amber-700">{estadosResumen.pagoParcial}</b> · Pendientes <b className="text-red-700">{estadosResumen.pagoPendiente}</b></span>
              <span><b className="text-amber-800">Almacén:</b> Recibidas <b className="text-emerald-700">{estadosResumen.recibidas}</b> · Parciales <b className="text-amber-700">{estadosResumen.recibidoParcial}</b> · Por recibir <b className="text-red-700">{estadosResumen.porRecibir}</b>{estadosResumen.pagadoIncompleto > 0 && <> · <b className="text-red-700">⚠ Pagado incompleto {estadosResumen.pagadoIncompleto}</b></>}</span>
            </div>
          )}
          {pedidosResumen.seCompran + pedidosResumen.noSeCompran > 0 && (
            <div className="flex items-center gap-3 flex-wrap text-[12px] text-slate-700">
              <span><b className="text-emerald-700">Pedidos {pedidosResumen.pedidos} de {pedidosResumen.seCompran}</b> · Faltan <b className="text-amber-700">{pedidosResumen.faltan}</b>{pedidosResumen.noSeCompran > 0 && <> · No se compran <b className="text-slate-500">{pedidosResumen.noSeCompran}</b></>}</span>
              <span className="flex-1 min-w-[120px] max-w-xs h-2 rounded-full bg-slate-200 overflow-hidden" role="progressbar" aria-label="Materiales pedidos" aria-valuemin={0} aria-valuemax={pedidosResumen.seCompran} aria-valuenow={pedidosResumen.pedidos}>
                <span className="block h-full bg-emerald-500 transition-all" style={{ width: `${pedidosResumen.seCompran ? Math.round((pedidosResumen.pedidos / pedidosResumen.seCompran) * 100) : 0}%` }} />
              </span>
            </div>
          )}
        </div>

        {/* Herramientas: buscar, filtrar por clasificación, partidas */}
        <div className="px-3 sm:px-6 py-2.5 flex items-center gap-2 flex-wrap border-b border-slate-300">
          <label className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar clave o descripción…" aria-label="Buscar material" className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white border border-slate-300 text-[12px] focus:outline-none focus:border-sky-600" />
          </label>
          <div className="flex items-center gap-1 overflow-x-auto max-w-full">
            {['todas', ...clasificacionesUsadas].map(c => (
              <button key={c} type="button" onClick={() => setFiltroClasif(c)} aria-pressed={normalizar(filtroEfectivo) === normalizar(c)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all ${normalizar(filtroEfectivo) === normalizar(c) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'}`}>
                {c !== 'todas' && <span className="w-2.5 h-2.5 rounded-full border border-black/15" style={{ backgroundColor: colorClasificacion(c) }} />}
                {c === 'todas' ? 'Todas' : c}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 overflow-x-auto max-w-full" role="group" aria-label="Filtrar por estado de compra, pago o almacén">
            {([
              ['falta', 'Falta pedir', 'border-amber-500 bg-amber-100 text-amber-900', pedidosResumen.faltan],
              ['pedidos', 'Pedidos', 'border-emerald-600 bg-emerald-100 text-emerald-900', pedidosResumen.pedidos],
              ['pend_pago', 'Pendiente de pago', 'border-red-500 bg-red-100 text-red-900', estadosResumen.pagoPendiente],
              ['por_recibir', 'Por recibir', 'border-red-500 bg-red-100 text-red-900', estadosResumen.porRecibir + estadosResumen.recibidoParcial],
              ['parciales', 'Parciales', 'border-amber-500 bg-amber-100 text-amber-900', conContenido.filter(l => estadoPagoDe(l) === 'PARCIALMENTE PAGADO' || estadoAlmacenDe(l) === 'PARCIALMENTE RECIBIDO').length],
              ['pagado_incompleto', '⚠ Pagado incompleto', 'border-red-600 bg-red-100 text-red-900', estadosResumen.pagadoIncompleto],
            ] as const).map(([v, txt, activo, n]) => (
              <button key={v} type="button" onClick={() => setFiltroPedido(f => (f === v ? 'todos' : v))} aria-pressed={filtroPedido === v}
                className={`shrink-0 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all ${filtroPedido === v ? activo : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'}`}>
                {txt} <span className="opacity-60">{n}</span>
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

        {/* ═══ Órdenes de compra: pagado / por pagar ═══ */}
        {esUltima && verCostos && (
          <div className="px-3 sm:px-6 py-3 border-b border-slate-300 bg-emerald-50/50 space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-600"><ShoppingCart className="w-3.5 h-3.5" /> Órdenes de compra</span>
              {ordenes.length === 0 && <span className="text-[11px] text-slate-500">{permOc ? 'Arrastra aquí los PDF o súbelos con el botón.' : 'Todavía no hay órdenes de compra.'}</span>}
              {permOc && <button type="button" disabled={subiendoOc} onClick={() => inputPdf.current?.click()} className="ml-auto shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-600 bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-500 disabled:opacity-50">
                {subiendoOc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Subir OC (PDF)
              </button>}
            </div>

            {/* Totales */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { t: 'Total en OC', v: totalOcs, c: 'text-slate-900', d: `${ordenes.length} orden(es)` },
                { t: 'Pagado', v: pagadoOcs, c: 'text-emerald-700', d: totalOcs ? `${Math.round((pagadoOcs / totalOcs) * 100)}% del total` : '—' },
                { t: 'Por pagar', v: porPagar, c: porPagar > 0 ? 'text-red-600' : 'text-slate-500', d: porPagar > 0 ? `${ordenes.filter(o => (Number(o.total) || 0) - (Number(o.monto_pagado) || 0) > 0.009).length} OC con saldo` : 'Todo pagado' },
                { t: 'Falta por comprar', v: faltaComprar, c: 'text-amber-700', d: `${conContenido.length - conOc} material(es) sin OC · estimado` },
              ].map(k => (
                <div key={k.t} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{k.t}</p>
                  <p className={`text-[15px] sm:text-base font-extrabold tabular-nums ${k.c}`}>${dinero(k.v)}</p>
                  <p className="text-[10px] text-slate-500">{k.d}</p>
                </div>
              ))}
            </div>

            {/* Cada OC: total, pagado, saldo, fecha de pago */}
            {ordenes.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-200 overflow-hidden">
                {ordenes.map(o => {
                  const total = Number(o.total) || 0;
                  const pagado = Number(o.monto_pagado) || 0;
                  const saldo = Math.max(0, total - pagado);
                  const enHoja = o.partidas.filter(p => p.encontrada).length;
                  const pagada = total > 0 && saldo < 0.01;
                  const partidasOc = conContenido.filter(l => tieneFolio(l.oc, o.folio)).length;
                  return (
                    <div key={o.id} className="px-3 py-2 grid gap-2 md:grid-cols-[minmax(0,1.4fr)_auto_auto_auto_auto_auto] md:items-center text-[12px]">
                      {permPagos && partidasOc > 0 && (
                        <div className="md:col-span-6 md:order-last flex items-center gap-1.5 flex-wrap text-[11px] text-slate-600">
                          <span>Marcar sus {partidasOc} partida{partidasOc === 1 ? '' : 's'} como →</span>
                          {(['PARCIALMENTE PAGADO', 'PAGADO'] as const).map(e => (
                            <button key={e} type="button" disabled={subiendoOc} onClick={() => void marcarPartidasOc(o, e, partidasOc)}
                              style={{ backgroundColor: COLOR_ESTADO[e].fondo, color: COLOR_ESTADO[e].texto, borderColor: `${COLOR_ESTADO[e].texto}55` }}
                              className="px-2 py-0.5 rounded-md border font-bold disabled:opacity-50">
                              {e === 'PAGADO' ? 'Pagado' : 'Parcialmente pagado'}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="min-w-0 flex items-center gap-2" title={`${o.archivo_nombre ?? ''}${o.referencia ? ` · Ref. ${o.referencia}` : ''}${o.subido_por ? ` · subió ${o.subido_por}` : ''}`}>
                        <FileText className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <b className="font-mono shrink-0">OC {o.folio}</b>
                        <span className="truncate text-slate-500">{o.proveedor || '—'}{o.fecha ? ` · ${o.fecha}` : ''}</span>
                        <span className={`shrink-0 font-semibold ${enHoja === o.partidas.length ? 'text-emerald-700' : 'text-amber-700'}`} title="Partidas de la OC encontradas en la hoja">{enHoja}/{o.partidas.length}</span>
                      </div>
                      <span className="tabular-nums text-slate-700">Total <b>{total ? `$${dinero(total)}` : '—'}</b></span>
                      <label className="flex items-center gap-1 text-slate-600">Pagado $
                        <input key={`${o.id}-${pagado}`} type="text" inputMode="decimal" defaultValue={pagado ? String(pagado) : ''} placeholder="0" aria-label={`Pagado de la OC ${o.folio}`} disabled={!permPagos}
                          onBlur={e => { const n = Number(e.target.value.replace(/[^\d.]/g, '')) || 0; if (n !== pagado) void pagarOrden(o, { monto_pagado: n }); }}
                          className="w-24 px-1.5 py-1 rounded-md border border-slate-300 text-right tabular-nums focus:border-sky-600 focus:outline-none disabled:bg-transparent disabled:border-transparent" />
                      </label>
                      <span className={`tabular-nums font-bold ${saldo > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{total ? (saldo > 0 ? `Por pagar $${dinero(saldo)}` : 'Pagada') : 'Sin total en PDF'}</span>
                      <label className="flex items-center gap-1.5 text-slate-600">
                        <input type="checkbox" checked={pagada} disabled={!total || !permPagos} onChange={e => void pagarOrden(o, { pagada: e.target.checked })} aria-label={`OC ${o.folio} pagada`} className="w-4 h-4 accent-emerald-600" />
                        <FechaCelda etiqueta={`Fecha de pago de la OC ${o.folio}`} valor={o.fecha_pago ?? null} disabled={!permPagos} onCambio={v => void pagarOrden(o, { fecha_pago: v })} className="w-[110px]" />
                      </label>
                      {permOc ? <button type="button" disabled={subiendoOc} onClick={() => void quitarOrden(o)} aria-label={`Quitar OC ${o.folio}`} className="justify-self-end p-1 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"><X className="w-3.5 h-3.5" /></button> : <span />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

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
          <div className={verCostos ? 'min-w-[2330px]' : 'min-w-[2130px]'}>
            {/* Grupos como en la plantilla de SULA */}
            <div className={`${COLS} gap-1 px-2 pt-2 text-[10px] font-extrabold uppercase tracking-[0.15em] bg-white`}>
              {/* Clave + Descripción fijas (tapan las barras de grupo al desplazar) */}
              <span className={`col-span-2 self-stretch bg-white ${STICKY_CLAVE}`} />
              <span className={totalColsAntesCompras === 10 ? 'col-span-8' : 'col-span-6'} />
              <span className="col-span-3 rounded-t-md bg-emerald-700 text-white text-center py-1">Compras</span>
              <span className="col-span-2 rounded-t-md bg-blue-700 text-white text-center py-1">Finanzas</span>
              <span className="col-span-4 rounded-t-md bg-amber-700 text-white text-center py-1">Almacén</span>
              <span />
            </div>
            <div className={`${COLS} gap-1 px-2 py-2 text-[10.5px] font-extrabold uppercase tracking-wide text-slate-700 border-b-[3px] border-double border-slate-800 bg-white sticky top-0`}>
              <span className={`px-1.5 bg-white ${STICKY_CLAVE}`}>Clave</span>
              <span className={`px-1.5 bg-white ${STICKY_DESC}`}>Descripción</span>
              <span className="px-1.5">Unidad</span>
              <span className="px-1.5">Clasificación</span>
              <span className="px-1.5">Moneda</span>
              {verCostos && <span className="px-1.5 text-right">Costo</span>}
              <span className="px-1.5 text-right">Cant. necesaria</span>
              {verCostos && <span className="px-1.5 text-right">Costo estimado</span>}
              <span className="px-1.5" title="Pedido = tiene OC · Comprado · En almacén">Estado</span>
              <span className="px-1.5 text-center" title="Columna SE COMPRA O NO del Excel">Se compra</span>
              <span className="px-1.5 text-center" title="Folio de la orden de compra">Orden de compra</span>
              <span className="px-1.5 text-center">Fecha</span>
              <span className="px-1.5 text-center" title="Comprado">Check</span>
              <span className="px-1.5 text-center">Finanzas</span>
              <span className="px-1.5 text-center">Fecha</span>
              <span className="px-1.5 text-center">Almacén</span>
              <span className="px-1.5 text-center" title="Cuánto ha llegado (de la cantidad necesaria)">Recibido</span>
              <span className="px-1.5 text-center" title="Cantidad necesaria − recibido">Faltan</span>
              <span className="px-1.5 text-center">Fecha</span>
              <span />
            </div>

            {grupos.map(g => {
              const abierta = !cerradas.has(g.unidad);
              return (
                <div key={g.unidad}>
                  <button type="button" onClick={() => setCerradas(prev => { const n = new Set(prev); if (n.has(g.unidad)) n.delete(g.unidad); else n.add(g.unidad); return n; })}
                    aria-expanded={abierta} className="w-full flex items-center px-3 py-1.5 bg-slate-200/70 border-b border-slate-300 text-[12px] font-extrabold text-slate-800 hover:bg-slate-200">
                    {/* El nombre de la sección se queda a la vista al desplazar la tabla */}
                    <span className="sticky left-3 inline-flex items-center gap-2">
                      {abierta ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      {g.unidad}
                      <span className="font-semibold text-slate-500">· {g.lineas.length}</span>
                    </span>
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
                  <div className={`${COLS} gap-1 px-2 py-1.5 border-b-2 border-slate-400 text-[12px] font-extrabold bg-white`}>
                    {/* "Totales Kilo: 670.35" en las columnas fijas (Clave + Descripción): se ve siempre */}
                    <span className={`col-span-2 px-1.5 bg-white ${STICKY_CLAVE}`}>Totales {g.unidad}: <span className="tabular-nums">{cantidadTxt(g.totalCantidad)}</span></span>
                    <span className={verCostos ? 'col-span-4' : 'col-span-3'} />
                    <span className="text-right tabular-nums px-1.5">{cantidadTxt(g.totalCantidad)}</span>
                    {verCostos && <span className="text-right tabular-nums px-1.5">{dinero(g.totalCosto)}</span>}
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
                {verCostos && <span className="tabular-nums">${dinero(g.totalCosto)}</span>}
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
