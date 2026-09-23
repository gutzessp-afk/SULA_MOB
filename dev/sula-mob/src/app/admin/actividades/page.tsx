'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Layers, Plus, UserCheck, Edit3, Trash2, AlertCircle, Loader2, Percent } from 'lucide-react';

interface Usuario { id: string; nombre: string; apellidos?: string; }
interface Area {
  id: string;
  nombre: string;
  descripcion?: string;
  peso: number;
  responsable_id?: string;
  activo: boolean;
  usuarios?: Usuario | null;
}

const defaultAreaImages: Record<string, string> = {
  'corte de tubo': '/images/corte_tubo.png',
  'doblez': '/images/dobles.png',
  'corte de lámina': '/images/corte_lamina.png',
  'soldadura': '/images/soldaduraa.png',
  'alambrón': '/images/alambron.png',
  'pintura': '/images/pintura.png',
  'empaque': '/images/empaque.png',
  'corte de madera': '/images/corte_madera.png',
};

export default function ActividadesPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [peso, setPeso] = useState<number>(15);
  const [responsableId, setResponsableId] = useState('');

  const fetchUsuarios = useCallback(async () => {
    const { data } = await supabase.from('usuarios').select('id, nombre, apellidos').eq('activo', true);
    if (data) setUsuarios(data as Usuario[]);
  }, []);

  const fetchAreas = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');

    try {
      const { data: areasData, error: areasError } = await supabase
        .from('areas')
        .select(`*, usuarios!areas_responsable_id_fkey (id, nombre, apellidos)`)
        .order('created_at', { ascending: true });

      if (areasError) {
        const { data: fallbackData } = await supabase.from('areas').select('*').order('created_at', { ascending: true });
        setAreas((fallbackData || []) as Area[]);
      } else {
        setAreas((areasData || []) as Area[]);
      }
   } catch (err) {
      const error = err as Error;
      setErrorMsg('Error al consultar las áreas: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      await fetchUsuarios();
      if (isMounted) await fetchAreas();
    }
    void init();
    return () => { isMounted = false; };
  }, [fetchUsuarios, fetchAreas]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;

    try {
      const payload = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        peso: peso || 0,
        responsable_id: responsableId ? responsableId : null,
        activo: true
      };

      if (editingId) {
        const { error } = await supabase.from('areas').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('areas').insert([payload]);
        if (error) throw error;
      }

      resetForm();
      void fetchAreas();
    } catch (err) {
      const error = err as Error;
      alert('No se pudo guardar el área: ' + error.message);
    }
  }

  function handleStartEdit(area: Area) {
    setEditingId(area.id);
    setNombre(area.nombre);
    setDescripcion(area.descripcion || '');
    setPeso(area.peso || 0);
    setResponsableId(area.responsable_id || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setEditingId(null);
    setNombre('');
    setDescripcion('');
    setPeso(15);
    setResponsableId('');
  }

  async function handleDeleteArea(area: Area) {
    if (!confirm(`¿Estás seguro de eliminar el área "${area.nombre}"?`)) return;

    const { error } = await supabase.from('areas').delete().eq('id', area.id);
    if (error) {
      alert('No se puede eliminar la estación si tiene referencias asociadas.');
    } else {
      void fetchAreas();
    }
  }

  const getAreaImage = (nombreArea: string) => {
    const normalized = nombreArea.trim().toLowerCase();
    return defaultAreaImages[normalized] || '/images/nueva.png';
  };

  const totalPeso = areas.reduce((acc, curr) => acc + (Number(curr.peso) || 0), 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div 
        className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 sm:p-8 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-cover bg-center"
        style={{ backgroundImage: `linear-gradient(to right, rgba(11,15,23,0.95), rgba(18,24,36,0.8)), url('/images/nuevap.png')` }}
      >
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Configuración de Áreas y Ponderación</h1>
          <p className="text-xs text-white/65 mt-1">Asigna el porcentaje de importancia de cada estación dentro del flujo del 100%.</p>
        </div>

        <div className="bg-white/10 border border-white/15 px-4 py-2 rounded-2xl backdrop-blur-md text-xs text-white flex items-center gap-2">
          <Percent className="w-4 h-4 text-emerald-400" />
          <span>Suma total configurada: <strong className="text-emerald-400 font-mono text-sm">{totalPeso}%</strong></span>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-500/20 border border-red-400/35 p-4 rounded-2xl flex items-center gap-3 text-sm text-red-100 backdrop-blur-sm">
          <AlertCircle className="w-5 h-5 text-red-300 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* FORMULARIO */}
      <form onSubmit={handleSubmit} className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-white/60">
          {editingId ? 'Editar Área / Estación' : 'Registrar Nueva Estación'}
        </h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Nombre estación (Ej: Corte tubo)"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="h-[48px] rounded-2xl border border-white/20 bg-white/[0.07] px-4 text-sm text-white outline-none focus:border-white/50"
            required
          />
          <input
            type="text"
            placeholder="Descripción..."
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="h-[48px] rounded-2xl border border-white/20 bg-white/[0.07] px-4 text-sm text-white outline-none focus:border-white/50"
          />
          <div className="relative flex items-center">
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              placeholder="Peso % (Ej: 25)"
              value={peso}
              onChange={(e) => setPeso(parseFloat(e.target.value) || 0)}
              className="w-full h-[48px] rounded-2xl border border-white/20 bg-white/[0.07] px-4 text-sm text-white outline-none focus:border-white/50 pr-8"
              required
            />
            <span className="absolute right-3 text-xs text-white/50 font-bold">%</span>
          </div>

          <select
            value={responsableId}
            onChange={(e) => setResponsableId(e.target.value)}
            className="h-[48px] rounded-2xl border border-white/20 bg-[#121824] px-4 text-sm text-white outline-none focus:border-white/50"
          >
            <option value="">Sin responsable</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre} {u.apellidos || ''}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="bg-white/10 hover:bg-white/20 text-white font-semibold text-xs px-4 py-2.5 rounded-xl border border-white/10"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            className="bg-white text-neutral-900 hover:bg-white/90 font-bold text-xs px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-black/30"
          >
            <Plus className="w-4 h-4" />
            {editingId ? 'Guardar Estación' : 'Crear Estación'}
          </button>
        </div>
      </form>

      {/* LISTADO DE ÁREAS */}
      {loading ? (
        <div className="flex justify-center items-center py-20 text-white/50 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-red-500" />
          <span>Cargando estaciones de planta...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {areas.map((a) => {
            const bgImg = getAreaImage(a.nombre);
            return (
              <div 
                key={a.id} 
                className={`relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] flex flex-col justify-between transition-all hover:border-white/40 ${
                  !a.activo && 'opacity-50'
                }`}
              >
                <div 
                  className="h-36 bg-cover bg-center relative p-4 flex justify-between items-start"
                  style={{ backgroundImage: `linear-gradient(to bottom, rgba(11,15,23,0.3), rgba(18,24,36,0.9)), url('${bgImg}')` }}
                >
                  <div className="w-9 h-9 rounded-xl bg-black/60 backdrop-blur-md flex items-center justify-center text-red-400 border border-white/10">
                    <Layers className="w-4 h-4" />
                  </div>

                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 backdrop-blur-md">
                    Peso: {a.peso}%
                  </span>
                </div>

                <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">{a.nombre}</h3>
                    <p className="text-xs text-white/60 mt-1 leading-relaxed min-h-[32px]">
                      {a.descripcion || 'Sin descripción.'}
                    </p>
                  </div>

                  <div className="bg-white/[0.07] border border-white/10 p-3 rounded-2xl flex items-center justify-between text-xs text-white/70">
                    <span className="flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-white/50" /> Encargado:
                    </span>
                    <span className="font-semibold text-white">
                      {a.usuarios ? `${a.usuarios.nombre} ${a.usuarios.apellidos || ''}` : 'Sin asignar'}
                    </span>
                  </div>

                  <div className="flex justify-end items-center gap-2 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(a)}
                      className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl text-xs flex items-center gap-1 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteArea(a)}
                      className="p-2 text-red-300 hover:text-red-100 hover:bg-red-500/20 rounded-xl text-xs flex items-center gap-1 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Eliminar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}