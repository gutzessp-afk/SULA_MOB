'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Layers, Plus, UserCheck, Edit3, Trash2, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';

interface Usuario {
  id: string;
  nombre: string;
  apellidos?: string;
}

interface Area {
  id: string;
  nombre: string;
  descripcion?: string;
  responsable_id?: string;
  activo: boolean;
  usuarios?: Usuario | null;
}

// DICCIONARIO DE IMÁGENES LOCALES POR NOMBRE DE ÁREA
const defaultAreaImages: Record<string, string> = {
  'corte de tubo': '/images/corte_tubo.png',
  'doblez': '/images/dobles.png',
  'corte de lámina': '/images/corte_lamina.png',
  'soldadura': '/images/soldadura.png',
  'alambrón': '/images/alambron.png',
  'pintura': '/images/pintura.png',
  'empaque': '/images/empaque.png',
};

export default function ActividadesPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
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
        .select(`
          *,
          usuarios!areas_responsable_id_fkey (
            id,
            nombre,
            apellidos
          )
        `)
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
        responsable_id: responsableId ? responsableId : null,
        activo: true
      };

      if (editingId) {
        const { error } = await supabase
          .from('areas')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('areas')
          .insert([payload]);
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
    setResponsableId(area.responsable_id || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setEditingId(null);
    setNombre('');
    setDescripcion('');
    setResponsableId('');
  }

  async function toggleEstadoArea(id: string, activoActual: boolean) {
    const { error } = await supabase.from('areas').update({ activo: !activoActual }).eq('id', id);
    if (!error) void fetchAreas();
  }

  async function handleDeleteArea(area: Area) {
    if (!confirm(`¿Estás seguro de eliminar el área "${area.nombre}"?`)) return;

    const { error } = await supabase.from('areas').delete().eq('id', area.id);
    if (error) {
      alert('No se puede eliminar la estación si tiene referencias asociadas. Intenta desactivarla.');
    } else {
      void fetchAreas();
    }
  }

  const getAreaImage = (nombreArea: string) => {
    const normalized = nombreArea.trim().toLowerCase();
    return defaultAreaImages[normalized] || '/images/fondop.png';
  };

  return (
    <div className="p-4 sm:p-8 space-y-6 bg-transparent text-slate-100 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-white tracking-wide uppercase">Catálogo de Áreas y Procesos</h1>
          <p className="text-xs text-slate-400 mt-1">Configura las estaciones de trabajo del flujo productivo.</p>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-950/80 border border-red-500/50 p-4 rounded-xl flex items-center gap-3 text-sm text-red-200">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="bg-[#121824]/90 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-2xl backdrop-blur-md">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          {editingId ? 'Editar Área / Proceso' : 'Registrar Nueva Estación'}
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            placeholder="Nombre de la estación (Ej: Corte de Tubo, Pintura)"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="bg-[#0B0F17] border border-slate-800 rounded-xl p-3 text-sm text-white outline-none focus:border-red-500"
            required
          />
          <input
            type="text"
            placeholder="Descripción del proceso..."
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="bg-[#0B0F17] border border-slate-800 rounded-xl p-3 text-sm text-white outline-none focus:border-red-500"
          />
          <select
            value={responsableId}
            onChange={(e) => setResponsableId(e.target.value)}
            className="bg-[#0B0F17] border border-slate-800 rounded-xl p-3 text-sm text-white outline-none focus:border-red-500"
          >
            <option value="">Sin responsable asignado</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre} {u.apellidos || ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs px-4 py-2.5 rounded-xl"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-red-950/40"
          >
            <Plus className="w-4 h-4" />
            {editingId ? 'Guardar Cambios' : 'Crear Área'}
          </button>
        </div>
      </form>

      {/* Grid de Áreas con Imagen */}
      {loading ? (
        <div className="flex justify-center items-center py-20 text-slate-500 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-red-500" />
          <span>Cargando catálogo...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {areas.map((a) => {
            const bgImg = getAreaImage(a.nombre);
            return (
              <div 
                key={a.id} 
                className={`bg-[#121824]/90 border rounded-2xl overflow-hidden flex flex-col justify-between transition-all backdrop-blur-md hover:-translate-y-1 shadow-xl ${
                  a.activo ? 'border-slate-800 hover:border-red-500/40' : 'border-slate-800/40 opacity-60'
                }`}
              >
                {/* Cabecera con la Imagen Correspondiente */}
                <div 
                  className="h-36 bg-cover bg-center relative p-4 flex justify-between items-start"
                  style={{ 
                    backgroundImage: `linear-gradient(to bottom, rgba(7,10,15,0.2), rgba(18,24,36,0.95)), url('${bgImg}')` 
                  }}
                >
                  <div className="w-9 h-9 rounded-xl bg-[#0B0F17]/80 backdrop-blur-md flex items-center justify-center text-red-500 border border-slate-800 shadow-md">
                    <Layers className="w-4 h-4" />
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleEstadoArea(a.id, a.activo)}
                    className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border backdrop-blur-md shadow-md ${
                      a.activo
                        ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/50'
                        : 'bg-slate-900/80 text-slate-500 border-slate-800'
                    }`}
                  >
                    {a.activo ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {a.activo ? 'Activa' : 'Inactiva'}
                  </button>
                </div>

                {/* Contenido */}
                <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">{a.nombre}</h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed min-h-[32px]">
                      {a.descripcion || 'Sin descripción asignada.'}
                    </p>
                  </div>

                  <div className="bg-[#0B0F17] border border-slate-800/60 p-3 rounded-xl flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-slate-500" /> Responsable:
                    </span>
                    <span className="font-semibold text-slate-200">
                      {a.usuarios ? `${a.usuarios.nombre} ${a.usuarios.apellidos || ''}` : 'Sin asignar'}
                    </span>
                  </div>

                  <div className="flex justify-end items-center gap-2 pt-2 border-t border-slate-800/60">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(a)}
                      className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg text-xs flex items-center gap-1 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteArea(a)}
                      className="p-2 text-red-400 hover:text-red-300 hover:bg-red-950/50 rounded-lg text-xs flex items-center gap-1 transition-colors"
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