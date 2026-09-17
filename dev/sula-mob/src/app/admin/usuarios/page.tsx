'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { UserPlus, Search } from 'lucide-react';
interface Rol {
  id: string;
  nombre: string;
}

interface Area {
  id: string;
  nombre: string;
}

interface Usuario {
  id: string;
  nombre: string;
  apellidos?: string;
  correo: string;
  username: string;
  activo: boolean;
  roles?: Rol;
  areas?: Area;
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);

  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [correo, setCorreo] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rolId, setRolId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [search, setSearch] = useState('');

  const loadDependencies = useCallback(async () => {
    const [{ data: rData }, { data: aData }] = await Promise.all([
      supabase.from('roles').select('id, nombre'),
      supabase.from('areas').select('id, nombre').eq('activo', true)
    ]);
    if (rData) {
      setRoles(rData as Rol[]);
      if (rData.length > 0) setRolId(rData[0].id);
    }
    if (aData) setAreas(aData as Area[]);
  }, []);

  const fetchUsuarios = useCallback(async () => {
    const { data } = await supabase
      .from('usuarios')
      .select('*, roles(nombre), areas(nombre)')
      .order('created_at', { ascending: false });

    if (data) setUsuarios(data as Usuario[]);
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      await loadDependencies();
      if (isMounted) await fetchUsuarios();
    }
    void init();
    return () => { isMounted = false; };
  }, [loadDependencies, fetchUsuarios]);

  async function handleCrearUsuario(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !correo.trim() || !username.trim() || !password || !rolId) return;

    const { error } = await supabase.from('usuarios').insert([{
      nombre,
      apellidos,
      correo,
      username,
      password_hash: password, // En producción se debe encriptar mediante Supabase Auth o pgcrypto
      rol_id: rolId,
      area_id: areaId || null,
      activo: true
    }]);

    if (error) {
      alert('Error al registrar usuario: ' + error.message);
      return;
    }

    setNombre(''); setApellidos(''); setCorreo(''); setUsername(''); setPassword('');
    void fetchUsuarios();
  }

  const filtrados = usuarios.filter(u =>
    u.nombre?.toLowerCase().includes(search.toLowerCase()) ||
    u.correo?.toLowerCase().includes(search.toLowerCase()) ||
    u.username?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 space-y-6 bg-[#0B0F17] min-h-screen text-slate-100">
      <h1 className="text-2xl font-bold text-white">Administración de Usuarios y Operadores</h1>

      <form onSubmit={handleCrearUsuario} className="bg-[#121824] border border-slate-800 p-6 rounded-2xl space-y-4">
        <h2 className="text-sm font-bold uppercase text-slate-400">Registrar Nuevo Usuario</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input type="text" placeholder="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} className="bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500" required />
          <input type="text" placeholder="Apellidos" value={apellidos} onChange={e => setApellidos(e.target.value)} className="bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500" />
          <input type="email" placeholder="Correo Electrónico" value={correo} onChange={e => setCorreo(e.target.value)} className="bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500" required />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input type="text" placeholder="Usuario (Username)" value={username} onChange={e => setUsername(e.target.value)} className="bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500" required />
          <input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} className="bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500" required />
          
          <select value={rolId} onChange={e => setRolId(e.target.value)} className="bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500" required>
            {roles.map(r => (
              <option key={r.id} value={r.id}>Rol: {r.nombre.toUpperCase()}</option>
            ))}
          </select>

          <select value={areaId} onChange={e => setAreaId(e.target.value)} className="bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500">
            <option value="">Área Asignada (Opcional)...</option>
            {areas.map(a => (
              <option key={a.id} value={a.id}>{a.nombre}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-semibold text-sm px-6 py-2.5 rounded-lg flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Guardar Usuario
          </button>
        </div>
      </form>

      {/* Tabla de Usuarios */}
      <div className="bg-[#121824] border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center gap-3">
          <Search className="w-4 h-4 text-slate-500" />
          <input type="text" placeholder="Buscar por usuario, correo o nombre..." value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent text-sm text-white outline-none w-full" />
        </div>
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-[#0B0F17] text-slate-400 uppercase text-[11px] font-bold">
            <tr>
              <th className="p-4">Usuario / Nombre</th>
              <th className="p-4">Correo</th>
              <th className="p-4">Rol</th>
              <th className="p-4">Área Asignada</th>
              <th className="p-4">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filtrados.map((u) => (
              <tr key={u.id} className="hover:bg-slate-900/40">
                <td className="p-4">
                  <div className="font-semibold text-white">{u.nombre} {u.apellidos || ''}</div>
                  <div className="text-xs text-slate-500 font-mono">@{u.username}</div>
                </td>
                <td className="p-4 text-slate-400">{u.correo}</td>
                <td className="p-4">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase border ${
                    u.roles?.nombre === 'admin' ? 'bg-purple-950 text-purple-400 border-purple-800' : 'bg-blue-950 text-blue-400 border-blue-800'
                  }`}>
                    {u.roles?.nombre || 'Sin Rol'}
                  </span>
                </td>
                <td className="p-4 text-slate-400">{u.areas?.nombre || 'General / Ninguna'}</td>
                <td className="p-4">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${u.activo ? 'text-emerald-400' : 'text-red-400'}`}>
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}