'use client';

/**
 * EstatusPedido.tsx
 * ─────────────────
 * Estatus del pedido antes de explosionar (/admin/bom/[id]): el admin marca por qué no se
 * puede explosionar (motivos predefinidos u "Otro" escrito a mano), agrega una descripción
 * y, cuando cada motivo queda resuelto, lo palomea. Sin motivos pendientes se puede iniciar.
 *
 * Las casillas se guardan al momento; los textos 700 ms después de dejar de escribir.
 * Guarda con PATCH /api/bom { accion: 'guardar_estatus' }. "Reporte de problemas" descarga el reporte
 * (PDF imprimible o Excel) de /api/bom/exportar?tipo=estatus.
 *
 * RUTA: src/app/admin/bom/[id]/EstatusPedido.tsx
 */

import { useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, FileSpreadsheet, FileText, Loader2, Plus, X } from 'lucide-react';
import { MOTIVOS_PREDEFINIDOS, type MotivoBloqueo } from '@/lib/bom-motivos';

type MotivoLocal = Pick<MotivoBloqueo, 'id' | 'texto' | 'detalle' | 'resuelto'> & Partial<MotivoBloqueo>;

const TARJETA = 'rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]';

/** id para un motivo escrito a mano (único dentro del pedido) */
const idOtroMotivo = () => `otro-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${d.getDate()} ${meses[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function EstatusPedido({
  motivos: motivosIniciales, notas: notasIniciales, editable, explosionId, onGuardar,
}: {
  explosionId: string;
  motivos: MotivoBloqueo[];
  notas: string;
  /** false = solo lectura (explosión ya iniciada o terminada) */
  editable: boolean;
  onGuardar: (motivos: MotivoLocal[], notas: string) => Promise<boolean>;
}) {
  const [motivos, setMotivos] = useState<MotivoLocal[]>(motivosIniciales);
  const [notas, setNotas] = useState(notasIniciales);
  const [otro, setOtro] = useState('');
  const [guardando, setGuardando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ultimo = useRef({ motivos: motivosIniciales as MotivoLocal[], notas: notasIniciales });

  const guardar = async () => {
    clearTimeout(timer.current);
    setGuardando(true);
    try {
      await onGuardar(ultimo.current.motivos, ultimo.current.notas);
    } finally {
      setGuardando(false);
    }
  };

  /** Aplica el cambio y lo guarda: al momento (casillas) o con espera (textos) */
  const cambiar = (nuevos: MotivoLocal[], nuevasNotas: string, inmediato: boolean) => {
    setMotivos(nuevos);
    setNotas(nuevasNotas);
    ultimo.current = { motivos: nuevos, notas: nuevasNotas };
    clearTimeout(timer.current);
    if (inmediato) void guardar();
    else timer.current = setTimeout(() => void guardar(), 700);
  };

  const urlReporte = (formato: 'pdf' | 'xlsx') => `/api/bom/exportar?id=${encodeURIComponent(explosionId)}&formato=${formato}&tipo=estatus`;

  /** Guarda lo que se esté escribiendo y luego abre/descarga el reporte, para que salga completo */
  const descargarReporte = async (formato: 'pdf' | 'xlsx') => {
    // La pestaña se abre en el clic (si se abre después del guardado, el navegador la bloquea)
    const pestana = formato === 'pdf' ? window.open('', '_blank') : null;
    await guardar();
    if (pestana) pestana.location.assign(urlReporte(formato));
    else window.location.assign(urlReporte(formato));
  };

  const togglePredefinido = (id: string, texto: string) => {
    const existe = motivos.some(m => m.id === id);
    cambiar(existe ? motivos.filter(m => m.id !== id) : [...motivos, { id, texto, detalle: '', resuelto: false }], notas, true);
  };

  const agregarOtro = () => {
    const texto = otro.trim();
    if (!texto) return;
    setOtro('');
    cambiar([...motivos, { id: idOtroMotivo(), texto, detalle: '', resuelto: false }], notas, true);
  };

  // Quién/cuándo lo pone el servidor: se toma de lo último guardado (props) para cada motivo
  const guardados = new Map(motivosIniciales.map(m => [m.id, m]));
  const meta = (m: MotivoLocal) => ({ ...m, ...(guardados.get(m.id) && { reportado_en: guardados.get(m.id)!.reportado_en, reportado_por: guardados.get(m.id)!.reportado_por, resuelto_en: guardados.get(m.id)!.resuelto_en }) });

  const pendientes = motivos.filter(m => !m.resuelto).length;
  const estado = pendientes > 0
    ? { css: 'bg-red-500/15 text-red-300 border-red-400/30', icono: <AlertTriangle className="w-4 h-4" />, txt: `BLOQUEADO · ${pendientes} por resolver` }
    : { css: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30', icono: <CheckCircle2 className="w-4 h-4" />, txt: motivos.length ? 'Motivos resueltos — listo para explosionar' : 'Sin bloqueos — listo para explosionar' };

  return (
    <div className={`${TARJETA} p-5 sm:p-6 space-y-5`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-white">Estatus del pedido</h2>
          <p className="text-xs text-white/50 mt-0.5">
            {editable ? '¿Por qué no se puede explosionar todavía? Marca los motivos y palomea cada uno cuando quede resuelto.' : 'Motivos que se reportaron antes de la explosión.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {guardando && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" aria-label="Guardando" />}
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${estado.css}`}>{estado.icono}{estado.txt}</span>
        </div>
      </div>

      {/* ── Reporte de problemas (descarga) ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-white/45">Reporte de problemas:</span>
        <a
          href={urlReporte('pdf')}
          target="_blank"
          rel="noopener"
          onClick={e => { e.preventDefault(); void descargarReporte('pdf'); }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600/70 hover:bg-red-500 text-white text-xs font-semibold"
        >
          <FileText className="w-3.5 h-3.5" /> PDF
        </a>
        <a
          href={urlReporte('xlsx')}
          onClick={e => { e.preventDefault(); void descargarReporte('xlsx'); }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/80 hover:bg-emerald-500 text-white text-xs font-semibold"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
        </a>
      </div>

      {/* ── Reporte de bloqueo ── */}
      {pendientes > 0 && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/[0.07] p-4" role="alert">
          <p className="text-sm font-bold text-red-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Este pedido no puede explosionarse por los siguientes motivos:
          </p>
          <ol className="mt-2 space-y-2 list-decimal list-inside">
            {motivos.filter(m => !m.resuelto).map(meta).map(m => (
              <li key={m.id} className="text-sm text-white/85">
                <span className="font-semibold">{m.texto}</span>
                {m.detalle && <span className="text-white/65"> — {m.detalle}</span>}
                <span className="block pl-5 text-[11px] text-white/45">
                  {m.reportado_en ? `Reportado el ${fechaCorta(m.reportado_en)}` : 'Reportado ahora'}
                  {m.reportado_por ? ` por ${m.reportado_por}` : ''}
                </span>
              </li>
            ))}
          </ol>
          {notas.trim() && <p className="mt-3 text-xs text-white/65 whitespace-pre-wrap"><span className="font-bold text-white/50">Descripción: </span>{notas}</p>}
        </div>
      )}

      {/* ── Motivos para marcar ── */}
      {editable && (
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-white/40">No puedo explosionar porque…</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {MOTIVOS_PREDEFINIDOS.map(m => {
              const marcado = motivos.some(x => x.id === m.id);
              return (
                <label key={m.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${marcado ? 'bg-red-500/[0.08] border-red-400/30' : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05]'}`}>
                  <input type="checkbox" checked={marcado} onChange={() => togglePredefinido(m.id, m.texto)} className="w-4 h-4 rounded accent-red-500 shrink-0" />
                  <span className="text-sm text-white/80">{m.texto}</span>
                </label>
              );
            })}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={otro}
              onChange={e => setOtro(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarOtro(); } }}
              placeholder="Otro motivo (escríbelo y da Enter)..."
              maxLength={200}
              className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
            />
            <button type="button" onClick={agregarOtro} disabled={!otro.trim()} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white/80 text-sm font-semibold border border-white/10 disabled:opacity-40">
              <Plus className="w-4 h-4" /> Agregar
            </button>
          </div>
        </div>
      )}

      {/* ── Motivos reportados: palomear cuando se resuelven ── */}
      {motivos.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-white/40">Motivos reportados — palomea cuando quede resuelto</p>
          {motivos.map(meta).map(m => (
            <div key={m.id} className={`flex items-start gap-3 p-3 rounded-xl border ${m.resuelto ? 'bg-emerald-500/[0.05] border-emerald-400/20' : 'bg-red-500/[0.04] border-red-400/20'}`}>
              <button
                type="button"
                role="checkbox"
                aria-checked={m.resuelto}
                aria-label={`Resuelto: ${m.texto}`}
                onClick={() => cambiar(motivos.map(x => (x.id === m.id ? { ...x, resuelto: !x.resuelto } : x)), notas, true)}
                disabled={!editable}
                className={`mt-0.5 w-7 h-7 shrink-0 rounded-lg border-2 flex items-center justify-center transition-all ${m.resuelto ? 'bg-emerald-500 border-emerald-400 text-white' : 'border-white/25 hover:border-white/45 text-transparent'} disabled:opacity-60`}
              >
                <Check className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0 space-y-1">
                <p className={`text-sm font-semibold ${m.resuelto ? 'text-emerald-200 line-through decoration-emerald-400/50' : 'text-white'}`}>{m.texto}</p>
                {editable ? (
                  <input
                    type="text"
                    value={m.detalle}
                    onChange={e => cambiar(motivos.map(x => (x.id === m.id ? { ...x, detalle: e.target.value } : x)), notas, false)}
                    placeholder="Detalle (opcional)..."
                    maxLength={500}
                    className="w-full bg-transparent border-0 text-xs text-white/70 placeholder:text-white/25 focus:outline-none"
                  />
                ) : m.detalle ? (
                  <p className="text-xs text-white/60">{m.detalle}</p>
                ) : null}
                <p className="text-[10px] text-white/35">
                  {m.reportado_en && <>Reportado {fechaCorta(m.reportado_en)}{m.reportado_por ? ` · ${m.reportado_por}` : ''}</>}
                  {m.resuelto && m.resuelto_en && <> · Resuelto {fechaCorta(m.resuelto_en)}</>}
                </p>
              </div>
              {editable && (
                <button type="button" onClick={() => cambiar(motivos.filter(x => x.id !== m.id), notas, true)} aria-label={`Quitar ${m.texto}`} className="text-white/30 hover:text-red-300 mt-1">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Descripción / reporte ── */}
      {(editable || notas) && (
        <div className="space-y-1.5">
          <label htmlFor="bom-notas" className="text-[11px] font-bold uppercase tracking-wide text-white/40">Descripción / reporte</label>
          {editable ? (
            <textarea
              id="bom-notas"
              value={notas}
              onChange={e => cambiar(motivos, e.target.value, false)}
              placeholder="Describe con tus palabras por qué no se puede explosionar o qué se necesita..."
              rows={3}
              maxLength={4000}
              className="w-full p-3 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/50 resize-y"
            />
          ) : (
            <p id="bom-notas" className="text-sm text-white/70 whitespace-pre-wrap">{notas}</p>
          )}
        </div>
      )}
    </div>
  );
}
