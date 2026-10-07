'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Plus, Search, FileUp, FileText, Loader2, FolderPlus, ListFilter, Trash2, Eye, X, Calendar, User, MapPin, Download, Layers } from 'lucide-react';
import { parsePedidoPdf } from '@/lib/parse-pedido';
import { generarPdfPedido } from '@/lib/generar-pdf-pedido';
import { useDebounce } from '@/hooks/useDebounce';

interface PartidaItem {
  cantidad: number;
  clave: string;
  unidad: string;
  descripcion: string;
  precio: number;
}

interface ProductoDB {
  id: string;
  nombre: string;
  cantidad: number;
  progreso: number;
}

interface Area { id: string; nombre: string; peso: number; }

interface Proyecto {
  id: string;
  codigo: string;
  nombre: string;
  cliente?: string;
  descripcion?: string;
  prioridad: string;
  progreso: number;
}

export default function ProyectosPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'lista' | 'crear'>('lista');
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [areasDisponibles, setAreasDisponibles] = useState<Area[]>([]);

  // Formulario — campos del Pedido Data
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [cliente, setCliente] = useState('');
  const [fecha, setFecha] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [referencia, setReferencia] = useState('');
  const [elaboradoPor, setElaboradoPor] = useState('');
  const [prioridad, setPrioridad] = useState('media');
  const [partidas, setPartidas] = useState<PartidaItem[]>([{ cantidad: 1, clave: '', unidad: 'Pieza', descripcion: '', precio: 0 }]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  // Modal Vista de Pedido (solo lectura — la "hoja" del pedido)
  const [viewProyecto, setViewProyecto] = useState<Proyecto | null>(null);
  const [viewProductos, setViewProductos] = useState<ProductoDB[]>([]);
  const [loadingView, setLoadingView] = useState(false);

  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [pdfSuccess, setPdfSuccess] = useState('');
  const [rawPdfText, setRawPdfText] = useState('');
  const [showRawText, setShowRawText] = useState(false);

  const loadDependencies = useCallback(async () => {
    const { data: aData } = await supabase.from('areas').select('id, nombre, peso').eq('activo', true);
    if (aData) setAreasDisponibles(aData as Area[]);
  }, []);

  const fetchProyectos = useCallback(async () => {
    const { data } = await supabase
      .from('proyectos')
      .select('*')
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

  const addPartida = () => {
    setPartidas([...partidas, { cantidad: 1, clave: '', unidad: 'Pieza', descripcion: '', precio: 0 }]);
  };

  const removePartida = (index: number) => {
    if (partidas.length === 1) return;
    setPartidas(partidas.filter((_, i) => i !== index));
  };

  const updatePartida = (index: number, field: keyof PartidaItem, value: string | number) => {
    const updated = [...partidas];
    updated[index] = { ...updated[index], [field]: value };
    setPartidas(updated);
  };

  const toggleArea = (id: string) => {
    setSelectedAreas(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  const handleEliminarProyecto = async (proyecto: Proyecto) => {
    const confirmacion = window.confirm(
      `¿Estás seguro de que deseas dar de baja o eliminar el proyecto "${proyecto.nombre}" (${proyecto.codigo})?\n\nEsta acción eliminará todos los registros y avances asociados.`
    );

    if (!confirmacion) return;

    try {
      const { error } = await supabase.from('proyectos').delete().eq('id', proyecto.id);

      if (error) {
        alert('Error al eliminar el proyecto: ' + error.message);
      } else {
        alert('El proyecto se ha dado de baja correctamente.');
        await fetchProyectos();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      alert('Ocurrió un error inesperado: ' + msg);
    }
  };

  async function handleCrearProyecto(e: React.FormEvent) {
    e.preventDefault();
    const validPartidas = partidas.filter(p => p.descripcion.trim().length > 0);
    if (!nombre.trim() || !codigo.trim() || validPartidas.length === 0) {
      alert('Por favor ingresa código, nombre y al menos 1 partida con descripción.');
      return;
    }

    const { data: projectData, error } = await supabase
      .from('proyectos')
      .insert([{
        codigo,
        nombre,
        cliente,
        prioridad,
        progreso: 0,
        descripcion: [
          fecha && `Fecha: ${fecha}`,
          fechaEntrega && `Entrega: ${fechaEntrega}`,
          referencia && `Ref: ${referencia}`,
          elaboradoPor && `Elaboró: ${elaboradoPor}`,
        ].filter(Boolean).join(' | ') || undefined,
      }])
      .select()
      .single();

    if (error || !projectData) {
      alert('Error al crear proyecto: ' + error?.message);
      return;
    }

    const prodInserts = validPartidas.map(p => ({
      proyecto_id: projectData.id,
      nombre: `[${p.clave}] ${p.descripcion}`,
      cantidad: p.cantidad,
      progreso: 0
    }));

    const { data: insertedProducts } = await supabase.from('proyecto_productos').insert(prodInserts).select();

    if (insertedProducts && selectedAreas.length > 0) {
      const matrizInserts: { 
        producto_id: string; 
        area_id: string; 
        porcentaje: number; 
        completado: boolean;
        piezas_totales: number;
        piezas_completadas: number;
      }[] = [];

      insertedProducts.forEach(prod => {
        selectedAreas.forEach(areaId => {
          matrizInserts.push({ 
            producto_id: prod.id, 
            area_id: areaId, 
            porcentaje: 0, 
            completado: false,
            piezas_totales: prod.cantidad || 0,
            piezas_completadas: 0
          });
        });
      });
      await supabase.from('producto_area_avance').insert(matrizInserts);
    }

    // === Guardar también en la tabla 'partidas' (sistema BOM/Despiece) ===
    // proyecto_productos se sigue llenando arriba por compatibilidad con el sistema anterior.
    const partidaInserts = validPartidas.map((p, idx) => ({
      proyecto_id: projectData.id,
      clave: p.clave || `P${idx + 1}`,
      descripcion: p.descripcion,
      cantidad: p.cantidad,
      precio_unitario: p.precio || 0,
      importe: (p.precio || 0) * p.cantidad,
      orden: idx + 1,
      progreso: 0,
    }));
    const { error: partidasError } = await supabase
      .from('partidas')
      .insert(partidaInserts);
    if (partidasError) {
      alert('El proyecto se creó, pero no se pudieron guardar las partidas para el despiece: ' + partidasError.message);
    }

    setCodigo(''); setNombre(''); setCliente(''); setFecha(''); setFechaEntrega('');
    setReferencia(''); setElaboradoPor('');
    setPartidas([{ cantidad: 1, clave: '', unidad: 'Pieza', descripcion: '', precio: 0 }]);
    setSelectedAreas([]);
    await fetchProyectos();
    setActiveTab('lista');
  }

  // Abrir modal de VISTA del pedido (hoja de datos, solo lectura)
  const openVistaPedido = async (prj: Proyecto) => {
    setViewProyecto(prj);
    setLoadingView(true);

    const { data: prodData } = await supabase
      .from('proyecto_productos')
      .select('*')
      .eq('proyecto_id', prj.id);

    setViewProductos((prodData || []) as ProductoDB[]);
    setLoadingView(false);
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingPdf(true);
    setPdfSuccess('');

    try {
      const pedido = await parsePedidoPdf(file);

      setCodigo(pedido.numero_pedido ? `PED-${pedido.numero_pedido}` : '');
      setNombre(pedido.numero_pedido ? `Pedido ${pedido.numero_pedido}` : file.name.replace('.pdf', ''));
      setCliente(pedido.cliente || '');
      setFecha(pedido.fecha || '');
      setFechaEntrega(pedido.fecha_entrega || '');
      setReferencia(pedido.referencia_sucursal || '');
      setElaboradoPor(pedido.elaborado_por || '');
      setRawPdfText(pedido._raw_text || '');

      if (pedido.partidas.length > 0) {
        setPartidas(pedido.partidas.map(p => ({
          cantidad: p.cantidad,
          clave: p.clave,
          unidad: p.unidad,
          descripcion: p.descripcion,
          precio: p.precio || 0,
        })));
      }

      // Campos vacíos para diagnóstico
      const camposVacios: string[] = [];
      if (!pedido.fecha_entrega) camposVacios.push('Fecha Entrega');
      if (!pedido.elaborado_por) camposVacios.push('Elaborado Por');
      if (!pedido.referencia_sucursal) camposVacios.push('Referencia');
      if (!pedido.cliente) camposVacios.push('Cliente');

      const warningMsg = camposVacios.length > 0
        ? ` (⚠ No detectados: ${camposVacios.join(', ')})`
        : '';

      setPdfSuccess(`PDF "${file.name}" procesado — ${pedido.partidas.length} partidas detectadas.${warningMsg}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setPdfSuccess('');
      alert('Error al procesar PDF: ' + msg);
    } finally {
      setIsParsingPdf(false);
    }
  };

  const handleLimpiarFormulario = () => {
    setCodigo('');
    setNombre('');
    setCliente('');
    setFecha('');
    setFechaEntrega('');
    setReferencia('');
    setElaboradoPor('');
    setPrioridad('media');
    setPartidas([{ cantidad: 1, clave: '', unidad: 'Pieza', descripcion: '', precio: 0 }]);
    setSelectedAreas([]);
    setPdfSuccess('');
    setRawPdfText('');
    setShowRawText(false);
  };

  const handleDescargarPdf = () => {
    const pedido = {
      numero_pedido: codigo.replace(/^PED-/, ''),
      cliente,
      fecha,
      fecha_entrega: fechaEntrega,
      referencia_sucursal: referencia,
      elaborado_por: elaboradoPor,
      partidas,
    };
    generarPdfPedido(pedido, partidas);
  };

  // El filtro espera 300 ms sin teclear y solo se recalcula si cambian la lista o la búsqueda
  const searchDebounced = useDebounce(search, 300);
  const filtrados = useMemo(() => {
    const term = searchDebounced.trim().toLowerCase();
    if (!term) return proyectos;
    return proyectos.filter(p =>
      p.nombre?.toLowerCase().includes(term) ||
      p.codigo?.toLowerCase().includes(term) ||
      p.cliente?.toLowerCase().includes(term)
    );
  }, [proyectos, searchDebounced]);

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto px-2 sm:px-0 pb-8">
      {/* HEADER PRINCIPAL */}
      <div className="relative overflow-hidden rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] px-4 py-5 sm:p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold text-white tracking-wide leading-tight">Órdenes y Cálculo Ponderado de Avances</h1>
          <p className="text-[11px] sm:text-xs text-white/65 mt-1">Da de alta pedidos y controla su avance desde el despiece de cada orden.</p>
        </div>

        <div className="flex w-full md:w-auto bg-white/[0.07] p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-white/15 backdrop-blur-sm gap-1">
          <button
            onClick={() => setActiveTab('lista')}
            className={`max-sm:min-h-[44px] flex-1 md:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2.5 rounded-lg sm:rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'lista'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/50'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            <ListFilter className="w-4 h-4" /> Catálogo ({proyectos.length})
          </button>

          <button
            onClick={() => setActiveTab('crear')}
            className={`max-sm:min-h-[44px] flex-1 md:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2.5 rounded-lg sm:rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'crear'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/50'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            <FolderPlus className="w-4 h-4" /> Nueva Orden
          </button>
        </div>
      </div>

      {activeTab === 'lista' ? (
        <div className="relative overflow-hidden rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]">
          {/* Buscador */}
          <div className="px-4 py-3 sm:p-4 border-b border-white/10 flex items-center gap-3 bg-white/[0.03]">
            <Search className="w-4 h-4 text-white/50 flex-shrink-0" />
            <input
              type="text"
              placeholder="Buscar por código, cliente o proyecto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="max-sm:text-base max-sm:min-h-[44px] bg-transparent text-sm text-white outline-none w-full placeholder:text-white/40"
            />
          </div>

          {/* ── VISTA MÓVIL: Tarjetas ── */}
          <div className="xl:hidden divide-y divide-white/10">
            {filtrados.map(p => (
              <div key={p.id} className="p-4 space-y-3 active:bg-white/[0.04] transition-colors">
                {/* Fila superior: Código + Prioridad */}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-blue-400 font-bold text-sm">{p.codigo}</span>
                  <span className="px-2.5 py-0.5 rounded-lg border bg-white/10 text-white/60 border-white/10 uppercase text-[10px] font-bold tracking-wider">
                    {p.prioridad}
                  </span>
                </div>

                {/* Nombre del proyecto */}
                <p className="text-white font-semibold text-[15px] leading-snug">{p.nombre}</p>

                {/* Cliente */}
                {p.cliente && (
                  <p className="text-white/50 text-xs flex items-center gap-1.5">
                    <User className="w-3 h-3" /> {p.cliente}
                  </p>
                )}

                {/* Barra de progreso */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-black/40 rounded-full overflow-hidden border border-white/10">
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 via-indigo-400 to-emerald-400 transition-all duration-500"
                      style={{ width: `${p.progreso}%` }}
                    />
                  </div>
                  <span className="font-mono text-emerald-400 font-bold text-xs w-10 text-right">{p.progreso}%</span>
                </div>

                {/* Botones de acción */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => openVistaPedido(p)}
                    className="max-sm:min-h-[44px] w-10 h-10 bg-blue-500/15 hover:bg-blue-500/30 text-blue-300 border border-blue-400/30 rounded-xl inline-flex items-center justify-center backdrop-blur-md transition-all"
                    title="Ver pedido"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => router.push(`/admin/proyectos/${p.id}`)}
                    className="max-sm:min-h-[44px] flex-1 bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/30 text-xs px-3 py-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 backdrop-blur-md transition-all"
                  >
                    <Layers className="w-3.5 h-3.5 text-cyan-400" /> Despiece
                  </button>
                  <button
                    onClick={() => handleEliminarProyecto(p)}
                    className="max-sm:min-h-[44px] bg-red-500/20 hover:bg-red-500/35 text-red-200 border border-red-400/30 text-xs px-3 py-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 backdrop-blur-md transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" /> Baja
                  </button>
                </div>
              </div>
            ))}
            {filtrados.length === 0 && (
              <div className="p-8 text-center text-white/40 text-sm">No se encontraron órdenes.</div>
            )}
          </div>

          {/* ── VISTA DESKTOP: Tabla ── */}
          <div className="hidden xl:block overflow-x-auto">
            <table className="w-full text-left text-sm text-white/80">
              <thead className="bg-white/[0.07] text-white/60 uppercase text-[11px] font-bold tracking-wider">
                <tr>
                  <th className="p-4">Código</th>
                  <th className="p-4">Proyecto</th>
                  <th className="p-4">Cliente</th>
                  <th className="p-4">Prioridad</th>
                  <th className="p-4">Progreso Global</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filtrados.map(p => (
                  <tr key={p.id} className="hover:bg-white/[0.06] transition-colors">
                    <td className="p-4 font-mono text-blue-400 font-bold">{p.codigo}</td>
                    <td className="p-4 font-semibold text-white">{p.nombre}</td>
                    <td className="p-4 text-white/60">{p.cliente || '—'}</td>
                    <td className="p-4 uppercase text-[10px] font-bold">
                      <span className="px-2.5 py-1 rounded-lg border bg-white/10 text-white/70 border-white/10">
                        {p.prioridad}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-32 h-2.5 bg-black/40 rounded-full overflow-hidden border border-white/10">
                          <div
                            className="h-full bg-gradient-to-r from-sky-500 via-indigo-400 to-emerald-400 transition-all duration-500"
                            style={{ width: `${p.progreso}%` }}
                          />
                        </div>
                        <span className="font-mono text-emerald-400 font-bold text-xs">{p.progreso}%</span>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end items-center gap-2">
                        <button
                          onClick={() => openVistaPedido(p)}
                          className="max-sm:min-h-[44px] w-8 h-8 bg-blue-500/15 hover:bg-blue-500/30 text-blue-300 border border-blue-400/30 rounded-lg inline-flex items-center justify-center backdrop-blur-md transition-all"
                          title="Ver pedido"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => router.push(`/admin/proyectos/${p.id}`)}
                          className="max-sm:min-h-[44px] bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/30 text-xs px-3.5 py-1.5 rounded-xl inline-flex items-center gap-1.5 backdrop-blur-md transition-all"
                        >
                          <Layers className="w-3.5 h-3.5 text-cyan-400" /> Despiece
                        </button>
                        <button
                          onClick={() => handleEliminarProyecto(p)}
                          className="max-sm:min-h-[44px] bg-red-500/20 hover:bg-red-500/35 text-red-200 border border-red-400/30 text-xs px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 backdrop-blur-md transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" /> Dar de Baja
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]">
            <div className="flex flex-col sm:flex-row items-center gap-4 p-5 sm:p-6">
              <div className="w-12 h-12 rounded-2xl bg-blue-950/60 border border-blue-500/40 flex items-center justify-center text-blue-400 flex-shrink-0">
                {isParsingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
              </div>
              <div className="text-center sm:text-left flex-1">
                <h3 className="font-bold text-white text-sm">Cargar Pedido PDF</h3>
                <p className="text-xs text-white/60 mt-0.5">Sube el PDF del pedido Click Balance para auto-llenar todos los campos.</p>
              </div>
              <label className="max-sm:min-h-[44px] cursor-pointer bg-blue-600 hover:bg-blue-700 text-white text-xs px-5 py-3 rounded-2xl font-bold inline-flex items-center gap-2 shadow-lg shadow-blue-950/50 flex-shrink-0 transition-colors">
                <FileUp className="w-4 h-4" /> Cargar Orden PDF
                <input type="file" accept="application/pdf" onChange={handlePdfUpload} className="hidden" />
              </label>
            </div>
            {pdfSuccess && (
              <div className="px-5 pb-4 -mt-1 space-y-2">
                <p className="text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 inline-block">{pdfSuccess}</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleLimpiarFormulario}
                    className="max-sm:min-h-[44px] text-xs text-red-400 font-bold bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2 hover:bg-red-500/20 transition-colors inline-flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Eliminar Proyecto
                  </button>
                  {rawPdfText && (
                    <button
                      type="button"
                      onClick={() => setShowRawText(!showRawText)}
                      className="max-sm:min-h-[44px] text-xs text-sky-400 font-bold bg-sky-500/10 border border-sky-500/20 rounded-xl px-4 py-2 hover:bg-sky-500/20 transition-colors inline-flex items-center gap-1.5"
                    >
                      <FileText className="w-3.5 h-3.5" /> {showRawText ? 'Ocultar' : 'Ver'} Texto PDF
                    </button>
                  )}
                </div>
                {showRawText && rawPdfText && (
                  <div className="bg-black/60 border border-white/10 rounded-xl p-4 max-h-60 overflow-y-auto">
                    <p className="text-[10px] text-white/40 mb-2 uppercase font-bold">Texto extraído del PDF (para diagnóstico):</p>
                    <pre className="text-xs text-white/70 whitespace-pre-wrap font-mono leading-relaxed">{rawPdfText}</pre>
                  </div>
                )}
              </div>
            )}
          </div>

          <form onSubmit={handleCrearProyecto} className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-5 sm:p-8 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] space-y-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/60 border-b border-white/10 pb-3">
              Alta de Proyecto — Datos del Pedido
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-white/60 block mb-1">No. Pedido / Código *</label>
                <input type="text" placeholder="Ej: PED-3486" value={codigo} onChange={e => setCodigo(e.target.value)} className="max-sm:text-base max-sm:min-h-[44px] w-full h-[48px] rounded-2xl border border-white/20 bg-white/[0.07] px-4 text-sm text-white outline-none focus:border-white/50 transition-colors" required />
              </div>
              <div>
                <label className="text-xs text-white/60 block mb-1">Nombre Proyecto *</label>
                <input type="text" placeholder="Ej: Pedido 3486 Vento" value={nombre} onChange={e => setNombre(e.target.value)} className="max-sm:text-base max-sm:min-h-[44px] w-full h-[48px] rounded-2xl border border-white/20 bg-white/[0.07] px-4 text-sm text-white outline-none focus:border-white/50 transition-colors" required />
              </div>
              <div>
                <label className="text-xs text-white/60 block mb-1">Prioridad</label>
                <select value={prioridad} onChange={e => setPrioridad(e.target.value)} className="max-sm:text-base max-sm:min-h-[44px] w-full h-[48px] rounded-2xl border border-white/20 bg-[#121824] px-4 text-sm text-white outline-none focus:border-white/50 transition-colors">
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-white/60 block mb-1 flex items-center gap-1.5"><User className="w-3 h-3" /> Cliente</label>
                <input type="text" placeholder="Ej: WATTS SUSTENTABLES" value={cliente} onChange={e => setCliente(e.target.value)} className="max-sm:text-base max-sm:min-h-[44px] w-full h-[48px] rounded-2xl border border-white/20 bg-white/[0.07] px-4 text-sm text-white outline-none focus:border-white/50 transition-colors" />
              </div>
              <div>
                <label className="text-xs text-white/60 block mb-1 flex items-center gap-1.5"><User className="w-3 h-3" /> Elaborado Por</label>
                <input type="text" placeholder="Ej: Alejandra Palacios" value={elaboradoPor} onChange={e => setElaboradoPor(e.target.value)} className="max-sm:text-base max-sm:min-h-[44px] w-full h-[48px] rounded-2xl border border-white/20 bg-white/[0.07] px-4 text-sm text-white outline-none focus:border-white/50 transition-colors" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-white/60 block mb-1 flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Fecha</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="max-sm:text-base max-sm:min-h-[44px] w-full h-[48px] rounded-2xl border border-white/20 bg-[#121824] px-4 text-sm text-white outline-none focus:border-white/50 transition-colors" />
              </div>
              <div>
                <label className="text-xs text-white/60 block mb-1 flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Fecha de Entrega</label>
                <input type="date" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} className="max-sm:text-base max-sm:min-h-[44px] w-full h-[48px] rounded-2xl border border-white/20 bg-[#121824] px-4 text-sm text-white outline-none focus:border-white/50 transition-colors" />
              </div>
              <div>
                <label className="text-xs text-white/60 block mb-1 flex items-center gap-1.5"><MapPin className="w-3 h-3" /> Referencia / Sucursal</label>
                <input type="text" placeholder="Ej: VENTO" value={referencia} onChange={e => setReferencia(e.target.value)} className="max-sm:text-base max-sm:min-h-[44px] w-full h-[48px] rounded-2xl border border-white/20 bg-white/[0.07] px-4 text-sm text-white outline-none focus:border-white/50 transition-colors" />
              </div>
            </div>

            <div className="space-y-3 bg-white/[0.03] p-4 sm:p-5 rounded-2xl border border-white/10">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <label className="text-xs font-bold uppercase text-white/80">Partidas del Pedido</label>
                <button type="button" onClick={addPartida} className="max-sm:min-h-[44px] text-xs text-sky-400 font-bold hover:underline flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Agregar Partida
                </button>
              </div>

              {partidas.map((partida, index) => (
                <div key={index} className="bg-white/[0.02] p-3 rounded-xl border border-white/10 space-y-2">
                  {/* Fila 1: Cantidad, Clave, Unidad, Precio unitario (opcional) + botón eliminar */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="w-[100px]">
                      <input
                        type="number"
                        min="1"
                        value={partida.cantidad}
                        onChange={e => updatePartida(index, 'cantidad', parseInt(e.target.value) || 1)}
                        className="max-sm:text-base max-sm:min-h-[44px] w-full h-[42px] rounded-xl border border-white/20 bg-white/[0.07] px-3 text-sm text-white outline-none text-center font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:opacity-0 [&::-webkit-inner-spin-button]:opacity-0"
                      />
                    </div>
                    <div className="w-[130px]">
                      <input
                        type="text"
                        placeholder="Clave"
                        value={partida.clave}
                        onChange={e => updatePartida(index, 'clave', e.target.value)}
                        className="max-sm:text-base max-sm:min-h-[44px] w-full h-[42px] rounded-xl border border-white/20 bg-white/[0.07] px-2 text-sm text-white outline-none font-mono text-xs"
                      />
                    </div>
                    <div className="w-[90px]">
                      <select
                        value={partida.unidad}
                        onChange={e => updatePartida(index, 'unidad', e.target.value)}
                        className="max-sm:text-base max-sm:min-h-[44px] w-full h-[42px] rounded-xl border border-white/20 bg-[#121824] px-2 text-xs text-white outline-none"
                      >
                        <option value="Pieza">Pieza</option>
                        <option value="Juego">Juego</option>
                        <option value="Metro">Metro</option>
                        <option value="Kg">Kg</option>
                      </select>
                    </div>
                    <div className="w-[120px]">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Precio unit."
                        value={partida.precio || ''}
                        onChange={e => updatePartida(index, 'precio', parseFloat(e.target.value) || 0)}
                        className="max-sm:text-base max-sm:min-h-[44px] w-full h-[42px] rounded-xl border border-white/20 bg-white/[0.07] px-3 text-sm text-white outline-none font-mono placeholder:text-white/30 placeholder:font-sans placeholder:text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:opacity-0 [&::-webkit-inner-spin-button]:opacity-0"
                      />
                    </div>
                    <div className="ml-auto">
                      {partidas.length > 1 && (
                        <button type="button" onClick={() => removePartida(index)} className="max-sm:min-h-[44px] p-2 text-red-400 hover:bg-red-500/20 rounded-xl transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Fila 2: Descripción — ancho completo para que no se corte */}
                  <div>
                    <input
                      type="text"
                      placeholder="Descripción del producto..."
                      value={partida.descripcion}
                      onChange={e => updatePartida(index, 'descripcion', e.target.value)}
                      className="max-sm:text-base max-sm:min-h-[44px] w-full h-[42px] rounded-xl border border-white/20 bg-white/[0.07] px-3 text-sm text-white outline-none"
                      required
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-white/60 block">Estaciones Operativas Asignadas</label>
              <div className="flex flex-wrap gap-2">
                {areasDisponibles.map(a => (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => toggleArea(a.id)}
                    className={`max-sm:min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      selectedAreas.includes(a.id)
                        ? 'bg-sky-500/20 text-sky-300 border-sky-400/50 shadow-md'
                        : 'bg-white/[0.07] text-white/70 border-white/10'
                    }`}
                  >
                    {selectedAreas.includes(a.id) ? '✓ ' : '+ '}{a.nombre} ({a.peso}%)
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end items-center gap-4 pt-4 border-t border-white/10">
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleDescargarPdf}
                  className="max-sm:min-h-[44px] w-full sm:w-auto bg-emerald-500/90 text-white hover:bg-emerald-400 font-bold text-xs px-8 py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg transition-colors"
                >
                  <Download className="w-4 h-4" /> Descargar PDF
                </button>
                <button type="submit" className="max-sm:min-h-[44px] w-full sm:w-auto bg-white text-neutral-900 hover:bg-white/90 font-bold text-xs px-8 py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg transition-colors">
                  <Plus className="w-4 h-4" /> Guardar Orden de Proyecto
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ═══ MODAL VISTA DE PEDIDO (la "hoja" del pedido, solo lectura) ═══ */}
      {viewProyecto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-[#0E131F] border border-white/20 rounded-[20px] sm:rounded-[30px] p-5 sm:p-8 space-y-5 shadow-2xl my-4 sm:my-8 max-h-[90vh] overflow-y-auto">
            {/* Botón cerrar */}
            <button
              onClick={() => setViewProyecto(null)}
              className="max-sm:min-h-[44px] absolute top-5 right-5 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Encabezado tipo hoja */}
            <div className="text-center border-b border-white/10 pb-5">
              <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-400/30 px-4 py-1.5 rounded-full mb-3">
                <FileText className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold text-blue-300 uppercase tracking-wider">Pedido</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">{viewProyecto.nombre}</h2>
              <p className="text-sm font-mono text-blue-400 mt-1">{viewProyecto.codigo}</p>
            </div>

            {/* Datos generales */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3.5">
                <p className="text-[10px] text-white/40 uppercase font-bold mb-1">Cliente</p>
                <p className="text-sm text-white font-semibold">{viewProyecto.cliente || '—'}</p>
              </div>
              <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3.5">
                <p className="text-[10px] text-white/40 uppercase font-bold mb-1">Prioridad</p>
                <p className={`text-sm font-bold uppercase ${
                  viewProyecto.prioridad === 'urgente' ? 'text-red-400' :
                  viewProyecto.prioridad === 'alta' ? 'text-amber-400' :
                  viewProyecto.prioridad === 'media' ? 'text-sky-400' : 'text-white/60'
                }`}>{viewProyecto.prioridad}</p>
              </div>
              <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3.5">
                <p className="text-[10px] text-white/40 uppercase font-bold mb-1">Progreso Global</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-black/40 rounded-full overflow-hidden border border-white/10">
                    <div className="h-full bg-gradient-to-r from-sky-500 via-indigo-400 to-emerald-400 transition-all" style={{ width: `${viewProyecto.progreso}%` }} />
                  </div>
                  <span className="text-sm font-mono font-bold text-emerald-400">{viewProyecto.progreso}%</span>
                </div>
              </div>
              {/* Parsear la descripcion que contiene fecha, entrega, ref, elaboró */}
              {viewProyecto.descripcion && (() => {
                const campos = viewProyecto.descripcion!.split(' | ');
                return campos.map((campo, i) => {
                  const [label, ...rest] = campo.split(': ');
                  const valor = rest.join(': ');
                  return (
                    <div key={i} className="bg-white/[0.04] border border-white/10 rounded-xl p-3.5">
                      <p className="text-[10px] text-white/40 uppercase font-bold mb-1">{label}</p>
                      <p className="text-sm text-white font-semibold">{valor || '—'}</p>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Lista de partidas/productos */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white/60 flex items-center gap-2">
                <ListFilter className="w-4 h-4 text-blue-400" /> Partidas del Pedido
              </h3>

              {loadingView ? (
                <div className="py-8 flex justify-center items-center gap-2 text-white/50">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-400" /> Cargando partidas...
                </div>
              ) : viewProductos.length === 0 ? (
                <p className="text-sm text-white/40 text-center py-6">No se encontraron partidas para este pedido.</p>
              ) : (
                <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-white/[0.06] text-white/50 uppercase text-[10px] font-bold tracking-wider">
                      <tr>
                        <th className="p-3 w-10 text-center">#</th>
                        <th className="p-3">Producto / Descripción</th>
                        <th className="p-3 text-center">Cant.</th>
                        <th className="p-3 text-center">Avance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {viewProductos.map((prod, idx) => (
                        <tr key={prod.id} className="text-white/80">
                          <td className="p-3 text-center font-mono text-white/40 text-xs">{idx + 1}</td>
                          <td className="p-3 font-semibold text-white text-[13px]">{prod.nombre}</td>
                          <td className="p-3 text-center font-mono font-bold text-sky-300">{prod.cantidad}</td>
                          <td className="p-3 text-center">
                            <span className={`font-mono font-bold text-xs ${
                              prod.progreso >= 100 ? 'text-emerald-400' :
                              prod.progreso > 0 ? 'text-sky-400' : 'text-white/30'
                            }`}>{prod.progreso}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Botón para ir al despiece desde aquí */}
            <div className="flex justify-center pt-2">
              <button
                onClick={() => router.push(`/admin/proyectos/${viewProyecto.id}`)}
                className="max-sm:min-h-[44px] bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 text-xs px-5 py-2.5 rounded-xl border border-cyan-400/30 inline-flex items-center gap-2 backdrop-blur-md transition-all"
              >
                <Layers className="w-4 h-4 text-cyan-400" /> Ir al Despiece
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}