'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Search } from 'lucide-react';
interface Usuario {
  id: string;
  nombre: string;
  apellidos?: string;
}

interface Estado {
  id: string;
  nombre: string;
  color: string;
}

interface Area {
  id: string;
  nombre: string;
}

interface Proyecto {
  id: string;
  codigo: string;
  nombre: string;
  cliente?: string;
  descripcion?: string;
  prioridad: string;
  progreso: number;
  fecha_inicio?: string;
  fecha_maxima?: string;
  fecha_estimada?: string;
  estado_id?: string;
  responsable_id?: string;
  estados?: Estado;
  usuarios?: Usuario;
}

export default function ProyectosPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [estados, setEstados] = useState<Estado[]>([]);
  const [areasDisponibles, setAreasDisponibles] = useState<Area[]>([]);

  // Campos del Formulario
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [cliente, setCliente] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [prioridad, setPrioridad] = useState('media');
  const [responsableId, setResponsableId] = useState('');
  const [estadoId, setEstadoId] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaMaxima, setFechaMaxima] = useState('');
  const [fechaEstimada, setFechaEstimada] = useState('');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const loadDependencies = useCallback(async () => {
    const [{ data: uData }, { data: eData }, { data: aData }] = await Promise.all([
      supabase.from('usuarios').select('id, nombre, apellidos'),
      supabase.from('estados').select('id, nombre, color').order('orden', { ascending: true }),
      supabase.from('areas').select('id, nombre').eq('activo', true)
    ]);

    if (uData) setUsuarios(uData as Usuario[]);
    if (eData) {
      setEstados(eData as Estado[]);
      if (eData.length > 0) setEstadoId(eData[0].id);
    }
    if (aData) setAreasDisponibles(aData as Area[]);
  }, []);

  const fetchProyectos = useCallback(async () => {
    const { data } = await supabase
      .from('proyectos')
      .select('*, estados(nombre, color), usuarios!proyectos_responsable_id_fkey(nombre, apellidos)')
      .order('created_at', { ascending: false });

    if (data) setProyectos(data as Proyecto[]);
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      await loadDependencies();
      if (isMounted) await fetchProyectos();
    }
    void init();
    return () => { isMounted = false; };
  }, [loadDependencies, fetchProyectos]);

  async function handleCrearProyecto(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !codigo.trim() || !estadoId) return;

    // 1. Insertar en tabla proyectos
    const { data: projectData, error: pError } = await supabase
      .from('proyectos')
      .insert([{
        codigo,
        nombre,
        cliente,
        descripcion,
        prioridad,
        responsable_id: responsableId || null,
        estado_id: estadoId,
        fecha_inicio: fechaInicio || null,
        fecha_maxima: fechaMaxima || null,
        fecha_estimada: fechaEstimada || null,
        progreso: 0
      }])
      .select()
      .single();

    if (pError || !projectData) {
      alert('Error al crear el proyecto: ' + pError?.message);
      return;
    }

    // 2. Asociar Áreas en proyecto_areas
    if (selectedAreas.length > 0) {
      const areaInserts = selectedAreas.map((areaId, index) => ({
        proyecto_id: projectData.id,
        area_id: areaId,
        orden: index + 1,
        progreso: 0,
        estado_id: estadoId
      }));

      await supabase.from('proyecto_areas').insert(areaInserts);
    }

    // Resetear formulario
    setCodigo(''); setNombre(''); setCliente(''); setDescripcion('');
    setSelectedAreas([]);
    void fetchProyectos();
  }

  const toggleAreaSelection = (areaId: string) => {
    setSelectedAreas(prev =>
      prev.includes(areaId) ? prev.filter(id => id !== areaId) : [...prev, areaId]
    );
  };

  const filtrados = proyectos.filter(p =>
    p.nombre?.toLowerCase().includes(search.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(search.toLowerCase()) ||
    p.cliente?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 space-y-6 bg-[#0B0F17] min-h-screen text-slate-100">
      <h1 className="text-2xl font-bold text-white">Gestión y Alta de Proyectos</h1>

      <form onSubmit={handleCrearProyecto} className="bg-[#121824] border border-slate-800 p-6 rounded-2xl space-y-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Datos Generales del Proyecto</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input type="text" placeholder="Código Único (Ej: PRJ-001)" value={codigo} onChange={e => setCodigo(e.target.value)} className="bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500" required />
          <input type="text" placeholder="Nombre del Proyecto" value={nombre} onChange={e => setNombre(e.target.value)} className="bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500" required />
          <input type="text" placeholder="Cliente" value={cliente} onChange={e => setCliente(e.target.value)} className="bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Prioridad</label>
            <select value={prioridad} onChange={e => setPrioridad(e.target.value)} className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500">
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Responsable Principal</label>
            <select value={responsableId} onChange={e => setResponsableId(e.target.value)} className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500">
              <option value="">Seleccionar responsable...</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.nombre} {u.apellidos || ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Estado Inicial</label>
            <select value={estadoId} onChange={e => setEstadoId(e.target.value)} className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500" required>
              {estados.map(e => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Fecha de Inicio</label>
            <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Fecha Estimada Fin</label>
            <input type="date" value={fechaEstimada} onChange={e => setFechaEstimada(e.target.value)} className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Fecha Máxima Fin</label>
            <input type="date" value={fechaMaxima} onChange={e => setFechaMaxima(e.target.value)} className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500" />
          </div>
        </div>

        <div>
          <textarea placeholder="Descripción / Observaciones detalladas..." value={descripcion} onChange={e => setDescripcion(e.target.value)} className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500 h-20" />
        </div>

        {/* Selección de Áreas / Estaciones por las que pasará el proyecto */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-slate-400 block">Asignar Áreas de Producción (Ruta del Proceso)</label>
          <div className="flex flex-wrap gap-2">
            {areasDisponibles.map(a => {
              const selected = selectedAreas.includes(a.id);
              return (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => toggleAreaSelection(a.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    selected
                      ? 'bg-red-950/80 border-red-500 text-white'
                      : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {selected ? '✓ ' : '+ '}{a.nombre}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-semibold text-sm px-6 py-2.5 rounded-lg flex items-center gap-2">
            <Plus className="w-4 h-4" /> Registrar Proyecto
          </button>
        </div>
      </form>

      {/* Lista de Proyectos Activos */}
      <div className="bg-[#121824] border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center gap-3">
          <Search className="w-4 h-4 text-slate-500" />
          <input type="text" placeholder="Buscar por código, nombre o cliente..." value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent text-sm text-white outline-none w-full" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-[#0B0F17] text-slate-400 uppercase text-[11px] font-bold">
              <tr>
                <th className="p-4">Código</th>
                <th className="p-4">Proyecto</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Prioridad</th>
                <th className="p-4">Estado</th>
                <th className="p-4">Responsable</th>
                <th className="p-4">Fechas (Inicio / Máx)</th>
                <th className="p-4">Progreso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtrados.map((p) => (
                <tr key={p.id} className="hover:bg-slate-900/40">
                  <td className="p-4 font-mono text-red-400 font-bold">{p.codigo}</td>
                  <td className="p-4 font-semibold text-white">{p.nombre}</td>
                  <td className="p-4 text-slate-400">{p.cliente || '—'}</td>
                  <td className="p-4 uppercase text-[10px] font-bold">
                    <span className={`px-2 py-0.5 rounded ${
                      p.prioridad === 'urgente' ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-slate-800 text-slate-300'
                    }`}>
                      {p.prioridad}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: `${p.estados?.color}20`, color: p.estados?.color || '#fff' }}>
                      {p.estados?.nombre || 'N/A'}
                    </span>
                  </td>
                  <td className="p-4 text-slate-400">
                    {p.usuarios ? `${p.usuarios.nombre} ${p.usuarios.apellidos || ''}` : 'Sin asignar'}
                  </td>
                  <td className="p-4 text-xs text-slate-400">
                    <div>In: {p.fecha_inicio || '—'}</div>
                    <div>Max: {p.fecha_maxima || '—'}</div>
                  </td>
                  <td className="p-4 font-bold text-emerald-400">{p.progreso}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}