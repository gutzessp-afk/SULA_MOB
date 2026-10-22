'use client';

/**
 * Despiece por plano — /admin/despiece/plano
 * ──────────────────────────────────────────
 * Despiece y Matriz de Corte de un plano SIN pedido:
 *   1. Se sube el PDF con su clave → /api/analizar-plano (versionar=true): si es el
 *      mismo PDF que ya se analizó, usa lo guardado y no gasta IA.
 *   2. El BOM se corrige en pantalla (BomEditable). Las ediciones viven aquí hasta
 *      que se toca "Guardar cambios" (/api/plano-versiones guarda una versión nueva).
 *   3. La Matriz de Corte (Excel o PDF) sale del BOM tal como se ve en pantalla.
 *   4. Si el PDF es una versión nueva del plano, muestra qué cambió; el historial
 *      permite ver los cambios de cada versión y regresar a una anterior.
 *
 * ?clave=0072 abre directo la plantilla guardada de esa clave. El PDF que se suelta en
 * /admin/despiece llega ya elegido (src/lib/plano-pendiente.ts); si su nombre trae una
 * clave completa (2-1-0072-0003) se analiza solo, si no se pide la clave primero.
 *
 * RUTA: src/app/admin/despiece/plano/page.tsx
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronRight, FileSpreadsheet, FileText, History, Loader2, RefreshCw, RotateCcw, Save, ScanSearch, Sparkles, Undo2 } from 'lucide-react';
import { BomEditable } from '@/components/BomEditable';
import { CalidadPlano, EtiquetaCalidad } from '@/components/CalidadPlano';
import { DiferenciasBom } from '@/components/DiferenciasBom';
import { DropZonePlano } from '@/components/DropZonePlano';
import { compararBOMs } from '@/lib/comparar-bom';
import { construirMatriz } from '@/lib/matriz-corte';
import { limpiarPlanoPendiente, verPlanoPendiente } from '@/lib/plano-pendiente';
import type { Diferencia, PlantillaBOM, VersionPlano } from '@/lib/types';

const TARJETA = 'rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]';
const INPUT = 'w-full h-[44px] rounded-xl border border-white/20 bg-white/[0.07] px-3.5 text-sm text-white outline-none focus:border-blue-400/60 placeholder:text-white/30 max-sm:text-base disabled:opacity-50';
const ETIQUETA = 'text-xs font-semibold text-white/60';
const FUENTE: Record<string, string> = { cache: 'Guardado (sin IA)', ia: 'Analizado con IA', pdf: 'Leído del plano', manual: 'Corregido a mano' };

const copiar = (bom: PlantillaBOM): PlantillaBOM => structuredClone(bom);
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
const errorDe = async (res: Response) => (await res.json().catch(() => null))?.error || `Error ${res.status}`;

/** "2-1-0072-0003 VITRINA.pdf" → "2-1-0072-0003"; "plano 0072.pdf" → "0072" */
/** Clave completa de SULA: con ella el análisis puede arrancar sin preguntar */
const CLAVE_COMPLETA = /^\d-\d-\d{4}-\d{3,4}$/;
const claveDelArchivo = (nombre: string) => nombre.match(/\d-\d-\d{4}-\d{3,4}/)?.[0] ?? nombre.match(/(?<!\d)\d{4}(?!\d)/)?.[0] ?? '';

// useSearchParams necesita un Suspense alrededor para que la página pueda prerenderizarse
export default function PlanoSueltoPage() {
  return (
    <Suspense fallback={null}>
      <PlanoSuelto />
    </Suspense>
  );
}

function PlanoSuelto() {
  const claveUrl = useSearchParams().get('clave')?.trim() ?? '';

  // PDF soltado en /admin/despiece: llega elegido y con la clave sacada de su nombre
  const [pendiente] = useState(() => (claveUrl ? null : verPlanoPendiente()));

  // Datos del formulario
  const [clave, setClave] = useState(claveUrl || (pendiente ? claveDelArchivo(pendiente.name) : ''));
  const [descripcion, setDescripcion] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [cliente, setCliente] = useState('');
  const [proyecto, setProyecto] = useState('');
  const [archivo, setArchivo] = useState<File | null>(pendiente);

  // Resultado
  const [bom, setBom] = useState<PlantillaBOM | null>(null);              // como está guardado
  const [bomEditado, setBomEditado] = useState<PlantillaBOM | null>(null); // lo que se ve en pantalla
  const [fuente, setFuente] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [actualizacion, setActualizacion] = useState<{ version: number; diferencias: Diferencia[] } | null>(null);
  const [huellaDesconocida, setHuellaDesconocida] = useState(false);
  const [advertencias, setAdvertencias] = useState<string[]>([]);

  // UI
  const [cargandoClave, setCargandoClave] = useState(!!claveUrl);
  const [analizando, setAnalizando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [generando, setGenerando] = useState<'excel' | 'pdf' | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cambios = useMemo(() => (bom && bomEditado ? compararBOMs(bom, bomEditado) : []), [bom, bomEditado]);
  const hayCambios = !!bom && !!bomEditado && JSON.stringify(bom) !== JSON.stringify(bomEditado);
  const ocupado = analizando || guardando || cargandoClave;
  const productos = Math.max(1, Math.round(Number(cantidad) || 1));

  const mostrar = useCallback((nuevo: PlantillaBOM, origen: string, numero: number | null) => {
    setBom(nuevo);
    setBomEditado(copiar(nuevo));
    setFuente(origen);
    setVersion(numero);
    setDescripcion(d => d || nuevo.descripcion || '');
    setCliente(c => c || nuevo.linea || '');
  }, []);

  // ?clave=… abre la plantilla guardada
  useEffect(() => {
    if (!claveUrl) return;
    let vigente = true;
    fetch(`/api/plantilla-despiece?clave=${encodeURIComponent(claveUrl)}`)
      .then(async res => {
        if (!res.ok) throw new Error(await errorDe(res));
        const { plantilla } = await res.json();
        if (!vigente) return;
        setDescripcion(plantilla.descripcion || '');
        mostrar(plantilla.bom, plantilla.editado_manualmente ? 'manual' : 'cache', plantilla.version_actual ?? null);
      })
      .catch(err => { if (vigente) setError(err instanceof Error ? err.message : 'No se pudo abrir la plantilla.'); })
      .finally(() => { if (vigente) setCargandoClave(false); });
    return () => { vigente = false; };
  }, [claveUrl, mostrar]);

  // El pendiente ya quedó en el estado: se limpia para la próxima visita
  useEffect(() => { limpiarPlanoPendiente(); }, []);

  // Aviso del navegador al salir con cambios sin guardar
  useEffect(() => {
    if (!hayCambios) return;
    const fn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [hayCambios]);

  const elegirArchivo = (file: File | null) => {
    setArchivo(file);
    if (file && !clave.trim()) setClave(claveDelArchivo(file.name));
  };

  const analizar = async (forzar = false) => {
    if (!archivo || !clave.trim()) return;
    if (hayCambios && !window.confirm('Tienes cambios sin guardar en el despiece. Si analizas el plano se pierden. ¿Continuar?')) return;
    setAnalizando(true);
    setError('');
    setAviso('');
    try {
      const form = new FormData();
      form.append('plano', archivo);
      form.append('clave', clave.trim());
      form.append('descripcion', descripcion.trim());
      form.append('versionar', 'true');
      if (forzar) form.append('force', 'true');
      const res = await fetch('/api/analizar-plano', { method: 'POST', body: form });
      if (!res.ok) throw new Error(await errorDe(res));
      const r = await res.json();
      mostrar(r.bom, r.source, r.version ?? null);
      setAdvertencias(r.advertencias ?? []);
      setHuellaDesconocida(!!r.huellaDesconocida);
      setActualizacion(r.diferencias?.length ? { version: r.version, diferencias: r.diferencias } : null);
      if (r.source === 'cache' && !r.huellaDesconocida) setAviso('Este PDF ya estaba analizado: se usó el despiece guardado, sin gastar IA.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo analizar el plano.');
    } finally {
      setAnalizando(false);
    }
  };

  // Con clave completa en el nombre del PDF, el análisis arranca solo (una vez)
  const analizarRef = useRef<(forzar?: boolean) => Promise<void>>(async () => {});
  useEffect(() => { analizarRef.current = analizar; });
  const [autoAnalizar] = useState(() => !!pendiente && CLAVE_COMPLETA.test(claveDelArchivo(pendiente.name)));
  useEffect(() => {
    if (!autoAnalizar) return;
    const t = setTimeout(() => void analizarRef.current(false), 0);
    return () => clearTimeout(t);
  }, [autoAnalizar]);

  const guardar = async () => {
    if (!bomEditado || !clave.trim()) return;
    setGuardando(true);
    setError('');
    setAviso('');
    try {
      const res = await fetch('/api/plano-versiones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: clave.trim(), bom: bomEditado, descripcion }),
      });
      if (!res.ok) throw new Error(await errorDe(res));
      const r = await res.json();
      setBom(copiar(bomEditado));
      setFuente('manual');
      setVersion(r.version);
      setActualizacion(null);
      setAviso(`Cambios guardados como versión ${r.version}. La próxima vez que se abra la clave ${clave.trim()} se verá así.`);
      setRecargarVersiones(n => n + 1);
    } catch (err) {
      setError('No se pudo guardar: ' + (err instanceof Error ? err.message : 'error desconocido'));
    } finally {
      setGuardando(false);
    }
  };

  const descartar = () => {
    if (bom && window.confirm('¿Descartar todos los cambios sin guardar?')) setBomEditado(copiar(bom));
  };

  /** Matriz de Corte con el BOM que se ve en pantalla (con las ediciones). No usa IA */
  const descargarMatriz = async (formato: 'excel' | 'pdf') => {
    if (!bomEditado) return;
    setGenerando(formato);
    setError('');
    const datos = { clave: clave.trim(), descripcion: descripcion.trim() || bomEditado.descripcion, cantidad: productos, cliente: cliente.trim(), proyecto: proyecto.trim(), fecha: new Date().toLocaleDateString('es-MX') };
    try {
      if (formato === 'pdf') {
        const { descargarMatrizPDF } = await import('@/lib/matriz-corte-pdf');
        await descargarMatrizPDF(construirMatriz(bomEditado, datos));
      } else {
        const res = await fetch('/api/matriz-corte-plano', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bom: bomEditado, ...datos }),
        });
        if (!res.ok) throw new Error(await errorDe(res));
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement('a');
        a.href = url;
        a.download = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || `MATRIZ_DE_CORTE_${datos.clave}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError('No se pudo generar la Matriz de Corte: ' + (err instanceof Error ? err.message : 'error desconocido'));
    } finally {
      setGenerando(null);
    }
  };

  // Historial de versiones
  const [recargarVersiones, setRecargarVersiones] = useState(0);
  const restaurar = (snapshot: PlantillaBOM, numero: number) => {
    setBomEditado(copiar(snapshot));
    setAviso(`Se cargó la versión ${numero} en pantalla. Revísala y toca "Guardar cambios" para dejarla como vigente.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const puedeAnalizar = !!archivo && !!clave.trim() && !ocupado;

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-2 pb-28 sm:space-y-5 sm:px-0">
      {/* Encabezado (el margen en escritorio deja libre el botón que oculta el menú lateral) */}
      <div className={`${TARJETA} relative px-4 py-5 sm:p-6 lg:pl-16`}>
        <Link href="/admin/despiece" className="mb-3 inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-white/55 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Volver al Despiece
        </Link>
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-cyan-500/40 bg-cyan-950/60 text-cyan-400">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold leading-tight text-white sm:text-2xl">
              {bomEditado ? (descripcion || bomEditado.descripcion || 'Plano') : 'Despiece de un plano'}
              {bomEditado && clave && <span className="ml-2 font-mono text-base text-cyan-300 sm:text-lg">({clave})</span>}
            </h1>
            <p className="mt-1 text-[11px] text-white/60 sm:text-xs">
              {bomEditado
                ? [bomEditado.modelo && `Modelo ${bomEditado.modelo}`, bomEditado.ancho_mm && bomEditado.alto_mm && bomEditado.profundidad_mm ? `${bomEditado.ancho_mm} × ${bomEditado.alto_mm} × ${bomEditado.profundidad_mm} mm` : bomEditado.dimensiones, bomEditado.revision].filter(Boolean).join(' · ')
                : 'Sube el PDF de un plano sin pedido para obtener su despiece y su Matriz de Corte.'}
            </p>
            {bomEditado && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                {fuente && <span className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-0.5 text-white/70">{FUENTE[fuente] ?? fuente}</span>}
                {version && <span className="rounded-full border border-cyan-400/30 bg-cyan-500/15 px-2.5 py-0.5 text-cyan-300">Versión {version}</span>}
                <EtiquetaCalidad calidad={bomEditado.calidad} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Plano y datos */}
      <section className={`${TARJETA} space-y-4 p-4 sm:p-6`}>
        <h2 className="text-sm font-bold text-white sm:text-base">{bom ? 'Plano' : '1. Sube el plano'}</h2>
        <DropZonePlano archivo={archivo} onArchivo={elegirArchivo} disabled={ocupado} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <label className="space-y-1.5 sm:col-span-2">
            <span className={ETIQUETA}>Clave *</span>
            <input required value={clave} onChange={e => setClave(e.target.value)} disabled={ocupado || !!bom} className={`${INPUT} font-mono`} placeholder="Ej. 0072" autoCapitalize="characters" />
          </label>
          <label className="space-y-1.5 sm:col-span-3">
            <span className={ETIQUETA}>Descripción</span>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)} disabled={ocupado} className={INPUT} placeholder="Ej. VITRINA PARA REFACCIONES (o la detecta la IA)" />
          </label>
          <label className="space-y-1.5">
            <span className={ETIQUETA}>Cantidad</span>
            <input type="number" min={1} inputMode="numeric" value={cantidad} onChange={e => setCantidad(e.target.value)} className={`${INPUT} text-center`} />
          </label>
          <label className="space-y-1.5 sm:col-span-3">
            <span className={ETIQUETA}>Cliente (para la Matriz)</span>
            <input value={cliente} onChange={e => setCliente(e.target.value)} className={INPUT} placeholder="Opcional" />
          </label>
          <label className="space-y-1.5 sm:col-span-3">
            <span className={ETIQUETA}>Proyecto (para la Matriz)</span>
            <input value={proyecto} onChange={e => setProyecto(e.target.value)} className={INPUT} placeholder="Opcional" />
          </label>
        </div>
        {bom && <p className="text-[11px] text-white/40">La clave queda fija una vez cargado el despiece. Para otro producto, vuelve al Despiece y sube otro plano.</p>}
        <div className="flex flex-col-reverse gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-white/45">Si este PDF ya se analizó antes, se usa lo guardado y no se gasta IA. Analizar uno nuevo cuesta ~$0.02–0.05 USD.</p>
          <button
            type="button"
            onClick={() => analizar(false)}
            disabled={!puedeAnalizar}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {analizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />} Analizar plano
          </button>
        </div>
      </section>

      {/* Mensajes */}
      {analizando && (
        <div className={`${TARJETA} flex items-center gap-3 p-4 sm:p-5`}>
          <Loader2 className="h-6 w-6 flex-shrink-0 animate-spin text-blue-400" />
          <div>
            <p className="text-sm font-semibold text-white">Leyendo el plano…</p>
            <p className="text-xs text-white/55">Con IA tarda alrededor de un minuto (~$0.02–0.05 USD). No cierres esta página.</p>
          </div>
        </div>
      )}
      {cargandoClave && (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-white/55"><Loader2 className="h-4 w-4 animate-spin text-blue-400" /> Abriendo la plantilla {claveUrl}…</p>
      )}
      {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-200"><AlertTriangle className="mt-px h-4 w-4 flex-shrink-0" /> {error}</p>}
      {aviso && <p role="status" className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-xs font-semibold text-emerald-200">{aviso}</p>}

      {huellaDesconocida && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/[0.07] p-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-xs leading-relaxed text-amber-100">
            La clave <b>{clave}</b> ya tenía un despiece guardado, de antes del control de versiones: no se sabe si es este mismo PDF. Abajo está el guardado.
            Si este plano es más nuevo, analízalo para ver qué cambió.
          </p>
          <button type="button" disabled={!puedeAnalizar} onClick={() => analizar(true)} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-40">
            <Sparkles className="h-4 w-4" /> Analizar este PDF con IA
          </button>
        </div>
      )}

      {actualizacion && (
        <DiferenciasBom
          diferencias={actualizacion.diferencias}
          titulo={`Actualización detectada — versión ${actualizacion.version}`}
          subtitulo={`Comparado con la versión ${actualizacion.version - 1}. El despiece de abajo ya es el nuevo; la versión anterior queda en el historial.`}
        />
      )}

      {advertencias.length > 0 && (
        <div className="space-y-1 rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          {advertencias.map((a, i) => <p key={i} className="flex items-start gap-2"><AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" /> {a}</p>)}
        </div>
      )}

      {bomEditado && (
        <>
          <CalidadPlano calidad={bomEditado.calidad} />

          <section className={`${TARJETA} space-y-4 p-3 sm:p-6`}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 sm:px-0">
              <div>
                <h2 className="text-sm font-bold text-white sm:text-base">Despiece</h2>
                <p className="text-[11px] text-white/50">
                  {bomEditado.subensambles.length} subensambles · {bomEditado.subensambles.reduce((n, s) => n + s.componentes.length, 0)} piezas · para {productos} unidad(es).
                  Los cambios no se guardan hasta que toques &quot;Guardar cambios&quot;.
                </p>
              </div>
              {hayCambios && (
                <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-300">
                  {cambios.length || 1} cambio{(cambios.length || 1) === 1 ? '' : 's'} sin guardar
                </span>
              )}
            </div>
            <BomEditable bom={bomEditado} original={bom} cantidad={productos} onChange={setBomEditado} disabled={ocupado} />
          </section>

          {clave.trim() && <HistorialVersiones clave={clave.trim()} actual={version} recargar={recargarVersiones} onRestaurar={restaurar} />}

          {/* Barra de acciones: fija abajo en escritorio (con espacio para MOBI); al final de la página en el celular */}
          <div className="z-20 sm:sticky sm:bottom-3">
            <div className={`${TARJETA} grid grid-cols-2 gap-2 p-3 sm:flex sm:items-center sm:bg-[#0b0f17]/90 sm:pr-28`}>
              <button type="button" onClick={() => descargarMatriz('excel')} disabled={generando !== null} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40">
                {generando === 'excel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Excel
              </button>
              <button type="button" onClick={() => descargarMatriz('pdf')} disabled={generando !== null} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-red-600/90 px-4 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-40">
                {generando === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} PDF
              </button>
              <button
                type="button"
                onClick={() => analizar(true)}
                disabled={!puedeAnalizar}
                title={archivo ? 'Volver a leer el PDF con IA aunque ya esté analizado' : 'Sube el PDF para volver a analizarlo'}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                <RefreshCw className="h-4 w-4" /> Re-analizar
              </button>
              <span className="hidden flex-1 sm:block" />
              {hayCambios && (
                <button type="button" onClick={descartar} disabled={ocupado} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-40">
                  <Undo2 className="h-4 w-4" /> Descartar
                </button>
              )}
              <button type="button" onClick={guardar} disabled={!hayCambios || ocupado} className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-40 max-sm:col-span-2`}>
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar cambios
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Versiones guardadas de la clave: cuándo, de qué PDF, qué cambió y regresar a una */
function HistorialVersiones({ clave, actual, recargar, onRestaurar }: {
  clave: string
  actual: number | null
  recargar: number
  onRestaurar: (bom: PlantillaBOM, version: number) => void
}) {
  const [abierto, setAbierto] = useState(false);
  const [versiones, setVersiones] = useState<VersionPlano[] | null>(null);
  const [error, setError] = useState('');
  const [verCambios, setVerCambios] = useState<number | null>(null);
  const [restaurando, setRestaurando] = useState<number | null>(null);

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    fetch(`/api/plano-versiones?clave=${encodeURIComponent(clave)}`)
      .then(async res => {
        if (!res.ok) throw new Error(await errorDe(res));
        const r = await res.json();
        if (vigente) { setVersiones(r.versiones); setError(''); }
      })
      .catch(err => { if (vigente) setError(err instanceof Error ? err.message : 'No se pudo leer el historial.'); });
    return () => { vigente = false; };
  }, [abierto, clave, recargar]);

  const restaurar = async (v: number) => {
    setRestaurando(v);
    try {
      const res = await fetch(`/api/plano-versiones?clave=${encodeURIComponent(clave)}&version=${v}`);
      if (!res.ok) throw new Error(await errorDe(res));
      const r = await res.json();
      onRestaurar(r.version.bom_snapshot, v);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la versión.');
    } finally {
      setRestaurando(null);
    }
  };

  return (
    <section className={`${TARJETA} overflow-hidden`}>
      <button type="button" onClick={() => setAbierto(a => !a)} aria-expanded={abierto} className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] sm:px-6">
        <History className="h-4 w-4 text-cyan-400" />
        <span className="flex-1 text-sm font-bold text-white">Versiones del plano</span>
        {abierto ? <ChevronDown className="h-4 w-4 text-white/50" /> : <ChevronRight className="h-4 w-4 text-white/50" />}
      </button>
      {abierto && (
        <div className="space-y-2 border-t border-white/10 p-3 sm:p-5">
          {error && <p className="text-xs font-semibold text-red-300">{error}</p>}
          {!versiones && !error && <p className="flex items-center gap-2 text-xs text-white/50"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…</p>}
          {versiones?.length === 0 && <p className="text-xs text-white/50">Aún no hay versiones guardadas de esta clave.</p>}
          {versiones?.map(v => (
            <div key={v.version} className="rounded-xl border border-white/10 bg-white/[0.03]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                <span className="font-mono text-sm font-bold text-cyan-300">v{v.version}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-white/80">
                    {fechaCorta(v.created_at)} · {FUENTE[v.analizado_por] ?? v.analizado_por}
                    {v.version === actual && <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">Vigente</span>}
                  </p>
                  {v.archivo_nombre && <p className="truncate text-[11px] text-white/40">{v.archivo_nombre}</p>}
                </div>
                {v.cambios && (
                  <button type="button" onClick={() => setVerCambios(verCambios === v.version ? null : v.version)} className="min-h-[36px] rounded-lg px-2.5 text-[11px] font-semibold text-white/60 hover:bg-white/10 hover:text-white">
                    {v.cambios.length} cambio{v.cambios.length === 1 ? '' : 's'}
                  </button>
                )}
                {v.version !== actual && (
                  <button type="button" onClick={() => restaurar(v.version)} disabled={restaurando !== null} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/15 px-2.5 text-[11px] font-semibold text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40">
                    {restaurando === v.version ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Restaurar
                  </button>
                )}
              </div>
              {verCambios === v.version && v.cambios && (
                <div className="border-t border-white/10 p-3">
                  <DiferenciasBom diferencias={v.cambios} compacto />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
