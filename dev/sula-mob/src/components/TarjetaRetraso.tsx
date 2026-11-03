/**
 * TarjetaRetraso.tsx
 * ──────────────────
 * Tarjeta de un reporte que manda un operador, para Reportes del administrador.
 * Estilo "liquid glass" sobre la paleta oscura de la app. Muestra solo lo esencial:
 * área, pedido, sucursal, quién reporta, hora, fecha y la razón del reporte
 * (el motivo, lo que escribió el operador, la pieza y la foto si las hay).
 *
 * Solo muestra datos: no consulta nada. La pantalla que la usa (admin/reportes) trae las filas.
 *
 * RUTA: src/components/TarjetaRetraso.tsx
 */

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Boxes, Calendar, Camera, Clock, User } from 'lucide-react';
import { AreaBadge } from '@/components/AreaBadge';
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
const PILDORA = 'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]';

interface Props {
  retraso: Retraso;
  operador: string;
  /** Viene de la campanita: la tarjeta se resalta con la etiqueta "Nuevo" */
  resaltado?: boolean;
}

export function TarjetaRetraso({ retraso: r, operador, resaltado = false }: Props) {
  const p = r.proyectos;
  const pieza = piezaDelReporte(r.descripcion);
  const textos = textosDelOperador(r);
  const sucursal = p ? sucursalDelProyecto(p) : '';

  return (
    <article
      className={`overflow-hidden rounded-3xl border bg-gradient-to-br from-white/[0.10] to-white/[0.03] backdrop-blur-xl shadow-[0_24px_50px_-18px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.2)] ${
        resaltado ? 'border-amber-400/60 ring-4 ring-amber-400/15' : 'border-white/15'
      }`}
    >
      {/* ── Área, fecha y hora ── */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="flex flex-wrap items-center gap-2">
          {resaltado && <span className={`${PILDORA} border-amber-400/45 bg-amber-400/15 text-amber-300`}>Nuevo</span>}
          <AreaBadge area={r.areas?.nombre ?? ''} />
        </div>
        <div className="flex items-center gap-3 text-xs text-white/60">
          <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-white/40" /> {fechaDe(r.created_at)}</span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-white/85"><Clock className="h-3.5 w-3.5 text-white/40" /> {horaDe(r.created_at)}</span>
        </div>
      </header>

      {/* ── Pedido y sucursal ── */}
      <section className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-2xl border border-white/10 bg-black/30 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:mx-6">
        {p ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold leading-snug text-white">
                {p.nombre || p.codigo || 'Pedido sin nombre'}
              </p>
            </div>
            {sucursal && (
              <span className={`${PILDORA} border-cyan-400/40 bg-gradient-to-br from-cyan-400/30 to-blue-500/20 text-sm uppercase tracking-wide text-cyan-200 shadow-[0_0_18px_-4px_rgba(34,211,238,0.45),inset_0_1px_0_rgba(255,255,255,0.25)]`}>
                {sucursal}
              </span>
            )}
          </>
        ) : (
          <p className="text-xs text-white/50">Pedido no disponible (pudo darse de baja).</p>
        )}
      </section>

      {/* ── Razón del reporte ── */}
      <section className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Razón del reporte</p>
          <span className={`${PILDORA} border-red-400/35 bg-gradient-to-br from-red-500/30 to-red-500/10 text-sm text-red-300`}>
            {r.motivo || 'Sin motivo'}
          </span>
          {textos.map((t, i) => (
            <p key={i} className={i === 0 ? 'text-base font-semibold leading-snug text-white' : 'text-xs leading-relaxed text-white/60'}>{t}</p>
          ))}
          {pieza && (
            <p className="inline-flex max-w-full items-start gap-2 rounded-xl border border-white/12 bg-white/[0.07] px-3 py-1.5 text-xs text-white/80">
              <Boxes className="mt-px h-3.5 w-3.5 flex-shrink-0 text-white/45" />
              <span className="min-w-0">
                Pieza{pieza.clave && <> <span className="font-mono font-bold text-blue-300">{pieza.clave}</span></>}
                {pieza.nombre && <> · {pieza.nombre}</>}
              </span>
            </p>
          )}
        </div>

        {r.evidencia_url && (
          <a href={r.evidencia_url} target="_blank" rel="noreferrer" className="group block w-fit flex-shrink-0">
            {/* Miniatura optimizada y diferida (fotos de Supabase); el enlace abre la foto completa */}
            {esFotoSupabase(r.evidencia_url) ? (
              <Image src={r.evidencia_url} alt="Evidencia del reporte" width={160} height={112} sizes="160px" className="h-28 w-40 rounded-2xl border border-white/20 object-cover shadow-[0_12px_22px_-12px_rgba(0,0,0,0.8)]" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.evidencia_url} alt="Evidencia del reporte" loading="lazy" decoding="async" className="h-28 w-40 rounded-2xl border border-white/20 object-cover shadow-[0_12px_22px_-12px_rgba(0,0,0,0.8)]" />
            )}
            <span className="mt-1 flex items-center gap-1 text-[11px] text-blue-400 group-hover:underline">
              <Camera className="h-3 w-3" /> Ver foto completa
            </span>
          </a>
        )}
      </section>

      {/* ── Quién reporta ── */}
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 px-4 pb-4 pt-3.5 text-xs sm:px-6 sm:pb-5">
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
