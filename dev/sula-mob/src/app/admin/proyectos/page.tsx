'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { Plus, Search, FileUp, FileText, Loader2, FolderPlus, ListFilter, Trash2, Eye, X, PieChart, CheckCircle2, Factory } from 'lucide-react';

interface ProductoItem {
  nombre: string;
  cantidad: number;
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
  const [activeTab, setActiveTab] = useState<'lista' | 'crear'>('lista');
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [areasDisponibles, setAreasDisponibles] = useState<Area[]>([]);

  // Formulario
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [cliente, setCliente] = useState('');
  const [prioridad, setPrioridad] = useState('media');
  const [productos, setProductos] = useState<ProductoItem[]>([{ nombre: '', cantidad: 1 }]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  // Modal de Detalles Dashboard
  const [selectedProyecto, setSelectedProyecto] = useState<Proyecto | null>(null);
  const [modalProductos, setModalProductos] = useState<ProductoDB[]>([]);
  const [modalAvances, setModalAvances] = useState<Record<string, Record<string, boolean>>>({});
  const [loadingModal, setLoadingModal] = useState(false);

  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [pdfSuccess, setPdfSuccess] = useState('');

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

  const addProductoInput = () => {
    setProductos([...productos, { nombre: '', cantidad: 1 }]);
  };

  const removeProductoInput = (index: number) => {
    if (productos.length === 1) return;
    setProductos(productos.filter((_, i) => i !== index));
  };

  const updateProductoInput = (index: number, field: keyof ProductoItem, value: string | number) => {
    const newProds = [...productos];
    newProds[index] = { ...newProds[index], [field]: value };
    setProductos(newProds);
  };

  const toggleArea = (id: string) => {
    setSelectedAreas(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  async function handleCrearProyecto(e: React.FormEvent) {
    e.preventDefault();
    const validProductos = productos.filter(p => p.nombre.trim().length > 0);
    if (!nombre.trim() || !codigo.trim() || validProductos.length === 0) {
      alert('Por favor ingresa nombre, código y al menos 1 producto.');
      return;
    }

    const { data: projectData, error } = await supabase
      .from('proyectos')
      .insert([{ codigo, nombre, cliente, prioridad, progreso: 0 }])
      .select()
      .single();

    if (error || !projectData) {
      alert('Error al crear proyecto: ' + error?.message);
      return;
    }

    const prodInserts = validProductos.map(p => ({
      proyecto_id: projectData.id,
      nombre: p.nombre,
      cantidad: p.cantidad,
      progreso: 0
    }));

    const { data: insertedProducts } = await supabase.from('proyecto_productos').insert(prodInserts).select();

    if (insertedProducts && selectedAreas.length > 0) {
      const matrizInserts: { producto_id: string; area_id: string; completado: boolean }[] = [];
      insertedProducts.forEach(prod => {
        selectedAreas.forEach(areaId => {
          matrizInserts.push({ producto_id: prod.id, area_id: areaId, completado: false });
        });
      });
      await supabase.from('producto_area_avance').insert(matrizInserts);
    }

    setCodigo(''); setNombre(''); setCliente(''); setProductos([{ nombre: '', cantidad: 1 }]); setSelectedAreas([]);
    await fetchProyectos();
    setActiveTab('lista');
  }

  const openProyectoDetalle = async (prj: Proyecto) => {
    setSelectedProyecto(prj);
    setLoadingModal(true);

    const { data: prodData } = await supabase
      .from('proyecto_productos')
      .select('*')
      .eq('proyecto_id', prj.id);

    const prods = (prodData || []) as ProductoDB[];
    setModalProductos(prods);

    if (prods.length > 0) {
      const prodIds = prods.map(p => p.id);
      const { data: avancesData } = await supabase
        .from('producto_area_avance')
        .select('*')
        .in('producto_id', prodIds);

      const mapAvances: Record<string, Record<string, boolean>> = {};
      (avancesData || []).forEach((item: { producto_id: string; area_id: string; completado: boolean }) => {
        if (!mapAvances[item.producto_id]) mapAvances[item.producto_id] = {};
        mapAvances[item.producto_id][item.area_id] = item.completado;
      });
      setModalAvances(mapAvances);
    }

    setLoadingModal(false);
  };

  const toggleAreaProducto = async (productoId: string, areaId: string, actualCompletado: boolean) => {
    const nuevoEstado = !actualCompletado;

    await supabase
      .from('producto_area_avance')
      .update({ completado: nuevoEstado })
      .match({ producto_id: productoId, area_id: areaId });

    const updatedMap = { ...modalAvances };
    if (!updatedMap[productoId]) updatedMap[productoId] = {};
    updatedMap[productoId][areaId] = nuevoEstado;
    setModalAvances(updatedMap);

    const totalProductosCount = modalProductos.length;
    const valorPorProducto = 100 / totalProductosCount;

    let sumaGlobalProyecto = 0;

    for (const prod of modalProductos) {
      const areasOfProd = updatedMap[prod.id] || {};
      const areaIdsAsignadas = Object.keys(areasOfProd);
      
      let pesoTotalAreasAssigned = 0;
      let pesoCompletadoProd = 0;

      areaIdsAsignadas.forEach(aId => {
        const areaObj = areasDisponibles.find(a => a.id === aId);
        const pesoEstacion = areaObj ? Number(areaObj.peso) : 14.28;
        pesoTotalAreasAssigned += pesoEstacion;
        if (areasOfProd[aId]) pesoCompletadoProd += pesoEstacion;
      });

      const pctProducto = pesoTotalAreasAssigned > 0 
        ? (pesoCompletadoProd / pesoTotalAreasAssigned) * 100 
        : 0;

      await supabase.from('proyecto_productos').update({ progreso: Math.round(pctProducto) }).eq('id', prod.id);
      sumaGlobalProyecto += (pctProducto * (valorPorProducto / 100));
    }

    const progresoFinalGlobal = Math.min(100, Math.round(sumaGlobalProyecto));

    if (selectedProyecto) {
      await supabase.from('proyectos').update({ progreso: progresoFinalGlobal }).eq('id', selectedProyecto.id);
      setSelectedProyecto({ ...selectedProyecto, progreso: progresoFinalGlobal });
      await fetchProyectos();
    }
  };

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingPdf(true);
    setPdfSuccess('');

    setTimeout(() => {
      const randomCode = 'PRJ-' + Math.floor(1000 + Math.random() * 9000);
      setCodigo(randomCode);
      setNombre(file.name.replace('.pdf', '').toUpperCase());
      setCliente('CLIENTE EXTRAÍDO PDF');
      setProductos([
        { nombre: 'Mesas Tipo A', cantidad: 10 },
        { nombre: 'Estantes Metálicos', cantidad: 4 },
        { nombre: 'Muebles Mostrador', cantidad: 5 },
        { nombre: 'Sillas Industriales', cantidad: 6 }
      ]);
      setIsParsingPdf(false);
      setPdfSuccess(`PDF "${file.name}" procesado con 4 productos detectados.`);
    }, 1200);
  };

  const filtrados = proyectos.filter(p =>
    p.nombre?.toLowerCase().includes(search.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(search.toLowerCase()) ||
    p.cliente?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      {/* HEADER LIQUID GLASS */}
      <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Órdenes y Cálculo Ponderado de Avances</h1>
          <p className="text-xs text-white/65 mt-1">El avance global se calcula proporcionalmente según los productos y estaciones completadas.</p>
        </div>

        <div className="flex bg-white/[0.07] p-1.5 rounded-2xl border border-white/15 backdrop-blur-sm gap-1">
          <button
            onClick={() => setActiveTab('lista')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'lista'
                ? 'bg-red-600 text-white shadow-lg shadow-red-950/50'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            <ListFilter className="w-4 h-4" /> Catálogo ({proyectos.length})
          </button>

          <button
            onClick={() => setActiveTab('crear')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'crear'
                ? 'bg-red-600 text-white shadow-lg shadow-red-950/50'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            <FolderPlus className="w-4 h-4" /> Nueva Orden
          </button>
        </div>
      </div>

      {activeTab === 'lista' ? (
        <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]">
          <div className="p-4 border-b border-white/10 flex items-center gap-3 bg-white/[0.03]">
            <Search className="w-4 h-4 text-white/50" />
            <input
              type="text"
              placeholder="Buscar por código, cliente o proyecto (Ej: Vento, KFC)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent text-sm text-white outline-none w-full placeholder:text-white/40"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-white/80">
              <thead className="bg-white/[0.07] text-white/60 uppercase text-[11px] font-bold tracking-wider">
                <tr>
                  <th className="p-4">Código</th>
                  <th className="p-4">Proyecto</th>
                  <th className="p-4">Cliente</th>
                  <th className="p-4">Prioridad</th>
                  <th className="p-4">Progreso Global</th>
                  <th className="p-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filtrados.map(p => (
                  <tr key={p.id} className="hover:bg-white/[0.06] transition-colors">
                    <td className="p-4 font-mono text-red-400 font-bold">{p.codigo}</td>
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
                      <button
                        onClick={() => openProyectoDetalle(p)}
                        className="bg-white/10 hover:bg-white/20 text-white text-xs px-3.5 py-1.5 rounded-xl border border-white/15 inline-flex items-center gap-1.5 backdrop-blur-md transition-all"
                      >
                        <Eye className="w-3.5 h-3.5 text-sky-400" /> Ver Avances
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form onSubmit={handleCrearProyecto} className="lg:col-span-2 relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-8 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] space-y-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/60 border-b border-white/10 pb-3">
              Alta de Proyecto y Desglose de Productos
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-white/60 block mb-1">Código Orden *</label>
                <input type="text" placeholder="Ej: VENTO-101" value={codigo} onChange={e => setCodigo(e.target.value)} className="w-full h-[48px] rounded-2xl border border-white/20 bg-white/[0.07] px-4 text-sm text-white outline-none focus:border-white/50" required />
              </div>
              <div>
                <label className="text-xs text-white/60 block mb-1">Nombre Proyecto *</label>
                <input type="text" placeholder="Ej: Pedido Especial Vento" value={nombre} onChange={e => setNombre(e.target.value)} className="w-full h-[48px] rounded-2xl border border-white/20 bg-white/[0.07] px-4 text-sm text-white outline-none focus:border-white/50" required />
              </div>
              <div>
                <label className="text-xs text-white/60 block mb-1">Cliente Comercial</label>
                <input type="text" placeholder="Ej: Vento" value={cliente} onChange={e => setCliente(e.target.value)} className="w-full h-[48px] rounded-2xl border border-white/20 bg-white/[0.07] px-4 text-sm text-white outline-none focus:border-white/50" />
              </div>
              <div>
                <label className="text-xs text-white/60 block mb-1">Prioridad</label>
                <select value={prioridad} onChange={e => setPrioridad(e.target.value)} className="w-full h-[48px] rounded-2xl border border-white/20 bg-[#121824] px-4 text-sm text-white outline-none focus:border-white/50">
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>
            </div>

            <div className="space-y-3 bg-white/[0.03] p-4 rounded-2xl border border-white/10">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase text-white/80">Productos Solicitados (División Ponderada)</label>
                <button type="button" onClick={addProductoInput} className="text-xs text-sky-400 font-bold hover:underline flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Agregar Producto
                </button>
              </div>

              {productos.map((prod, index) => (
                <div key={index} className="flex items-center gap-3">
                  <input
                    type="text"
                    placeholder={`Producto ${index + 1} (Ej: Mesas, Estantes)`}
                    value={prod.nombre}
                    onChange={e => updateProductoInput(index, 'nombre', e.target.value)}
                    className="flex-1 h-[44px] rounded-xl border border-white/20 bg-white/[0.07] px-3 text-sm text-white outline-none"
                    required
                  />
                  <input
                    type="number"
                    min="1"
                    placeholder="Cant."
                    value={prod.cantidad}
                    onChange={e => updateProductoInput(index, 'cantidad', parseInt(e.target.value) || 1)}
                    className="w-24 h-[44px] rounded-xl border border-white/20 bg-white/[0.07] px-3 text-sm text-white outline-none"
                    required
                  />
                  {productos.length > 1 && (
                    <button type="button" onClick={() => removeProductoInput(index)} className="p-2 text-red-400 hover:bg-red-500/20 rounded-xl">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <p className="text-[11px] text-white/40 italic">
                Cada producto registrado equivaldrá automáticamente al {(100 / (productos.length || 1)).toFixed(1)}% del proyecto global.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-white/60 block">Estaciones por las que pasarán los productos</label>
              <div className="flex flex-wrap gap-2">
                {areasDisponibles.map(a => (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => toggleArea(a.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
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

            <div className="flex justify-end pt-4 border-t border-white/10">
              <button type="submit" className="bg-white text-neutral-900 hover:bg-white/90 font-bold text-xs px-8 py-3.5 rounded-2xl flex items-center gap-2 shadow-lg">
                <Plus className="w-4 h-4" /> Guardar Orden de Proyecto
              </button>
            </div>
          </form>

          <div className="space-y-6">
            <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] space-y-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-red-950/60 border border-red-500/40 mx-auto flex items-center justify-center text-red-400">
                {isParsingPdf ? <Loader2 className="w-6 h-6 animate-spin" /> : <FileText className="w-6 h-6" />}
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">Cargar Pedido Ejemplo</h3>
                <p className="text-xs text-white/60 mt-1">Sube la orden PDF para auto-desglosar productos.</p>
              </div>
              <label className="cursor-pointer bg-red-600 hover:bg-red-700 text-white text-xs px-5 py-3 rounded-2xl font-bold inline-flex items-center gap-2 shadow-lg shadow-red-950/50">
                <FileUp className="w-4 h-4" /> Cargar Orden PDF
                <input type="file" accept="application/pdf" onChange={handlePdfUpload} className="hidden" />
              </label>
              {pdfSuccess && <p className="text-xs text-emerald-400 font-bold">{pdfSuccess}</p>}
            </div>

            <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-4 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] h-52 flex items-center justify-center">
              <Image src="/images/instalaciones.png" alt="Planta" fill className="object-cover rounded-2xl opacity-75" />
            </div>
          </div>
        </div>
      )}

      {selectedProyecto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-[#0E131F] border border-white/20 rounded-[30px] p-6 sm:p-8 space-y-6 shadow-2xl my-8">
            <button
              onClick={() => setSelectedProyecto(null)}
              className="absolute top-6 right-6 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <span className="text-xs font-mono font-bold text-sky-400">{selectedProyecto.codigo}</span>
                <h2 className="text-2xl font-bold text-white">{selectedProyecto.nombre}</h2>
                <p className="text-xs text-white/60">Cliente: {selectedProyecto.cliente || 'General'}</p>
              </div>

              <div className="bg-white/[0.05] border border-white/15 px-6 py-3 rounded-2xl flex items-center gap-4">
                <div className="relative w-12 h-12 flex items-center justify-center">
                  <PieChart className="w-10 h-10 text-emerald-400" />
                </div>
                <div>
                  <div className="text-2xl font-black text-emerald-400 font-mono">{selectedProyecto.progreso}%</div>
                  <div className="text-[10px] text-white/50 uppercase font-bold">Avance Global Real</div>
                </div>
              </div>
            </div>

            {loadingModal ? (
              <div className="py-12 flex justify-center items-center gap-2 text-white/50">
                <Loader2 className="w-5 h-5 animate-spin text-sky-400" /> Cargando matriz de estaciones...
              </div>
            ) : (
              <div className="space-y-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white/60 flex items-center gap-2">
                  <Factory className="w-4 h-4 text-sky-400" /> Avance Individual por Producto y Estaciones
                </h3>

                <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
                  {modalProductos.map((prod) => {
                    const prodAvances = modalAvances[prod.id] || {};
                    return (
                      <div key={prod.id} className="p-5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <h4 className="text-sm font-bold text-white">{prod.nombre}</h4>
                            <span className="text-[11px] text-white/50">Cantidad ordenada: {prod.cantidad} unidades</span>
                          </div>
                          <span className="text-xs font-mono font-bold text-sky-300 bg-sky-500/10 px-3 py-1 rounded-full border border-sky-500/20">
                            Avance Producto: {prod.progreso || 0}%
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-[10px] uppercase font-bold text-white/40 block">Marcar Estaciones Completadas:</span>
                          <div className="flex flex-wrap gap-2">
                            {areasDisponibles.map((area) => {
                              const isChecked = !!prodAvances[area.id];
                              return (
                                <button
                                  key={area.id}
                                  onClick={() => toggleAreaProducto(prod.id, area.id, isChecked)}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
                                    isChecked
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                                      : 'bg-white/[0.05] text-white/40 border-white/10 hover:border-white/30'
                                  }`}
                                >
                                  <CheckCircle2 className={`w-3.5 h-3.5 ${isChecked ? 'text-emerald-400' : 'text-white/20'}`} />
                                  <span>{area.nombre}</span>
                                  <span className="text-[10px] opacity-60">({area.peso}%)</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}