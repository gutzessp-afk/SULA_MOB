'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Layers, Plus, UserCheck, Edit3, Trash2, CheckCircle, XCircle, AlertCircle, Loader2, Upload, FileImage, X } from 'lucide-react';

interface Usuario {
  id: string;
  nombre: string;
  apellidos?: string;
}

interface Area {
  id: string;
  nombre: string;
  descripcion?: string;
  imagen_url?: string;
  responsable_id?: string;
  activo: boolean;
  usuarios?: Usuario | null;
}

export default function ActividadesPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Estados Formulario (Crear/Editar)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [imagenUrl, setImagenUrl] = useState('');
  const [responsableId, setResponsableId] = useState('');
  
  // Archivo local seleccionado
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Cargar lista de usuarios
  const fetchUsuarios = useCallback(async () => {
    const { data } = await supabase.from('usuarios').select('id, nombre, apellidos').eq('activo', true);
    if (data) setUsuarios(data as Usuario[]);
  }, []);

  // Cargar Áreas
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

  // Manejo de Selección / Arrastre de Archivos
  const handleFileChange = (file: File | undefined) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona un archivo de imagen válido (PNG, JPG, WEBP).');
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleFileChange(file);
  };

  // Subida de imagen a Supabase Storage
  const uploadImageToStorage = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `areas/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('areas_imagenes')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('areas_imagenes')
        .getPublicUrl(filePath);

      return publicUrlData.publicUrl;
    } catch (err) {
      console.error('Error al subir imagen a Supabase Storage:', err);
      return null;
    }
  };

  // Guardar / Editar Área
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;

    setUploadingImage(true);

    try {
      let finalImageUrl = imagenUrl;

      // Si hay un archivo seleccionado de la computadora, se sube primero
      if (selectedFile) {
        const uploadedUrl = await uploadImageToStorage(selectedFile);
        if (uploadedUrl) {
          finalImageUrl = uploadedUrl;
        }
      }

      const payload = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        imagen_url: finalImageUrl || null,
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
    } finally {
      setUploadingImage(false);
    }
  }

  function handleStartEdit(area: Area) {
    setEditingId(area.id);
    setNombre(area.nombre);
    setDescripcion(area.descripcion || '');
    setImagenUrl(area.imagen_url || '');
    setPreviewUrl(area.imagen_url || null);
    setSelectedFile(null);
    setResponsableId(area.responsable_id || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setEditingId(null);
    setNombre('');
    setDescripcion('');
    setImagenUrl('');
    setSelectedFile(null);
    setPreviewUrl(null);
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

  return (
    <div className="p-8 space-y-6 bg-[#0B0F17] min-h-screen text-slate-100">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Catálogo de Áreas y Procesos</h1>
          <p className="text-xs text-slate-400 mt-1">Configura las estaciones de trabajo del flujo productivo.</p>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-950/80 border border-red-500/50 p-4 rounded-xl flex items-center gap-3 text-sm text-red-200">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Formulario Crear / Editar */}
      <form onSubmit={handleSubmit} className="bg-[#121824] border border-slate-800 p-6 rounded-2xl space-y-5 shadow-xl">
        <h2 className="text-sm font-bold uppercase text-slate-400">
          {editingId ? 'Editar Área / Proceso' : 'Registrar Nueva Estación'}
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            placeholder="Nombre de la estación (Ej: Ensamble, Empaque)"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500"
            required
          />
          <input
            type="text"
            placeholder="Descripción del proceso..."
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500"
          />
          <select
            value={responsableId}
            onChange={(e) => setResponsableId(e.target.value)}
            className="bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500"
          >
            <option value="">Sin responsable asignado</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre} {u.apellidos || ''}
              </option>
            ))}
          </select>
        </div>

        {/* Zona de Drag & Drop para Imagen */}
        <div>
          <label className="text-xs text-slate-400 block mb-1.5 font-medium">Imagen de Portada de la Estación</label>
          
          {previewUrl ? (
            <div className="relative w-full h-36 rounded-xl overflow-hidden border border-slate-800 bg-slate-900 group">
              <img src={previewUrl} alt="Vista previa" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => { setSelectedFile(null); setPreviewUrl(null); setImagenUrl(''); }}
                  className="bg-red-600 text-white p-2 rounded-full hover:bg-red-700 transition-colors flex items-center gap-1 text-xs font-semibold"
                >
                  <X className="w-4 h-4" /> Cambiar Imagen
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 ${
                isDragging
                  ? 'border-red-500 bg-red-950/20'
                  : 'border-slate-800 bg-[#0B0F17] hover:border-slate-700'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400">
                <Upload className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Arrastra y suelta tu imagen aquí, o navega en tu equipo</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Soporta PNG, JPG o WEBP</p>
              </div>
              <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3.5 py-1.5 rounded-lg font-medium transition-colors mt-1">
                Seleccionar Archivo
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e.target.files?.[0])}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm px-4 py-2.5 rounded-lg"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={uploadingImage}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold text-sm px-6 py-2.5 rounded-lg flex items-center gap-2 shadow-lg shadow-red-950/30 disabled:opacity-50"
          >
            {uploadingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {uploadingImage ? 'Guardando Imagen...' : editingId ? 'Guardar Cambios' : 'Crear Área'}
          </button>
        </div>
      </form>

      {/* Grid de Áreas */}
      {loading ? (
        <div className="flex justify-center items-center py-20 text-slate-500 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-red-500" />
          <span>Cargando catálogo...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {areas.map((a) => (
            <div 
              key={a.id} 
              className={`bg-[#121824] border rounded-2xl overflow-hidden flex flex-col justify-between transition-all ${
                a.activo ? 'border-slate-800 hover:border-slate-700' : 'border-slate-800/40 opacity-60'
              }`}
            >
              {/* Header con Imagen */}
              <div 
                className="h-36 bg-cover bg-center relative p-4 flex justify-between items-start bg-slate-900"
                style={{ 
                  backgroundImage: a.imagen_url 
                    ? `linear-gradient(to bottom, rgba(11,15,23,0.3), rgba(18,24,36,0.95)), url('${a.imagen_url}')`
                    : 'linear-gradient(to bottom, rgba(11,15,23,0.5), rgba(18,24,36,0.95))'
                }}
              >
                <div className="w-9 h-9 rounded-xl bg-[#0B0F17]/80 backdrop-blur-md flex items-center justify-center text-red-500 border border-slate-800">
                  {a.imagen_url ? <FileImage className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
                </div>

                <button
                  type="button"
                  onClick={() => toggleEstadoArea(a.id, a.activo)}
                  className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border backdrop-blur-md ${
                    a.activo
                      ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/50'
                      : 'bg-slate-900/80 text-slate-500 border-slate-800'
                  }`}
                >
                  {a.activo ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {a.activo ? 'Activa' : 'Inactiva'}
                </button>
              </div>

              {/* Contenido de la Tarjeta */}
              <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">{a.nombre}</h3>
                  <p className="text-xs text-slate-400 mt-1 min-h-[32px]">
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
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg text-xs flex items-center gap-1"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteArea(a)}
                    className="p-2 text-red-400 hover:text-red-300 hover:bg-red-950/50 rounded-lg text-xs flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}