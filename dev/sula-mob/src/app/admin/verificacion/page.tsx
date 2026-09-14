'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { QrCode, Search, AlertCircle } from 'lucide-react';

interface ProyectoEscaneado {
  id: string;
  codigo: string;
  nombre: string;
  cliente?: string;
  progreso: number;
}

export default function VerificacionPage() {
  const [codigoQR, setCodigoQR] = useState('');
  const [item, setItem] = useState<ProyectoEscaneado | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    if (!codigoQR.trim()) return;

    const { data, error } = await supabase.from('proyectos').select('*').eq('codigo', codigoQR).single();

    if (error || !data) {
      setItem(null);
      setErrorMsg('No se encontró información para el código escaneado.');
    } else {
      setItem(data as ProyectoEscaneado);
      setErrorMsg('');
    }
  }

  return (
    <div className="p-8 space-y-6 bg-[#0B0F17] min-h-screen text-slate-100">
      <h1 className="text-2xl font-bold text-white">Escáner e Inspección QR</h1>

      <form onSubmit={handleBuscar} className="bg-[#121824] border border-slate-800 p-6 rounded-2xl flex gap-4">
        <div className="relative flex-1">
          <QrCode className="w-5 h-5 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            placeholder="Escanea o escribe el código QR..."
            value={codigoQR}
            onChange={e => setCodigoQR(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-[#0B0F17] border border-slate-800 rounded-lg text-sm text-white outline-none focus:border-red-500"
          />
        </div>
        <button type="submit" className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2">
          <Search className="w-4 h-4" /> Inspeccionar
        </button>
      </form>

      {errorMsg && (
        <div className="p-4 bg-red-950/40 border border-red-800/50 rounded-xl text-sm text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {errorMsg}
        </div>
      )}

      {item && (
        <div className="bg-[#121824] border border-slate-800 p-6 rounded-2xl space-y-4">
          <div className="flex justify-between items-start border-b border-slate-800 pb-4">
            <div>
              <span className="text-xs font-mono text-red-400 bg-red-950/60 border border-red-800/40 px-2 py-0.5 rounded">{item.codigo}</span>
              <h2 className="text-xl font-bold text-white mt-1">{item.nombre}</h2>
            </div>
            <span className="bg-emerald-950 border border-emerald-800/50 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold uppercase">
              {item.progreso}% Avanzado
            </span>
          </div>
          <p className="text-sm text-slate-400">Cliente: {item.cliente || 'N/A'}</p>
        </div>
      )}
    </div>
  );
}