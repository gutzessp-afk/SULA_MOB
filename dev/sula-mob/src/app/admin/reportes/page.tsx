'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

interface ReporteProduccion {
  id: string;
  fecha: string;
  hora_inicio?: string;
  hora_fin?: string;
  piezas: number;
  proyectos?: { nombre: string; codigo: string };
  areas?: { nombre: string };
  usuarios?: { nombre: string };
}

interface ReporteRetraso {
  id: string;
  motivo?: string;
  descripcion?: string;
  tiempo_estimado_retraso?: number;
  created_at?: string;
  proyectos?: { nombre: string; codigo: string };
  areas?: { nombre: string };
}

export default function ReportesPage() {
  const [producciones, setProducciones] = useState<ReporteProduccion[]>([]);
  const [retrasos, setRetrasos] = useState<ReporteRetraso[]>([]);

  const fetchReportes = useCallback(async () => {
    const [{ data: pData }, { data: rData }] = await Promise.all([
      supabase.from('produccion').select('*, proyectos(nombre, codigo), areas(nombre), usuarios!produccion_operador_id_fkey(nombre)').order('fecha', { ascending: false }),
      supabase.from('retrasos').select('*, proyectos(nombre, codigo), areas(nombre)').order('created_at', { ascending: false })
    ]);

    if (pData) setProducciones(pData as ReporteProduccion[]);
    if (rData) setRetrasos(rData as ReporteRetraso[]);
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      if (isMounted) await fetchReportes();
    }
    void init();
    return () => { isMounted = false; };
  }, [fetchReportes]);

  return (
    <div className="p-8 space-y-8 bg-[#0B0F17] min-h-screen text-slate-100">
      <h1 className="text-2xl font-bold text-white">Reportes de Producción e Incidentes</h1>

      {/* Tabla de Registros de Producción por Operador */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Registro de Piezas Producidas
        </h2>
        <div className="bg-[#121824] border border-slate-800 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-[#0B0F17] text-slate-400 uppercase text-[11px] font-bold">
              <tr>
                <th className="p-4">Fecha / Horario</th>
                <th className="p-4">Proyecto</th>
                <th className="p-4">Área</th>
                <th className="p-4">Operador</th>
                <th className="p-4">Piezas Producidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {producciones.map((p) => (
                <tr key={p.id} className="hover:bg-slate-900/40">
                  <td className="p-4 text-xs">
                    <div className="font-semibold text-white">{p.fecha}</div>
                    <div className="text-slate-500 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" /> {p.hora_inicio || '--:--'} - {p.hora_fin || '--:--'}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="font-semibold text-white">{p.proyectos?.nombre || 'N/A'}</div>
                    <div className="text-xs font-mono text-red-400">{p.proyectos?.codigo}</div>
                  </td>
                  <td className="p-4 text-slate-300">{p.areas?.nombre || 'N/A'}</td>
                  <td className="p-4 text-slate-400">{p.usuarios?.nombre || 'Anónimo'}</td>
                  <td className="p-4 font-black text-emerald-400 text-base">{p.piezas} pzs</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabla de Retrasos e Incidentes */}
      <div className="space-y-4 pt-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-500" /> Reportes de Retrasos e Incidentes
        </h2>
        <div className="bg-[#121824] border border-slate-800 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-[#0B0F17] text-slate-400 uppercase text-[11px] font-bold">
              <tr>
                <th className="p-4">Proyecto / Área</th>
                <th className="p-4">Motivo</th>
                <th className="p-4">Descripción / Detalles</th>
                <th className="p-4">Retraso Estimado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {retrasos.map((r) => (
                <tr key={r.id} className="hover:bg-slate-900/40">
                  <td className="p-4">
                    <div className="font-semibold text-white">{r.proyectos?.nombre || 'N/A'}</div>
                    <div className="text-xs text-slate-400">{r.areas?.nombre}</div>
                  </td>
                  <td className="p-4 font-semibold text-red-400">{r.motivo || 'Sin motivo'}</td>
                  <td className="p-4 text-slate-300 text-xs">{r.descripcion || 'Sin descripción.'}</td>
                  <td className="p-4 font-bold text-amber-400">{r.tiempo_estimado_retraso ? `${r.tiempo_estimado_retraso} hrs` : 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}