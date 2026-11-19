'use client';

/**
 * Subir archivos — panel del ÁREA DE MADERA — /madera/subir
 * ─────────────────────────────────────────────────────
 * Dos columnas (en celular, una):
 *   · Izquierda "Pedidos": buscador y tarjetas de los pedidos (fija al bajar, con su propio scroll).
 *     En celular se ve el pedido elegido y la lista completa abre como hoja desde abajo.
 *   · Derecha: tarjeta del pedido elegido (título, REV, botones Excel/PDF de la revisión que se ve
 *     y la franja para soltar archivos) y debajo su explosión de materiales completa.
 * El pedido elegido se guarda en la URL (?pedido=ID) para que no se pierda al recargar.
 *
 * No hace falta elegir pedido: el Excel y la OC se mandan SIN explosion_id y la API toma el pedido
 * del archivo (PEDIDO del encabezado o REFERENCIA de la OC; si no trae, el elegido). Si el pedido no
 * está dado de alta, queda como "SIN ALTA" y se liga solo al darlo de alta; una OC sin Excel queda
 * en espera y se aplica sola al subirlo (src/lib/explosion-pedido.ts). Al terminar se elige solo
 * el pedido del archivo.
 *
 * Archivos (se pueden soltar en cualquier parte de la columna derecha):
 *   · Excel (.xlsx) → explosión de materiales: POST /api/bom/revisiones/importar (siguiente REV-xx;
 *                     si el pedido estaba pendiente, la API inicia la explosión).
 *   · PDF  (.pdf)   → orden de compra: POST /api/bom/revisiones/compras (folios en la columna OC,
 *                     subtotal, IVA y total) o, si su pedido no tiene Excel todavía, en espera.
 * La explosión completa (todos los materiales y sus REV-xx, en vivo) se ve con la MISMA hoja del
 * administrador (src/app/admin/bom/[id]/HojaExplosion.tsx, plantilla de SULA) en modo compras y con
 * completa=1; madera captura ahí OC, compra, pagos y almacén. ExplosionCompleta.tsx ya no se usa aquí.
 * La lista sale de GET /api/bom?sin_explosion=1: los pedidos activos, también los que todavía no
 * tienen explosión (para subirles el primer Excel).
 *
 * RUTA: src/app/madera/subir/page.tsx
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, Download, FileText, Loader2, Search, Trees, X } from 'lucide-react';
import { ESTATUS_BOM, estatusBom } from '@/lib/bom-tiempo';
import { etiquetaRev } from '@/lib/explosion-revisiones';
import { HojaExplosion } from '@/app/admin/bom/[id]/HojaExplosion';
import { motivosSinResolver } from '@/lib/bom-motivos';

interface VistaRev { id: string; numero: number; estado: 'borrador' | 'cerrada' }

/** Madera no inicia explosiones desde la hoja: el Excel se sube en la franja de arriba */
const nuncaIniciar = async () => false;
const sinResumen = () => {};

interface Pedido {
  id: string;
  estado: 'pendiente' | 'en_proceso' | 'completado';
  fecha_inicio: string | null;
  fecha_termino: string | null;
  duracion_seg: number;
  acumulado_seg: number | null;
  tramo_inicio: string | null;
  checklist: unknown;
  proyecto: { codigo: string; nombre: string; sucursal: string | null } | null;
  revision: { numero: number; estado?: 'borrador' | 'cerrada'; lineas: number } | null;
  ordenes?: { cantidad: number };
  /** Pedido que todavía no está en Proyectos (explosión con proyecto_id NULL) */
  sin_alta?: boolean;
}

interface OcEspera { id: string; folio: string; pedido_numero: string | null; proveedor: string | null; total: number | null }

/** ok = verde, aviso = ámbar (se guardó pero hay que saber algo), error = rojo */
interface Resultado { tipo: 'ok' | 'aviso' | 'error'; texto: string }

const COLOR_RESULTADO = {
  ok: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
  aviso: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
  error: 'border-red-400/25 bg-red-500/10 text-red-200',
};

/** Número de pedido sin prefijo ni ceros: "PED-0002" → "2" */
const numeroPedido = (t: string | null | undefined) => String(t ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
type Tipo = 'excel' | 'pdf';

const TARJETA = 'rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const dinero = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sucursalDe = (p: Pedido) => p.proyecto?.sucursal || p.proyecto?.nombre || '';

/** fetch que nunca truena: devuelve el status y el JSON (o el error de conexión) */
async function enviar(url: string, init: RequestInit): Promise<{ status: number; datos: Record<string, unknown> }> {
  try {
    const res = await fetch(url, init);
    return { status: res.status, datos: await res.json().catch(() => ({})) };
  } catch {
    return { status: 0, datos: { error: 'No hay conexión con el servidor.' } };
  }
}

/** Qué tipos de archivo trae lo que se está arrastrando (por MIME; el nombre no se ve hasta soltar) */
function tiposArrastrados(e: React.DragEvent): Set<Tipo> {
  const tipos = new Set<Tipo>();
  for (const item of Array.from(e.dataTransfer.items)) {
    if (item.kind !== 'file') continue;
    if (item.type === 'application/pdf') tipos.add('pdf');
    else if (item.type === MIME_XLSX || item.type.includes('spreadsheet') || item.type.includes('excel')) tipos.add('excel');
  }
  return tipos;
}

/** Tarjeta de un pedido de la lista: código + REV + estatus / sucursal */
function TarjetaPedido({ p, activo, onClick }: { p: Pedido; activo: boolean; onClick: () => void }) {
  const conf = p.sin_alta ? { txt: 'SIN ALTA', css: 'bg-white/10 text-white/70 border-white/20' } : ESTATUS_BOM[estatusBom(p)];
  return (
    <button type="button" onClick={onClick} aria-pressed={activo}
      className={`w-full text-left px-3.5 py-2.5 rounded-xl border transition-colors ${activo ? 'border-amber-600 bg-amber-600/15' : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.07]'}`}>
      <span className="flex items-center gap-2">
        <span className="font-bold text-white text-sm">{p.proyecto?.codigo ?? '—'}</span>
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {p.revision && <span className="font-mono text-[10.5px] text-white/45">{etiquetaRev(p.revision.numero)}</span>}
          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border whitespace-nowrap ${conf.css}`}>{conf.txt}</span>
        </span>
      </span>
      {p.sin_alta
        ? <span className="block text-xs text-white/45 truncate mt-0.5">Todavía no está en Proyectos</span>
        : sucursalDe(p) && <span className="block text-xs text-white/55 truncate mt-0.5">{sucursalDe(p)}</span>}
    </button>
  );
}

export default function MaderaSubir() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorLista, setErrorLista] = useState('');
  const [elegido, setElegido] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [hojaAbierta, setHojaAbierta] = useState(false);
  // Arrastre sobre la columna derecha: null = no se arrastra; el set dice qué tipos trae
  const [arrastre, setArrastre] = useState<Set<Tipo> | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [vista, setVista] = useState<VistaRev | null>(null);
  const [enEspera, setEnEspera] = useState<OcEspera[]>([]);
  const [verEspera, setVerEspera] = useState(false);
  const [avisosLista, setAvisosLista] = useState<string[]>([]);
  const inputExcel = useRef<HTMLInputElement>(null);
  const inputPdf = useRef<HTMLInputElement>(null);
  const profundidad = useRef(0);
  // La hoja de explosión (HojaExplosion) avisa sus errores en la lista de resultados
  const guardarHoja = useRef<(() => Promise<void>) | null>(null);
  const avisoHoja = useCallback((texto: string) => setResultados(prev => [...prev, { tipo: 'error', texto }]), []);

  const cargar = useCallback(async () => {
    const [lista, espera] = await Promise.all([
      enviar('/api/bom?sin_explosion=1', { cache: 'no-store' }),
      enviar('/api/bom/revisiones/compras?en_espera=1', { cache: 'no-store' }),
    ]);
    if (lista.status === 200) {
      setPedidos((lista.datos.explosiones as Pedido[]) ?? []);
      setAvisosLista((lista.datos.avisos as string[] | undefined) ?? []);
      setErrorLista('');
    } else setErrorLista('No se pudieron cargar los pedidos.');
    if (espera.status === 200) setEnEspera((espera.datos.ordenes as OcEspera[]) ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    // El pedido de la URL (?pedido=ID) se lee después de montar, para no romper la hidratación
    const primera = setTimeout(() => {
      const id = new URLSearchParams(window.location.search).get('pedido');
      if (id) setElegido(id);
      void cargar();
    }, 0);
    return () => clearTimeout(primera);
  }, [cargar]);

  const elegir = (id: string, conservarResultados = false) => {
    setElegido(id);
    if (!conservarResultados) setResultados([]);
    setVista(null);
    setHojaAbierta(false);
    const url = new URL(window.location.href);
    url.searchParams.set('pedido', id);
    window.history.replaceState(null, '', url);
  };

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return pedidos;
    return pedidos.filter(p => `${p.proyecto?.codigo ?? ''} ${p.proyecto?.nombre ?? ''} ${p.proyecto?.sucursal ?? ''}`.toLowerCase().includes(q));
  }, [pedidos, busqueda]);

  const pedido = pedidos.find(p => p.id === elegido) ?? null;

  /** Si había un pedido elegido y el archivo es de otro, se avisa en ámbar */
  const otroPedido = (pedidoArchivo: string): Resultado | null => {
    const elegidoNum = numeroPedido(pedido?.proyecto?.codigo);
    if (!pedido || !pedidoArchivo || numeroPedido(pedidoArchivo) === elegidoNum) return null;
    return { tipo: 'aviso', texto: `El archivo es del pedido ${pedidoArchivo}, no del ${pedido.proyecto?.codigo}: se guardó en el ${pedidoArchivo}.` };
  };

  /** Excel → nueva revisión. El pedido sale del encabezado del Excel (o del elegido) */
  const subirExcel = async (archivo: File): Promise<{ resultados: Resultado[]; explosionId?: string }> => {
    const form = new FormData();
    form.append('archivo', archivo);
    form.append('modo', 'siguiente');
    if (pedido?.proyecto?.codigo) form.append('pedido_elegido', pedido.proyecto.codigo);
    const r = await enviar('/api/bom/revisiones/importar', { method: 'POST', body: form });
    if (r.status !== 200) return { resultados: [{ tipo: 'error', texto: `${archivo.name}: ${String(r.datos.error ?? 'no se pudo importar el Excel.')}` }] };
    const rev = r.datos.revision as { numero: number } | undefined;
    const numero = String(r.datos.pedido ?? '');
    const avisos = (r.datos.avisos as string[] | undefined) ?? [];
    const aplicadas = Number(r.datos.oc_aplicadas ?? 0);
    const salida: Resultado[] = [{
      tipo: 'ok',
      texto: `Pedido ${numero}${r.datos.sin_alta ? ' (sin alta)' : ''}: se importaron ${String(r.datos.lineas ?? 0)} materiales como ${rev ? etiquetaRev(rev.numero) : 'nueva revisión'}.${aplicadas ? ` Se aplicaron ${aplicadas} orden(es) de compra que estaban en espera.` : ''}`,
    }];
    const otro = otroPedido(numero);
    if (otro) salida.push(otro);
    for (const a of avisos) salida.push({ tipo: 'aviso', texto: a });
    return { resultados: salida, explosionId: r.datos.explosion_id as string | undefined };
  };

  /** PDF → orden de compra. El pedido sale de la REFERENCIA (o del elegido); sin Excel queda en espera */
  const subirPdf = async (archivo: File): Promise<{ resultados: Resultado[]; explosionId?: string }> => {
    const form = new FormData();
    form.append('archivo', archivo);
    if (pedido?.proyecto?.codigo) form.append('pedido_elegido', pedido.proyecto.codigo);
    const r = await enviar('/api/bom/revisiones/compras', { method: 'POST', body: form });
    if (r.status !== 200) return { resultados: [{ tipo: 'error', texto: String(r.datos.error ?? `${archivo.name}: no se pudo leer.`) }] };
    const avisos = ((r.datos.avisos as string[] | undefined) ?? []).map(a => ({ tipo: 'aviso' as const, texto: a }));
    if (r.datos.tipo === 'oc_espera') {
      const numero = String(r.datos.pedido ?? '');
      const texto = r.datos.ya_estaba
        ? `La OC ${String(r.datos.folio)} ya estaba en espera del Excel del pedido ${numero}.`
        : `OC ${String(r.datos.folio)} guardada en espera: se aplica sola cuando subas el Excel del pedido ${numero}.`;
      return { resultados: [{ tipo: 'aviso', texto }, ...(otroPedido(numero) ? [otroPedido(numero)!] : []), ...avisos] };
    }
    const o = r.datos.orden as { folio: string; proveedor: string | null; referencia: string | null; partidas: unknown[]; total: number | null; monto_pagado: number | null };
    const fuera = (r.datos.no_encontradas as { clave: string; descripcion: string }[] | undefined) ?? [];
    const pedidosOc = o.partidas.length - fuera.length;
    const total = Number(o.total) || 0;
    const porPagar = Math.max(0, total - (Number(o.monto_pagado) || 0));
    const salida: Resultado[] = [{
      tipo: 'ok',
      texto: `OC ${o.folio}${o.proveedor ? ` (${o.proveedor})` : ''}: ${pedidosOc} material${pedidosOc === 1 ? ' quedó' : 'es quedaron'} como PEDIDO${fuera.length ? `; ${fuera.length} clave${fuera.length === 1 ? ' no está' : 's no están'} en la explosión` : ''}${total ? ` · total $${dinero(total)} · ${porPagar ? `por pagar $${dinero(porPagar)}` : 'pagada'}` : ''}.`,
    }];
    // Claves de la OC que no están en la explosión: aviso, no error
    for (const p of fuera) salida.push({ tipo: 'aviso', texto: `La OC ${o.folio} trae ${p.clave} (${p.descripcion.slice(0, 60)}), que no está en la explosión.` });
    const otro = otroPedido(numeroPedido(o.referencia));
    if (otro) salida.push(otro);
    return { resultados: [...salida, ...avisos], explosionId: r.datos.explosion_id as string | undefined };
  };

  const subir = async (lista: File[]) => {
    if (!lista.length || subiendo) return;
    const excels = lista.filter(f => /\.xlsx$/i.test(f.name));
    const pdfs = lista.filter(f => /\.pdf$/i.test(f.name));
    const otros = lista.filter(f => !excels.includes(f) && !pdfs.includes(f));
    setSubiendo(true);
    setResultados([]);
    const salida: Resultado[] = otros.map(f => ({ tipo: 'error' as const, texto: `${f.name}: solo se aceptan Excel (.xlsx) o PDF.` }));
    let ultimoPedido: string | undefined;
    try {
      // Primero la explosión (las OC necesitan los materiales) y después las órdenes de compra
      for (const f of excels) { const r = await subirExcel(f); salida.push(...r.resultados); ultimoPedido = r.explosionId ?? ultimoPedido; }
      for (const f of pdfs) { const r = await subirPdf(f); salida.push(...r.resultados); ultimoPedido = r.explosionId ?? ultimoPedido; }
    } finally {
      await cargar();
      // Se elige solo el pedido del archivo para ver su hoja
      if (ultimoPedido && ultimoPedido !== elegido) elegir(ultimoPedido, true);
      setResultados(salida);
      setSubiendo(false);
    }
  };

  /** Descarga la revisión que se ve en la explosión completa, en Excel o PDF */
  const descargar = (formato: 'xlsx' | 'pdf') => {
    if (!pedido || !vista) return;
    const a = document.createElement('a');
    a.href = `/api/bom/revisiones/excel?explosion_id=${encodeURIComponent(pedido.id)}&revision_id=${encodeURIComponent(vista.id)}&completa=1${formato === 'pdf' ? '&formato=pdf' : ''}`;
    a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  };

  /* ── Arrastre: se puede soltar en cualquier parte de la columna derecha ── */
  const arrastreHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      profundidad.current++;
      setArrastre(tiposArrastrados(e));
    },
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); },
    onDragLeave: () => { profundidad.current = Math.max(0, profundidad.current - 1); if (!profundidad.current) setArrastre(null); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      profundidad.current = 0;
      setArrastre(null);
      void subir(Array.from(e.dataTransfer.files));
    },
  };

  const listaPedidos = (
    <>
      <label className="relative block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35" />
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar pedido o sucursal…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-black/30 border border-white/10 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-amber-400/60" />
      </label>
      {cargando ? (
        <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>
      ) : errorLista ? (
        <p className="flex items-center gap-2 text-sm text-red-300"><AlertCircle className="w-4 h-4" /> {errorLista}</p>
      ) : filtrados.length === 0 ? (
        <p className="text-sm text-white/45 py-3 text-center">No hay pedidos.</p>
      ) : (
        <div className="space-y-1.5">
          {filtrados.map(p => <TarjetaPedido key={p.id} p={p} activo={p.id === elegido} onClick={() => elegir(p.id)} />)}
        </div>
      )}
      {avisosLista.map(a => (
        <p key={a} className="flex items-start gap-1.5 text-[11px] text-amber-300"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {a}</p>
      ))}
      {enEspera.length > 0 && (
        <div className="text-[11px]">
          <button type="button" onClick={() => setVerEspera(v => !v)} aria-expanded={verEspera} className="text-amber-300/90 hover:text-amber-200 underline-offset-2 hover:underline">
            {enEspera.length} orden(es) de compra en espera del Excel
          </button>
          {verEspera && (
            <ul className="mt-1.5 space-y-1 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
              {enEspera.map(o => (
                <li key={o.id} className="flex items-center gap-2 text-white/65">
                  <span className="font-mono text-white/85">OC {o.folio}</span>
                  <span>· pedido {o.pedido_numero ?? '—'}</span>
                  <span className="ml-auto tabular-nums">{o.total != null ? `$${dinero(Number(o.total))}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );

  /** Una mitad de la franja de archivos */
  const mitad = (tipo: Tipo) => {
    const excel = tipo === 'excel';
    const resaltada = !!arrastre && (arrastre.size === 0 || arrastre.has(tipo));
    return (
      <button type="button" onClick={() => (excel ? inputExcel : inputPdf).current?.click()} disabled={subiendo}
        className={`flex items-center gap-3 px-4 rounded-2xl border-2 border-dashed text-left transition-all duration-200 disabled:opacity-60 ${arrastre ? 'min-h-[140px]' : 'min-h-[80px]'} ${resaltada
          ? (excel ? 'border-emerald-400 bg-emerald-500/15' : 'border-red-400 bg-red-500/15')
          : 'border-amber-200/25 bg-black/20 hover:border-amber-300/50'}`}>
        <span className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center font-mono text-[12px] font-bold border ${excel ? 'bg-emerald-500/10 border-emerald-400/25 text-emerald-300' : 'bg-red-500/10 border-red-400/25 text-red-300'}`}>
          {subiendo ? <Loader2 className="w-5 h-5 animate-spin" /> : excel ? 'XLS' : 'PDF'}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">{excel ? 'Excel → explosión' : 'PDF → orden de compra'}</span>
          <span className="block text-xs text-white/50">{subiendo ? 'Subiendo…' : 'Arrastra aquí o da clic'}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.18em] text-amber-300/90 uppercase"><Trees className="w-3.5 h-3.5" /> Área de madera</p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">Subir archivos</h1>
        <p className="text-sm text-white/50 mt-1">Elige el pedido y arrastra el Excel de la explosión o el PDF de la orden de compra.</p>
      </div>

      <div className="grid gap-5 items-start md:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* ═══ Pedidos: columna en escritorio ═══ */}
        <section className={`${TARJETA} hidden md:block p-4 sticky top-5`}>
          <h2 className="text-sm font-bold text-white mb-3">Pedidos</h2>
          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto pr-1 space-y-3">{listaPedidos}</div>
        </section>

        {/* ═══ Pedidos: celular (el elegido; la lista abre como hoja desde abajo) ═══ */}
        <section className={`${TARJETA} md:hidden p-3 space-y-2`}>
          <button type="button" onClick={() => setHojaAbierta(true)}
            className="w-full flex items-center gap-2 pl-3 pr-2 py-2.5 rounded-xl bg-black/30 border border-white/10 text-sm text-white/40">
            <Search className="w-4 h-4" /> <span className="flex-1 text-left">Buscar pedido o sucursal…</span> <ChevronDown className="w-4 h-4" />
          </button>
          {pedido
            ? <TarjetaPedido p={pedido} activo onClick={() => setHojaAbierta(true)} />
            : <p className="text-xs text-white/45 text-center py-1">Toca para elegir un pedido.</p>}
        </section>

        {/* ═══ Columna derecha ═══ */}
        <div className="space-y-5 min-w-0" {...arrastreHandlers}>
          <section className={`${TARJETA} p-4 sm:p-5 space-y-4`}>
            {pedido ? (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold text-white">
                    <span className="text-amber-300">{pedido.proyecto?.codigo}</span>
                    {sucursalDe(pedido) && <span className="text-white"> · {sucursalDe(pedido)}</span>}
                  </h2>
                  <p className="text-xs text-white/50 mt-0.5">
                    {vista ? `${etiquetaRev(vista.numero)} ${vista.estado === 'borrador' ? 'en borrador' : 'cerrada'}` : 'Todavía sin explosión de materiales'}
                  </p>
                </div>
                {vista && (
                  <div className="inline-flex rounded-xl overflow-hidden shadow-sm shrink-0" role="group" aria-label={`Descargar ${etiquetaRev(vista.numero)}`}>
                    <button type="button" onClick={() => descargar('xlsx')} title="Descargar en Excel (formato SULA)"
                      className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold">
                      <Download className="w-4 h-4" /> Excel {etiquetaRev(vista.numero)}
                    </button>
                    <button type="button" onClick={() => descargar('pdf')} title="Descargar en PDF"
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-600/90 hover:bg-red-500 text-white text-xs font-semibold border-l border-white/20">
                      <FileText className="w-4 h-4" /> PDF
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-white/55 text-center py-2">Elige un pedido de la lista, o arrastra el archivo: el pedido se toma del Excel o de la OC.</p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {mitad('excel')}
              {mitad('pdf')}
            </div>
            <input ref={inputExcel} type="file" multiple accept={`.xlsx,${MIME_XLSX}`} className="hidden"
              onChange={e => { const l = Array.from(e.target.files ?? []); e.target.value = ''; void subir(l); }} />
            <input ref={inputPdf} type="file" multiple accept=".pdf,application/pdf" className="hidden"
              onChange={e => { const l = Array.from(e.target.files ?? []); e.target.value = ''; void subir(l); }} />

            {resultados.length > 0 && (
              <ul className="space-y-1.5" aria-live="polite">
                {resultados.map((r, i) => (
                  <li key={i} className={`flex items-start gap-2 px-3 py-2 rounded-xl text-sm border ${COLOR_RESULTADO[r.tipo]}`}>
                    {r.tipo === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                    <span>{r.texto}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {pedido && (
            <section className={`${TARJETA} p-4 sm:p-5 space-y-3`}>
              <h2 className="text-sm font-bold text-white">Explosión de materiales <span className="text-amber-300">· {pedido.proyecto?.codigo}</span></h2>
              <HojaExplosion
                key={pedido.id}
                explosionId={pedido.id}
                estado={pedido.estado}
                bloqueado={pedido.estado === 'pendiente' && motivosSinResolver(pedido.checklist).length > 0}
                partidas={[]}
                asegurarIniciada={nuncaIniciar}
                onAviso={avisoHoja}
                onResumen={sinResumen}
                guardarRef={guardarHoja}
                soloCompras
                completa
                onVista={setVista}
              />
            </section>
          )}
        </div>
      </div>

      {/* ═══ Hoja desde abajo con la lista completa (celular) ═══ */}
      {hojaAbierta && (
        <div className="md:hidden fixed inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Elegir pedido">
          <button type="button" aria-label="Cerrar" onClick={() => setHojaAbierta(false)} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative max-h-[85vh] flex flex-col rounded-t-3xl border-t border-amber-200/10 bg-[#140e07] px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-white">Pedidos</h2>
              <button type="button" onClick={() => setHojaAbierta(false)} aria-label="Cerrar" className="p-1.5 rounded-lg text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto space-y-3">{listaPedidos}</div>
          </div>
        </div>
      )}
    </div>
  );
}
