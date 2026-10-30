'use client';

/**
 * Catálogo de planos — /admin/catalogo
 * ────────────────────────────────────
 * Se escribe el código del plano y aparecen los PDF de la carpeta PLANOS de Google Drive
 * (/api/catalogo, leídos directo de Drive: no hay que sincronizar nada). Al abrir uno:
 *   - el PDF real (/api/ver-plano)
 *   - la Matriz de Corte: con el despiece guardado si la clave ya se analizó (sin IA);
 *     si no, se analiza el plano una vez (/api/analizar-plano) y se guarda para la próxima
 *   - arrastrar el PDF nuevo cuando el plano cambió: reemplaza el de Drive
 *     (/api/catalogo/actualizar-plano), vuelve a sacar el despiece y baja su Matriz
 *
 * La búsqueda (?q=) y el plano abierto (?plano=) van en la URL: el botón "atrás" del
 * navegador cierra el visor en vez de salir del Catálogo, y al volver de otra página
 * (ej. "Ver / editar despiece") el plano sigue abierto.
 *
 * RUTA: src/app/admin/catalogo/page.tsx
 */

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle, CheckCircle2, Download, ExternalLink, Eye, FileText, Folder, Library, Loader2,
  RefreshCw, Search, Sparkles, Upload, X,
} from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useDatos } from '@/lib/cache-datos';
import { registrarEnHistorial } from '@/lib/historial-cliente';
import type { PlanoCatalogo } from '@/app/api/catalogo/route';
import type { PlantillaBOM } from '@/lib/types';

const TARJETA = 'rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]';
const MAX_BYTES = 4.4 * 1024 * 1024;
/** Sin búsqueda se muestran los más recientes; con búsqueda, todos los que coinciden */
const SIN_BUSQUEDA = 30;

const errorDe = async (res: Response) => (await res.json().catch(() => null))?.error || `Error ${res.status}`;

interface Catalogo { planos: PlanoCatalogo[]; correo: string | null }

class ErrorDrive extends Error {
  constructor(mensaje: string, readonly correo: string | null) { super(mensaje); }
}

const cargarCatalogo = async (refrescar = false): Promise<Catalogo> => {
  const res = await fetch(`/api/catalogo${refrescar ? '?refrescar=1' : ''}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ErrorDrive(json?.error || `Error ${res.status}`, json?.correo ?? null);
  return json as Catalogo;
};

/** Sin espacios, guiones ni mayúsculas: "2-1-0072 0003" y "2-1-0072-0003" encuentran lo mismo */
const normal = (t: string) => t.toLowerCase().replace(/[\s_-]+/g, '');

/* ── Matriz de Corte e IA (las usa el visor) ── */

async function bomGuardado(clave: string): Promise<PlantillaBOM | null> {
  const res = await fetch(`/api/plantilla-despiece?clave=${encodeURIComponent(clave)}`);
  const json = await res.json().catch(() => null);
  return res.ok ? (json?.plantilla?.bom ?? null) : null;
}

/** Analiza el PDF con IA y guarda el despiece de la clave (como versión nueva si ya había uno) */
async function analizarPlano(archivo: File, clave: string, forzar: boolean): Promise<PlantillaBOM> {
  const form = new FormData();
  form.append('plano', archivo);
  form.append('clave', clave);
  form.append('descripcion', '');
  form.append('versionar', 'true');
  if (forzar) form.append('force', 'true');
  const res = await fetch('/api/analizar-plano', { method: 'POST', body: form });
  if (!res.ok) throw new Error(await errorDe(res));
  const r = await res.json();
  if (r.source !== 'cache') registrarEnHistorial({ tipo: 'plano_analizado', referenciaId: clave, referenciaTipo: 'plano', detalle: { clave, archivo: archivo.name, origen: 'catalogo' } });
  return r.bom as PlantillaBOM;
}

async function descargarMatriz(bom: PlantillaBOM, plano: PlanoCatalogo) {
  const res = await fetch('/api/matriz-corte-plano', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bom,
      clave: plano.clave,
      descripcion: plano.despiece?.descripcion || bom.descripcion || '',
      cantidad: 1,
      cliente: plano.despiece?.linea || bom.linea || plano.carpeta.split('/')[0] || '',
      proyecto: '',
      fecha: new Date().toLocaleDateString('es-MX'),
    }),
  });
  if (!res.ok) throw new Error(await errorDe(res));
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || `MATRIZ_DE_CORTE_${plano.clave}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  registrarEnHistorial({ tipo: 'despiece_generado', referenciaId: plano.clave ?? undefined, referenciaTipo: 'plano', detalle: { clave: plano.clave, origen: 'catalogo' } });
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PÁGINA
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/** useSearchParams necesita un Suspense alrededor */
export default function CatalogoPage() {
  return (
    <Suspense fallback={null}>
      <Catalogo />
    </Suspense>
  );
}

/** La URL actual con un parámetro cambiado (null = quitarlo) */
function urlCon(nombre: string, valor: string | null) {
  const params = new URLSearchParams(window.location.search);
  if (valor) params.set(nombre, valor);
  else params.delete(nombre);
  const texto = params.toString();
  return `${window.location.pathname}${texto ? `?${texto}` : ''}`;
}

function Catalogo() {
  const { datos, actualizando, error, recargar } = useDatos('catalogo-drive', () => cargarCatalogo());
  const searchParams = useSearchParams();
  const [refrescando, setRefrescando] = useState(false);
  const [errorRefresco, setErrorRefresco] = useState<ErrorDrive | null>(null);
  const [busqueda, setBusqueda] = useState(() => searchParams.get('q') ?? '');
  const busquedaDebounced = useDebounce(busqueda, 200).trim();
  const termino = normal(busquedaDebounced);
  /** true si el visor se abrió en esta visita (hay una entrada del historial que regresar) */
  const abrioAqui = useRef(false);

  const planos = useMemo(() => datos?.planos ?? [], [datos]);
  // El plano abierto sale de la URL: "atrás" lo cierra solo
  const abiertoId = searchParams.get('plano');
  const abierto = useMemo(() => (abiertoId ? planos.find(p => p.id === abiertoId) ?? null : null), [planos, abiertoId]);

  // La búsqueda se guarda en la URL sin llenar el historial (una entrada por tecla no sirve de nada)
  useEffect(() => {
    const nueva = urlCon('q', busquedaDebounced || null);
    if (nueva !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', nueva);
  }, [busquedaDebounced]);

  const abrir = (p: PlanoCatalogo) => {
    abrioAqui.current = true;
    window.history.pushState(null, '', urlCon('plano', p.id));
  };
  const cerrar = () => {
    if (abrioAqui.current) {
      abrioAqui.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, '', urlCon('plano', null));
    }
  };
  const coincidencias = useMemo(() => {
    if (!termino) return [...planos].sort((a, b) => b.modificado.localeCompare(a.modificado));
    return planos
      .filter(p => [p.clave, p.nombre, p.carpeta, p.despiece?.descripcion].some(t => t && normal(t).includes(termino)))
      // Primero el de la clave exacta, luego por nombre
      .sort((a, b) => Number(normal(b.clave ?? '') === termino) - Number(normal(a.clave ?? '') === termino) || a.nombre.localeCompare(b.nombre, 'es'));
  }, [planos, termino]);
  const visibles = termino ? coincidencias : coincidencias.slice(0, SIN_BUSQUEDA);

  /** Vuelve a leer la carpeta del Drive (para ver planos recién subidos) */
  const refrescar = async () => {
    setRefrescando(true);
    setErrorRefresco(null);
    try {
      await cargarCatalogo(true);
      await recargar();
    } catch (err) {
      setErrorRefresco(err instanceof ErrorDrive ? err : new ErrorDrive('No se pudo leer el Drive.', null));
    } finally {
      setRefrescando(false);
    }
  };

  const fallo = errorRefresco?.message || error;
  const correo = errorRefresco?.correo || datos?.correo;

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-2 sm:px-0 pb-8">
      {/* ═══ HEADER + BUSCADOR ═══ */}
      <div className={`${TARJETA} px-5 py-6 sm:p-8 lg:pl-16 space-y-5`}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400 flex-shrink-0 max-sm:hidden">
            <Library className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-wide leading-tight">Catálogo</h1>
            <p className="text-xs sm:text-sm text-white/55 mt-1">Escribe el código del plano para verlo y bajar su Matriz de Corte</p>
          </div>
          <button
            type="button"
            onClick={() => void refrescar()}
            disabled={refrescando}
            title="Volver a leer la carpeta PLANOS de Drive"
            className="min-h-[44px] px-3 sm:px-4 rounded-xl bg-white/[0.06] border border-white/15 text-white/70 hover:text-white hover:bg-white/10 text-xs font-semibold inline-flex items-center gap-2 transition-all flex-shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${refrescando ? 'animate-spin' : ''}`} /> <span className="max-sm:hidden">Actualizar</span>
          </button>
        </div>

        <div className="flex items-center gap-3 bg-black/25 border border-white/15 focus-within:border-cyan-400/60 rounded-2xl px-4 transition-colors">
          <Search className="w-5 h-5 text-white/40 flex-shrink-0" />
          <input
            type="search"
            autoFocus
            placeholder="Código del plano, ej. 2-1-0072-0003"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="min-h-[56px] bg-transparent text-base sm:text-lg font-mono text-white outline-none w-full min-w-0 placeholder:text-white/30 placeholder:font-sans"
          />
          {busqueda && (
            <button type="button" onClick={() => setBusqueda('')} aria-label="Borrar búsqueda" className="p-2 -mr-2">
              <X className="w-4 h-4 text-white/40 hover:text-white" />
            </button>
          )}
        </div>
        {datos && (
          <p className="text-[11px] text-white/40">
            {termino
              ? `${coincidencias.length} plano${coincidencias.length === 1 ? '' : 's'} encontrado${coincidencias.length === 1 ? '' : 's'}`
              : `${planos.length} planos en Drive · se muestran los ${Math.min(SIN_BUSQUEDA, planos.length)} más recientes`}
          </p>
        )}
      </div>

      {/* ═══ ERROR DE CONEXIÓN CON DRIVE ═══ */}
      {fallo && (
        <div role="alert" className="rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 space-y-1.5">
          <p className="text-sm font-bold text-red-300 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> No se pudo leer el Drive</p>
          <p className="text-xs text-red-200/80">{fallo}</p>
          {correo && <p className="text-xs text-white/50">La carpeta PLANOS debe estar compartida con <span className="font-mono text-white/70">{correo}</span>.</p>}
        </div>
      )}

      {/* ═══ RESULTADOS ═══ */}
      {!datos ? (
        actualizando && !fallo && (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-white/50">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-400" /> Leyendo la carpeta PLANOS de Drive...
          </div>
        )
      ) : visibles.length === 0 ? (
        <div className={`${TARJETA} p-12 text-center`}>
          <Search className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/55">{termino ? 'No hay planos con ese código en Drive' : 'La carpeta PLANOS está vacía'}</p>
          {termino && <p className="text-white/30 text-sm mt-1">Revisa el código, o toca &quot;Actualizar&quot; si lo acaban de subir</p>}
        </div>
      ) : (
        <div className={`${TARJETA} overflow-hidden divide-y divide-white/10`}>
          {visibles.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => abrir(p)}
              className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3.5 text-left hover:bg-white/[0.05] transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center text-cyan-400 flex-shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-cyan-300 font-bold text-sm">{p.clave || 'Sin clave'}</span>
                  {p.despiece ? (
                    <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-lg">Matriz lista</span>
                  ) : (
                    <span className="text-[10px] font-bold text-white/45 bg-white/[0.06] border border-white/10 px-2 py-0.5 rounded-lg">Sin analizar</span>
                  )}
                </div>
                <p className="text-sm text-white/80 truncate">{p.despiece?.descripcion || p.nombre}</p>
                <p className="text-[11px] text-white/35 truncate flex items-center gap-1"><Folder className="w-3 h-3 flex-shrink-0" /> {p.carpeta || 'PLANOS'} · {p.nombre}</p>
              </div>
              <Eye className="w-4 h-4 text-white/30 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {abierto && <VisorCatalogo key={abierto.id} plano={abierto} onCerrar={cerrar} onCambio={() => void recargar()} />}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   VISOR DE UN PLANO
   Se dibuja directo en <body>: dentro del panel del admin (con desenfoque) un "fixed"
   quedaría atrapado detrás del menú lateral.
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type Paso = null | 'matriz' | 'analizando' | 'subiendo';

function VisorCatalogo({ plano, onCerrar, onCambio }: { plano: PlanoCatalogo; onCerrar: () => void; onCambio: () => void }) {
  const [version, setVersion] = useState(0); // sube al reemplazar el PDF: el visor pide el nuevo
  const url = `/api/ver-plano?fileId=${encodeURIComponent(plano.id)}${version ? `&v=${version}` : ''}`;
  const [cargandoPdf, setCargandoPdf] = useState(true);
  const [conVisor] = useState(() => typeof navigator === 'undefined' || navigator.pdfViewerEnabled !== false);
  const [paso, setPaso] = useState<Paso>(null);
  /** El análisis en curso viene de arrastrar un PDF nuevo (no del botón de la Matriz) */
  const [desdeArrastre, setDesdeArrastre] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [tieneDespiece, setTieneDespiece] = useState(!!plano.despiece);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ocupado = paso !== null;

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !ocupado) onCerrar(); };
    window.addEventListener('keydown', tecla);
    const scroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', tecla); document.body.style.overflow = scroll; };
  }, [onCerrar, ocupado]);

  /** Matriz con el despiece guardado; si no hay, analiza el PDF de Drive una vez */
  const matriz = async () => {
    if (!plano.clave) return;
    setMensaje(null);
    setDesdeArrastre(false);
    try {
      setPaso('matriz');
      let bom = await bomGuardado(plano.clave);
      if (!bom) {
        if (!window.confirm(`El plano ${plano.clave} todavía no tiene despiece. Se va a analizar con IA (~$0.02–0.05 USD, 1 a 3 minutos) y queda guardado para la próxima. ¿Continuar?`)) return;
        setPaso('analizando');
        const pdf = await fetch(`/api/ver-plano?fileId=${encodeURIComponent(plano.id)}&download=1`);
        if (!pdf.ok || !pdf.headers.get('Content-Type')?.includes('pdf')) throw new Error('No se pudo bajar el PDF de Drive.');
        const archivo = new File([await pdf.blob()], plano.nombre, { type: 'application/pdf' });
        if (archivo.size > MAX_BYTES) throw new Error('El PDF pesa más de 4.4 MB: no se puede analizar aquí.');
        bom = await analizarPlano(archivo, plano.clave, false);
        setTieneDespiece(true);
        onCambio();
      }
      await descargarMatriz(bom, plano);
      setMensaje({ ok: true, texto: 'Matriz de Corte descargada.' });
    } catch (err) {
      setMensaje({ ok: false, texto: err instanceof Error ? err.message : 'No se pudo generar la Matriz de Corte.' });
    } finally {
      setPaso(null);
    }
  };

  /** PDF nuevo: reemplaza el de Drive, saca el despiece nuevo y baja su Matriz */
  const actualizar = async (archivo: File) => {
    if (!plano.clave) return setMensaje({ ok: false, texto: 'Este PDF no trae la clave en su nombre: no se puede ligar a un despiece.' });
    if (!/\.pdf$/i.test(archivo.name) && archivo.type !== 'application/pdf') return setMensaje({ ok: false, texto: 'Solo se aceptan archivos PDF.' });
    if (archivo.size > MAX_BYTES) return setMensaje({ ok: false, texto: `"${archivo.name}" pesa más de 4.4 MB; redúcelo antes de subirlo.` });
    if (!window.confirm(`¿Reemplazar en Drive el plano ${plano.clave} por "${archivo.name}"?\n\nSe vuelve a sacar su despiece con IA y se descarga la Matriz de Corte nueva. Drive guarda la versión anterior.`)) return;

    setMensaje(null);
    setDesdeArrastre(true);
    try {
      setPaso('subiendo');
      const form = new FormData();
      form.append('fileId', plano.id);
      form.append('archivo', archivo);
      const res = await fetch('/api/catalogo/actualizar-plano', { method: 'POST', body: form });
      if (!res.ok) throw new Error(await errorDe(res));
      setCargandoPdf(true);
      setVersion(v => v + 1);

      setPaso('analizando');
      const bom = await analizarPlano(archivo, plano.clave, true);
      setTieneDespiece(true);
      onCambio();
      await descargarMatriz(bom, plano);
      setMensaje({ ok: true, texto: 'Plano actualizado en Drive, despiece nuevo guardado y Matriz de Corte descargada.' });
    } catch (err) {
      setMensaje({ ok: false, texto: err instanceof Error ? err.message : 'No se pudo actualizar el plano.' });
    } finally {
      setPaso(null);
    }
  };

  const boton = 'min-h-[44px] px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all disabled:opacity-50';
  const textoPaso = paso === 'subiendo' ? 'Subiendo a Drive...' : paso === 'analizando' ? 'Analizando el plano (1 a 3 min)...' : 'Generando la Matriz...';
  const enArrastre = ocupado && desdeArrastre;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col" role="dialog" aria-modal="true" aria-label={`Plano ${plano.clave ?? plano.nombre}`}>
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={() => { if (!ocupado) onCerrar(); }} />

      <div className="relative z-10 flex h-full flex-col">
        {/* Barra superior */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#0b0f17]/95 px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-bold text-cyan-300">{plano.clave || 'Sin clave'}</p>
            <p className="truncate text-[11px] text-white/50">{plano.despiece?.descripcion || plano.nombre}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <a href={`${url}&download=1`} className="min-h-[44px] sm:min-h-[36px] px-3 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white/80 border border-white/15 text-xs font-semibold inline-flex items-center gap-1.5" aria-label="Descargar PDF">
              <Download className="h-4 w-4" /> <span className="max-sm:hidden">PDF</span>
            </a>
            <button type="button" onClick={onCerrar} disabled={ocupado} aria-label="Cerrar" className="min-h-[44px] sm:min-h-[36px] w-11 sm:w-9 rounded-lg bg-white/[0.08] hover:bg-red-500/20 hover:text-red-300 text-white/80 border border-white/15 inline-flex items-center justify-center disabled:opacity-40">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
          {/* PDF */}
          <div className="relative flex-1 min-h-[45vh] bg-neutral-900">
            {conVisor ? (
              <>
                <iframe key={url} src={url} title={`Plano ${plano.clave}`} className="h-full w-full border-0" onLoad={() => setCargandoPdf(false)} />
                {cargandoPdf && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-900/85">
                    <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
                    <p className="text-sm text-white/60">Trayendo el plano de Drive…</p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
                <FileText className="h-10 w-10 text-cyan-400" />
                <p className="max-w-xs text-sm text-white/70">Este navegador no muestra PDF dentro de la página.</p>
                <a href={url} target="_blank" rel="noopener" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-cyan-600 px-5 text-sm font-bold text-white hover:bg-cyan-500">
                  <ExternalLink className="h-4 w-4" /> Abrir el PDF
                </a>
              </div>
            )}
          </div>

          {/* Acciones */}
          <aside className="lg:w-[340px] flex-shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 bg-[#0b0f17]/95 p-4 space-y-4 overflow-y-auto">
            <div className="space-y-2">
              <button type="button" onClick={() => void matriz()} disabled={ocupado || !plano.clave} className={`${boton} w-full bg-emerald-600 hover:bg-emerald-500 text-white`}>
                {ocupado && !desdeArrastre ? <Loader2 className="w-4 h-4 animate-spin" /> : tieneDespiece ? <Download className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                {tieneDespiece ? 'Descargar Matriz de Corte' : 'Analizar y bajar Matriz'}
              </button>
              {ocupado && !desdeArrastre && <p className="text-xs text-white/55 text-center">{textoPaso}</p>}
              {tieneDespiece && plano.clave && (
                <Link href={`/admin/despiece/plano?clave=${encodeURIComponent(plano.clave)}`} className={`${boton} w-full bg-white/[0.06] border border-white/15 text-white/75 hover:bg-white/[0.1] hover:text-white`}>
                  <Eye className="w-4 h-4" /> Ver / editar despiece
                </Link>
              )}
              {!plano.clave && <p className="text-[11px] text-amber-300/80">El nombre de este PDF no trae la clave (ej. 2-1-0072-0003): no se puede sacar su despiece.</p>}
            </div>

            <div className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/45">¿Cambió el plano?</h3>
              <div
                role="button"
                tabIndex={0}
                aria-disabled={ocupado}
                onDragOver={e => { e.preventDefault(); if (!ocupado) setArrastrando(true); }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={e => { e.preventDefault(); setArrastrando(false); const f = e.dataTransfer.files[0]; if (f && !ocupado) void actualizar(f); }}
                onClick={() => { if (!ocupado) inputRef.current?.click(); }}
                onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !ocupado) { e.preventDefault(); inputRef.current?.click(); } }}
                className={`flex flex-col items-center justify-center gap-1.5 py-7 px-4 border-2 border-dashed rounded-xl text-center transition-all ${
                  arrastrando ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/15 hover:border-white/25 bg-white/[0.02] hover:bg-white/[0.04]'
                } ${ocupado ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
              >
                <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void actualizar(f); e.target.value = ''; }} />
                {enArrastre ? (
                  <><Loader2 className="w-7 h-7 animate-spin text-cyan-400" /><p className="text-sm text-white/60">{textoPaso}</p></>
                ) : (
                  <>
                    <Upload className="w-7 h-7 text-white/30" />
                    <p className="text-sm text-white/60">Arrastra aquí el PDF nuevo</p>
                    <p className="text-[11px] text-white/35">o toca para elegirlo · máx. 4.4 MB</p>
                  </>
                )}
              </div>
              <p className="text-[11px] text-white/35 leading-relaxed">Reemplaza el PDF en Drive, vuelve a sacar el despiece y te baja la Matriz de Corte nueva.</p>
            </div>

            {mensaje && (
              <p role="status" className={`text-sm font-semibold ${mensaje.ok ? 'text-emerald-400' : 'text-red-300'}`}>
                {mensaje.ok ? <CheckCircle2 className="inline w-4 h-4 mr-1.5 -mt-0.5" /> : <AlertCircle className="inline w-4 h-4 mr-1.5 -mt-0.5" />}
                {mensaje.texto}
              </p>
            )}
          </aside>
        </div>
      </div>
    </div>,
    document.body
  );
}
