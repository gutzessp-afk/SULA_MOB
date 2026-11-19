/**
 * TarjetaRetraso.tsx
 * ──────────────────
 * Tarjeta de un reporte que manda un operador, para Reportes del administrador.
 * Diseño "ticket" (v2): franja lateral con el color del área, arriba el motivo y cuándo pasó,
 * en grande lo que escribió el operador, abajo una tira con pedido · sucursal · pieza,
 * la foto a la derecha (abajo en celular) y al pie quién reporta + "Abrir proyecto".
 * Mismos colores de siempre (vidrio oscuro, rojo del motivo, cian de la sucursal, azul del botón).
 *
 * Solo muestra datos: no consulta nada. La pantalla que la usa (admin/reportes) trae las filas.
 *
 * RUTA: src/components/TarjetaRetraso.tsx
 */

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Boxes, Calendar, Camera, Clock, MapPin, Package, Quote, User } from 'lucide-react';
import { AreaBadge, estiloArea } from '@/components/AreaBadge';
import { ZONA_HORARIA } from '@/lib/entregas';

export interface ProyectoRetraso {
  codigo: string | null;
  nombre: string | null;
  referencia_sucursal: string | null;
  prioridad: string | null;
  progreso: number | null;
  fecha_maxima: string | null;
  descripcion: string | null;
}

export interface Retraso {
  id: string;
  proyecto_id: string | null;
  motivo: string | null;
  descripcion: string | null;
  tiempo_estimado_retraso: number | null;
  comentario: string | null;
  evidencia_url: string | null;
  operador_id: string | null;
  created_at: string;
  proyectos: ProyectoRetraso | null;
  areas: { nombre: string } | null;
}

/** Solo las fotos del almacenamiento de Supabase pasan por el optimizador de imágenes (next.config) */
const esFotoSupabase = (url: string) => url.startsWith(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`);

/** "3 nov 2026" y "9:35 a.m." en la hora de México */
const fechaDe = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: ZONA_HORARIA }).replace(/\./g, '');
const horaDe = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', timeZone: ZONA_HORARIA });

/**
 * Sucursal del pedido: la guardada en el proyecto o, en los pedidos que no la tienen,
 * la "Ref: …" que el alta desde el PDF deja en la descripción ("Fecha: … | Ref: VENTO | …").
 */
export function sucursalDelProyecto(p: Pick<ProyectoRetraso, 'referencia_sucursal' | 'descripcion'>) {
  return p.referencia_sucursal?.trim() || p.descripcion?.match(/Ref:\s*([^|]+)/)?.[1]?.trim() || '';
}

/**
 * Los reportes por pieza traen la pieza escrita en la descripción:
 * Pieza "[2-1-0073-0004] MESA LONGE DUST" en Empaque
 */
export function piezaDelReporte(descripcion: string | null) {
  const m = descripcion?.match(/^Pieza\s+"(?:\[([^\]]+)\]\s*)?([^"]*)"/i);
  return m ? { clave: m[1] ?? '', nombre: m[2].trim() } : null;
}

/** "Problema en Pintura" lo escribe el sistema en los reportes de área: repite el área y no aporta */
const esTextoAutomatico = (descripcion: string | null) => /^Problema en /i.test(descripcion ?? '');

/** Los textos que sí escribió el operador, el principal primero */
export function textosDelOperador(r: Pick<Retraso, 'descripcion' | 'comentario'>) {
  const propio = r.descripcion && !piezaDelReporte(r.descripcion) && !esTextoAutomatico(r.descripcion) ? r.descripcion : null;
  return [propio, r.comentario].filter((t): t is string => !!t && t.trim() !== '');
}

/** Base de las píldoras de vidrio (etiquetas de área, motivo, pedido, horas) */
const PILDORA = 'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]';
/** Celda de la tira de datos (pedido / sucursal / pieza) */
const CELDA = 'min-w-0 flex items-start gap-2.5 px-3.5 py-2.5';
const ETIQUETA = 'block text-[10px] font-bold uppercase tracking-wider text-white/40';

interface Props {
  retraso: Retraso;
  operador: string;
  /** Viene de la campanita: la tarjeta se resalta con la etiqueta "Nuevo" */
  resaltado?: boolean;
}

export function TarjetaRetraso({ retraso: r, operador, resaltado = false }: Props) {
  const p = r.proyectos;
  const pieza = piezaDelReporte(r.descripcion);
  const [principal, ...extras] = textosDelOperador(r);
  const sucursal = p ? sucursalDelProyecto(p) : '';
  const area = r.areas?.nombre ?? '';
  // Franja lateral con el color del área (el mismo de su etiqueta)
  const colorArea = estiloArea(area).hex;

  const foto = r.evidencia_url && (
    <a href={r.evidencia_url} target="_blank" rel="noreferrer" aria-label="Ver foto completa de la evidencia" className="group relative block w-full overflow-hidden rounded-2xl border border-white/20 shadow-[0_12px_22px_-12px_rgba(0,0,0,0.8)] md:w-44">
      {/* Miniatura optimizada y diferida (fotos de Supabase); el enlace abre la foto completa */}
      {esFotoSupabase(r.evidencia_url) ? (
        <Image src={r.evidencia_url} alt="Evidencia del reporte" width={176} height={176} sizes="(min-width: 768px) 176px, 100vw" className="h-40 w-full object-cover transition-transform duration-300 group-hover:scale-105 md:h-44" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.evidencia_url} alt="Evidencia del reporte" loading="lazy" decoding="async" className="h-40 w-full object-cover transition-transform duration-300 group-hover:scale-105 md:h-44" />
      )}
      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/80 to-transparent pb-2 pt-6 text-[11px] font-semibold text-white/90">
        <Camera className="h-3.5 w-3.5" /> Ver foto completa
      </span>
    </a>
  );

  return (
    <article
      className={`relative overflow-hidden rounded-3xl border bg-gradient-to-br from-white/[0.10] to-white/[0.03] backdrop-blur-xl shadow-[0_24px_50px_-18px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.2)] ${
        resaltado ? 'border-amber-400/60 ring-4 ring-amber-400/15' : 'border-white/15'
      }`}
    >
      {/* Franja del área */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: `linear-gradient(to bottom, ${colorArea}, ${colorArea}55)` }} />

      <div className="grid gap-4 py-4 pl-5 pr-4 sm:py-5 sm:pl-7 sm:pr-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-3.5">
          {/* ── Motivo, área y cuándo ── */}
          <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {resaltado && <span className={`${PILDORA} border-amber-400/45 bg-amber-400/15 text-amber-300`}>Nuevo</span>}
              <span className={`${PILDORA} border-red-400/35 bg-gradient-to-br from-red-500/30 to-red-500/10 text-[13px] text-red-300`}>
                {r.motivo || 'Sin motivo'}
              </span>
              <AreaBadge area={area} />
            </div>
            <div className="flex items-center gap-3 text-xs text-white/60">
              <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-white/40" /> {fechaDe(r.created_at)}</span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-white/85"><Clock className="h-3.5 w-3.5 text-white/40" /> {horaDe(r.created_at)}</span>
            </div>
          </header>

          {/* ── Lo que escribió el operador ── */}
          {principal ? (
            <blockquote className="relative pl-7">
              <Quote aria-hidden className="absolute left-0 top-0.5 h-5 w-5 text-white/25" />
              <p className="text-lg font-semibold leading-snug text-white break-words">{principal}</p>
              {extras.map((t, i) => (
                <p key={i} className="mt-1 text-xs leading-relaxed text-white/60 break-words">{t}</p>
              ))}
            </blockquote>
          ) : (
            <p className="text-sm italic text-white/45">El operador no escribió comentario.</p>
          )}

          {/* ── Pedido · sucursal · pieza ── */}
          <dl className="grid overflow-hidden rounded-2xl border border-white/10 bg-black/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] divide-y divide-white/10 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] sm:divide-y-0 sm:divide-x">
            <div className={CELDA}>
              <Package className="mt-0.5 h-4 w-4 flex-shrink-0 text-white/40" />
              <div className="min-w-0">
                <dt className={ETIQUETA}>Pedido</dt>
                <dd className="truncate text-[15px] font-bold text-white">{p ? p.nombre || p.codigo || 'Pedido sin nombre' : 'No disponible (pudo darse de baja)'}</dd>
              </div>
            </div>
            <div className={CELDA}>
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-300/70" />
              <div className="min-w-0">
                <dt className={ETIQUETA}>Sucursal</dt>
                <dd className="truncate text-sm font-bold uppercase tracking-wide text-cyan-200">{sucursal || '—'}</dd>
              </div>
            </div>
            {pieza && (
              <div className={`${CELDA} border-t border-white/10 sm:col-span-2 sm:!border-l-0`}>
                <Boxes className="mt-0.5 h-4 w-4 flex-shrink-0 text-white/40" />
                <div className="min-w-0">
                  <dt className={ETIQUETA}>Pieza</dt>
                  <dd className="text-xs leading-relaxed text-white/80 break-words">
                    {pieza.clave && <span className="font-mono font-bold text-blue-300">{pieza.clave}</span>}
                    {pieza.clave && pieza.nombre && ' · '}
                    {pieza.nombre}
                  </dd>
                </div>
              </div>
            )}
          </dl>
        </div>

        {/* ── Foto (derecha en escritorio, abajo en celular) ── */}
        {foto && <div className="md:self-start">{foto}</div>}
      </div>

      {/* ── Quién reporta ── */}
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 bg-black/15 py-3 pl-5 pr-4 text-xs sm:pl-7 sm:pr-6">
        <span className="inline-flex items-center gap-2 text-white/70">
          <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-white/60 bg-gradient-to-br from-blue-500 to-cyan-400 shadow-[0_0_0_3px_rgba(96,165,250,0.3)]">
            <User className="h-3.5 w-3.5 text-white" />
          </span>
          <span><span className="text-white/40">Reporta:</span> <span className="font-semibold text-white/85">{operador}</span></span>
        </span>
        {r.proyecto_id && p && (
          <Link
            href={`/admin/proyectos/${r.proyecto_id}`}
            className="ml-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/30 bg-gradient-to-br from-blue-500 to-indigo-600 px-5 text-[13px] font-extrabold text-white shadow-[0_14px_24px_-10px_rgba(59,130,246,0.75),inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform hover:-translate-y-0.5"
          >
            Abrir proyecto <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </footer>
    </article>
  );
}
