'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { UserPlus, Building, Search } from 'lucide-react';

interface Cliente {
  id: string;
  nombre: string;
  empresa?: string;
  created_at?: string;
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [nombre, setNombre] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [search, setSearch] = useState('');

  async function fetchClientes() {
    const { data } = await supabase.from('clientes').select('*').order('created_at', { ascending: false });
    if (data) setClientes(data as Cliente[]);
  }

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      const { data } = await supabase.from('clientes').select('*').order('created_at', { ascending: false });
      if (isMounted && data) setClientes(data as Cliente[]);
    }
    void loadData();
    return () => { isMounted = false; };
  }, []);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;

    await supabase.from('clientes').insert([{ nombre, empresa }]);
    setNombre(''); setEmpresa('');
    void fetchClientes();
  }

  const filtrados = clientes.filter(c => c.nombre?.toLowerCase().includes(search.toLowerCase()) || c.empresa?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-8 space-y-6 bg-[#0B0F17] min-h-screen text-slate-100">
      <h1 className="text-2xl font-bold text-white">Directorio de Clientes</h1>

      <form onSubmit={handleCrear} className="bg-[#121824] border border-slate-800 p-6 rounded-2xl space-y-4">
        <h2 className="text-sm font-bold uppercase text-slate-400">Registrar Cliente</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input type="text" placeholder="Contacto Principal" value={nombre} onChange={e => setNombre(e.target.value)} className="bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500" required />
          <input type="text" placeholder="Empresa / Empresa Comercial" value={empresa} onChange={e => setEmpresa(e.target.value)} className="bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500" />
        </div>
        <div className="flex justify-end">
          <button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-semibold text-sm px-4 py-2.5 rounded-lg flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Guardar Cliente
          </button>
        </div>
      </form>

      <div className="bg-[#121824] border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center gap-3">
          <Search className="w-4 h-4 text-slate-500" />
          <input type="text" placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent text-sm text-white outline-none w-full" />
        </div>
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-[#0B0F17] text-slate-400 uppercase text-[11px] font-bold">
            <tr>
              <th className="p-4">Contacto</th>
              <th className="p-4">Empresa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filtrados.map((c) => (
              <tr key={c.id} className="hover:bg-slate-900/40">
                <td className="p-4 font-medium text-white">{c.nombre}</td>
                <td className="p-4 text-slate-400 flex items-center gap-2"><Building className="w-3 h-3 text-slate-500"/>{c.empresa || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}