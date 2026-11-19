'use client';

/**
 * Explosión en MODO COMPRAS — panel de madera — /madera/bom/[id]
 * ────────────────────────────────────────────────────────────────
 * La misma Hoja de explosión del administrador (HojaExplosion.tsx) con soloCompras:
 *   ✔ OC (a mano o arrastrando el PDF de la orden de compra), Compra, Fecha compra,
 *     Almacén, Fecha almacén, descargar el Excel.
 *   ✘ Importar Excel, cambiar materiales, revisiones, cronómetro y estatus del pedido
 *     (eso sigue siendo del administrador; las API lo rechazan aunque se intente).
 * El filtro abre en "Madera" si la explosión tiene materiales de madera.
 *
 * RUTA: src/app/madera/bom/[id]/page.tsx
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, Info, Loader2, MapPin, X, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRecargaAgrupada } from '@/hooks/useRecargaAgrupada';
import { motivosSinResolver } from '@/lib/bom-motivos';
import { ESTATUS_BOM, estatusBom } from '@/lib/bom-tiempo';
import { etiquetaRev } from '@/lib/explosion-revisiones';
import { HojaExplosion, type ResumenHoja } from '@/app/admin/bom/[id]/HojaExplosion';
import { TARJETA } from '../../compras';

interface Explosion {
  id: string;
  proyecto_id: string;
  estado: 'pendiente' | 'en_proceso' | 'completado';
  fecha_inicio: string | null;
  fecha_termino: string | null;
  duracion_seg: number;
  acumulado_seg: number | null;
  tramo_inicio: string | null;
  checklist: unknown;
  proyecto: { codigo: string; nombre: string; cliente: string | null; referencia_sucursal: string | null } | null;
  partidas: { id: string; clave: string; descripcion: string; cantidad: number; orden: number }[];
}

/** Madera no inicia explosiones: la hoja nunca debe arrancar el cronómetro desde aquí */
const nuncaIniciar = async () => false;

export default function MaderaExplosion() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Explosion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [hoja, setHoja] = useState<ResumenHoja | null>(null);
  const guardarHoja = useRef<(() => Promise<void>) | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/bom?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (res.status === 404) { setData(null); setError('Explosión no encontrada.'); return; }
      if (!res.ok) throw new Error();
      setData((await res.json()).explosion as Explosion);
      setError('');
    } catch {
      setError('No se pudo cargar la explosión.');
    } finally {
      setCargando(false);
    }
  }, [id]);

  // El estado (en proceso, terminada…) lo cambia el administrador: se refleja en vivo
  const recargar = useRecargaAgrupada(cargar, 400);
  useEffect(() => {
    const ch = supabase
      .channel(`madera-explosion-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bom_explosiones', filter: `id=eq.${id}` }, recargar)
      .subscribe(status => { if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR') recargar(); });
    const primera = setTimeout(() => void cargar(), 0);
    return () => { clearTimeout(primera); void supabase.removeChannel(ch); };
  }, [id, cargar, recargar]);

  if (cargando) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 text-amber-400 animate-spin" /></div>;

  const volver = (
    <Link href="/madera/bom" className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white">
      <ArrowLeft className="w-4 h-4" /> Volver a explosiones
    </Link>
  );

  if (!data) return (
    <div className="space-y-4">
      {volver}
      <div className={`${TARJETA} p-6 flex items-center gap-3 text-red-400`}><AlertCircle className="w-5 h-5" /><span className="text-sm">{error || 'Explosión no encontrada.'}</span></div>
    </div>
  );

  const est = ESTATUS_BOM[estatusBom(data)];
  const bloqueado = data.estado === 'pendiente' && motivosSinResolver(data.checklist).length > 0;

  return (
    <div className="space-y-5">
      {volver}

      {aviso && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-400/30 bg-red-500/10 text-red-300 text-sm" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{aviso}</span>
          <button type="button" onClick={() => setAviso('')} aria-label="Cerrar aviso" className="text-red-300/60 hover:text-red-200"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Encabezado del pedido (solo lectura) */}
      <div className={`${TARJETA} px-5 py-5 sm:px-7`}>
        <div className="flex items-center gap-3 flex-wrap">
          <Zap className="w-5 h-5 text-amber-400" />
          <h1 className="text-lg sm:text-xl font-bold text-white">{data.proyecto?.codigo || '—'}</h1>
          <span className="text-white/40">·</span>
          <span className="text-sm text-white/70">{data.proyecto?.nombre || 'Sin nombre'}</span>
          <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${est.css}`}>{est.txt}</span>
          {hoja && (
            <span className="px-2 py-1 rounded-lg text-[11px] font-mono font-bold border bg-white/[0.06] text-white/75 border-white/15">
              {etiquetaRev(hoja.numero)}{hoja.estado === 'borrador' ? ' · borrador' : ''}
            </span>
          )}
        </div>
        {data.proyecto?.referencia_sucursal && (
          <p className="text-xs text-white/45 mt-1.5 flex items-center gap-1.5"><MapPin className="w-3 h-3" /> Sucursal: <span className="text-white/70">{data.proyecto.referencia_sucursal}</span></p>
        )}
        <p className="mt-3 text-[12px] text-amber-200/80 flex items-start gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          Modo compras: captura la OC (a mano o arrastrando el PDF de la orden de compra), palomea Compra y Almacén y pon sus fechas. Los materiales y las revisiones los maneja el administrador.
        </p>
      </div>

      <HojaExplosion
        explosionId={data.id}
        estado={data.estado}
        bloqueado={bloqueado}
        partidas={data.partidas}
        asegurarIniciada={nuncaIniciar}
        onAviso={setAviso}
        onResumen={setHoja}
        guardarRef={guardarHoja}
        soloCompras
        filtroInicial="Madera"
      />
    </div>
  );
}
