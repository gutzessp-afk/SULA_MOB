'use client';

import Image from 'next/image';
import { FileSpreadsheet, Download, AlertCircle, BarChart3 } from 'lucide-react';

export default function ReportesPage() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      
      {/* HEADER LIQUID GLASS CON IMAGEN TÉCNICA 'nuevap.png' */}
      <div 
        className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 sm:p-8 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-cover bg-center"
        style={{ backgroundImage: `linear-gradient(to right, rgba(11,15,23,0.95), rgba(18,24,36,0.8)), url('/images/nuevap.png')` }}
      >
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6 text-red-500" />
            Reportes e Indicadores
          </h1>
          <p className="text-xs text-white/65 mt-1">
            Generación de métricas de desempeño, eficiencia por estación y descargas de datos.
          </p>
        </div>
      </div>

      {/* PANEL DE DESCARGAS Y TARJETAS LIQUID GLASS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <div className="lg:col-span-2 space-y-6">
          <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/60 border-b border-white/10 pb-3">
              Descarga de Reportes
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white/[0.07] border border-white/10 p-5 rounded-2xl space-y-3">
                <div className="flex items-center gap-3 text-white font-bold text-sm">
                  <BarChart3 className="w-5 h-5 text-red-400" /> Reporte de Producción
                </div>
                <p className="text-xs text-white/60">Exporta el acumulado de proyectos finalizados por estación.</p>
                <button className="bg-white text-neutral-900 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 hover:bg-white/90 shadow-md">
                  <Download className="w-4 h-4" /> Exportar CSV
                </button>
              </div>

              <div className="bg-white/[0.07] border border-white/10 p-5 rounded-2xl space-y-3">
                <div className="flex items-center gap-3 text-white font-bold text-sm">
                  <AlertCircle className="w-5 h-5 text-amber-400" /> Historial de Incidencias
                </div>
                <p className="text-xs text-white/60">Consolidado de avisos y detenciones enviadas por operadores.</p>
                <button className="bg-white text-neutral-900 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 hover:bg-white/90 shadow-md">
                  <Download className="w-4 h-4" /> Exportar CSV
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* TARJETA VISUAL CON 'instalaciones.png' */}
        <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-4 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] h-64 flex flex-col justify-end">
          <Image src="/images/instalaciones.png" alt="Infraestructura" fill className="object-cover rounded-2xl opacity-75" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F17] via-transparent to-transparent rounded-2xl" />
          <div className="relative z-10 p-2 space-y-1">
            <span className="text-[10px] uppercase tracking-wider font-bold text-red-400 bg-black/60 px-2.5 py-1 rounded-full border border-white/10 backdrop-blur-md inline-block">
              Trazabilidad Total
            </span>
            <p className="text-xs text-white/80">Informes optimizados para análisis técnico y auditorías.</p>
          </div>
        </div>

      </div>
    </div>
  );
}