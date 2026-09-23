'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { Plus, Search, FileUp, FileText, Loader2, FolderPlus, ListFilter, Trash2, Eye, X, PieChart, Factory, Calendar, User, MapPin, Download, CheckCircle2 } from 'lucide-react';
import { parsePedidoPdf } from '@/lib/parse-pedido';
import { generarPdfPedido } from '@/lib/generar-pdf-pedido';

interface PartidaItem {
  cantidad: number;
  clave: string;
  unidad: string;
  descripcion: string;
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

interface AvanceEstadoArea {
  porcentaje: number;
  piezas_totales: number;
  piezas_completadas: number;
}

export default function ProyectosPage() {
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
  const [partidas, setPartidas] = useState<PartidaItem[]>([{ cantidad: 1, clave: '', unidad: 'Pieza', descripcion: '' }]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  // Modal de Detalles Dashboard — Estado por Piezas y Porcentaje
  const [selectedProyecto, setSelectedProyecto] = useState<Proyecto | null>(null);
  const [modalProductos, setModalProductos] = useState<ProductoDB[]>([]);
  const [modalAvances, setModalAvances] = useState<Record<string, Record<string, AvanceEstadoArea>>>({});
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

  const addPartida = () => {
    setPartidas([...partidas, { cantidad: 1, clave: '', unidad: 'Pieza', descripcion: '' }]);
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

    setCodigo(''); setNombre(''); setCliente(''); setFecha(''); setFechaEntrega('');
    setReferencia(''); setElaboradoPor('');
    setPartidas([{ cantidad: 1, clave: '', unidad: 'Pieza', descripcion: '' }]);
    setSelectedAreas([]);
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

      const mapAvances: Record<string, Record<string, AvanceEstadoArea>> = {};
      (avancesData || []).forEach((item) => {
        if (!mapAvances[item.producto_id]) mapAvances[item.producto_id] = {};
        
        const prodMatch = prods.find(p => p.id === item.producto_id);
        const piezasTotales = item.piezas_totales !== undefined && item.piezas_totales !== null 
          ? item.piezas_totales 
          : (prodMatch?.cantidad || 0);
        const piezasCompletadas = item.piezas_completadas || (item.completado ? piezasTotales : 0);
        
        const pctCalculado = piezasTotales > 0 
          ? Math.min(100, Math.round((piezasCompletadas / piezasTotales) * 100))
          : (item.porcentaje || 0);

        mapAvances[item.producto_id][item.area_id] = {
          porcentaje: pctCalculado,
          piezas_totales: piezasTotales,
          piezas_completadas: piezasCompletadas
        };
      });
      setModalAvances(mapAvances);
    }

    setLoadingModal(false);
  };

  // CÁLCULO AUTOMÁTICO DE PORCENTAJE ACTUALIZANDO HECHAS Y/O META (PIEZAS TOTALES)
  const updateDatosArea = async (productoId: string, areaId: string, piezasHechasNuevas: number, piezasMetaNuevas: number) => {
    const metaValida = Math.max(0, piezasMetaNuevas);
    const hechasValidas = Math.max(0, Math.min(metaValida, piezasHechasNuevas));
    const nuevoPorcentaje = metaValida > 0 ? Math.min(100, Math.round((hechasValidas / metaValida) * 100)) : 0;

    await supabase
      .from('producto_area_avance')
      .update({ 
        piezas_completadas: hechasValidas,
        piezas_totales: metaValida,
        porcentaje: nuevoPorcentaje, 
        completado: nuevoPorcentaje >= 100 
      })
      .match({ producto_id: productoId, area_id: areaId });

    const updatedMap = { ...modalAvances };
    if (!updatedMap[productoId]) updatedMap[productoId] = {};
    updatedMap[productoId][areaId] = {
      porcentaje: nuevoPorcentaje,
      piezas_totales: metaValida,
      piezas_completadas: hechasValidas
    };
    setModalAvances(updatedMap);

    const totalProductosCount = modalProductos.length;
    const valorPorProducto = 100 / totalProductosCount;

    let sumaGlobalProyecto = 0;
    const updatedProductos = [...modalProductos];

    for (let i = 0; i < updatedProductos.length; i++) {
      const prod = updatedProductos[i];
      const areasOfProd = updatedMap[prod.id] || {};
      const areaIdsAsignadas = Object.keys(areasOfProd);

      let pesoTotalAreasAssigned = 0;
      let pesoAvanzadoProd = 0;

      areaIdsAsignadas.forEach(aId => {
        const areaObj = areasDisponibles.find(a => a.id === aId);
        const pesoEstacion = areaObj ? Number(areaObj.peso) : 14.28;
        pesoTotalAreasAssigned += pesoEstacion;
        pesoAvanzadoProd += pesoEstacion * ((areasOfProd[aId]?.porcentaje || 0) / 100);
      });

      const pctProducto = pesoTotalAreasAssigned > 0
        ? (pesoAvanzadoProd / pesoTotalAreasAssigned) * 100
        : 0;

      const pctRedondeado = Math.round(pctProducto);
      updatedProductos[i] = { ...prod, progreso: pctRedondeado };

      await supabase.from('proyecto_productos').update({ progreso: pctRedondeado }).eq('id', prod.id);
      sumaGlobalProyecto += (pctProducto * (valorPorProducto / 100));
    }

    setModalProductos(updatedProductos);

    const progresoFinalGlobal = Math.min(100, Math.round(sumaGlobalProyecto));

    if (selectedProyecto) {
      await supabase.from('proyectos').update({ progreso: progresoFinalGlobal }).eq('id', selectedProyecto.id);
      setSelectedProyecto({ ...selectedProyecto, progreso: progresoFinalGlobal });
      await fetchProyectos();
    }
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

      if (pedido.partidas.length > 0) {
        setPartidas(pedido.partidas.map(p => ({
          cantidad: p.cantidad,
          clave: p.clave,
          unidad: p.unidad,
          descripcion: p.descripcion,
        })));
      }

      setPdfSuccess(`PDF "${file.name}" procesado — ${pedido.partidas.length} partidas detectadas.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setPdfSuccess('');
      alert('Error al procesar PDF: ' + msg);
    } finally {
      setIsParsingPdf(false);
    }
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

  const filtrados = proyectos.filter(p =>
    p.nombre?.toLowerCase().includes(search.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(search.toLowerCase()) ||
    p.cliente?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      {/* HEADER PRINCIPAL */}
      <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Órdenes y Cálculo Ponderado de Avances</h1>
          <p className="text-xs text-white/65 mt-1">Modifica piezas fabricadas y metas por área para un ajuste dinámico de porcentaje.</p>
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
              placeholder="Buscar por código, cliente o proyecto..."
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
                  <th className="p-4 text-right">Acciones</th>
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
                      <div className="flex justify-end items-center gap-2">
                        <button
                          onClick={() => openProyectoDetalle(p)}
                          className="bg-white/10 hover:bg-white/20 text-white text-xs px-3.5 py-1.5 rounded-xl border border-white/15 inline-flex items-center gap-1.5 backdrop-blur-md transition-all"
                        >
                          <Eye className="w-3.5 h-3.5 text-sky-400" /> Capturar Piezas
                        </button>
                        <button
                          onClick={() => handleEliminarProyecto(p)}
                          className="bg-red-500/20 hover:bg-red-500/35 text-red-200 border border-red-400/30 text-xs px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 backdrop-blur-md transition-all"
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
              <div className="w-12 h-12 rounded-2xl bg-red-950/60 border border-red-500/40 flex items-center justify-center text-red-400 flex-shrink-0">
                {isParsingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
              </div>
              <div className="text-center sm:text-left flex-1">
                <h3 className="font-bold text-white text-sm">Cargar Pedido PDF</h3>
                <p className="text-xs text-white/60 mt-0.5">Sube el PDF del pedido Click Balance para auto-llenar todos los campos.</p>
              </div>
              <label className="cursor-pointer bg-red-600 hover:bg-red-700 text-white text-xs px-5 py-3 rounded-2xl font-bold inline-flex items-center gap-2 shadow-lg shadow-red-950/50 flex-shrink-0 transition-colors">
                <FileUp className="w-4 h-4" /> Cargar Orden PDF
                <input type="file" accept="application/pdf" onChange={handlePdfUpload} className="hidden" />
              </label>
            </div>
            {pdfSuccess && (
              <div className="px-5 pb-4 -mt-1">
                <p className="text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 inline-block">{pdfSuccess}</p>
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
                <input type="text" placeholder="Ej: PED-3486" value={codigo} onChange={e => setCodigo(e.target.value)} className="w-full h-[48px] rounded-2xl border border-white/20 bg-white/[0.07] px-4 text-sm text-white outline-none focus:border-white/50 transition-colors" required />
              </div>
              <div>
                <label className="text-xs text-white/60 block mb-1">Nombre Proyecto *</label>
                <input type="text" placeholder="Ej: Pedido 3486 Vento" value={nombre} onChange={e => setNombre(e.target.value)} className="w-full h-[48px] rounded-2xl border border-white/20 bg-white/[0.07] px-4 text-sm text-white outline-none focus:border-white/50 transition-colors" required />
              </div>
              <div>
                <label className="text-xs text-white/60 block mb-1">Prioridad</label>
                <select value={prioridad} onChange={e => setPrioridad(e.target.value)} className="w-full h-[48px] rounded-2xl border border-white/20 bg-[#121824] px-4 text-sm text-white outline-none focus:border-white/50 transition-colors">
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
                <input type="text" placeholder="Ej: WATTS SUSTENTABLES" value={cliente} onChange={e => setCliente(e.target.value)} className="w-full h-[48px] rounded-2xl border border-white/20 bg-white/[0.07] px-4 text-sm text-white outline-none focus:border-white/50 transition-colors" />
              </div>
              <div>
                <label className="text-xs text-white/60 block mb-1 flex items-center gap-1.5"><User className="w-3 h-3" /> Elaborado Por</label>
                <input type="text" placeholder="Ej: Alejandra Palacios" value={elaboradoPor} onChange={e => setElaboradoPor(e.target.value)} className="w-full h-[48px] rounded-2xl border border-white/20 bg-white/[0.07] px-4 text-sm text-white outline-none focus:border-white/50 transition-colors" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-white/60 block mb-1 flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Fecha</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-full h-[48px] rounded-2xl border border-white/20 bg-[#121824] px-4 text-sm text-white outline-none focus:border-white/50 transition-colors" />
              </div>
              <div>
                <label className="text-xs text-white/60 block mb-1 flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Fecha de Entrega</label>
                <input type="date" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} className="w-full h-[48px] rounded-2xl border border-white/20 bg-[#121824] px-4 text-sm text-white outline-none focus:border-white/50 transition-colors" />
              </div>
              <div>
                <label className="text-xs text-white/60 block mb-1 flex items-center gap-1.5"><MapPin className="w-3 h-3" /> Referencia / Sucursal</label>
                <input type="text" placeholder="Ej: VENTO" value={referencia} onChange={e => setReferencia(e.target.value)} className="w-full h-[48px] rounded-2xl border border-white/20 bg-white/[0.07] px-4 text-sm text-white outline-none focus:border-white/50 transition-colors" />
              </div>
            </div>

            <div className="space-y-3 bg-white/[0.03] p-4 sm:p-5 rounded-2xl border border-white/10">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <label className="text-xs font-bold uppercase text-white/80">Partidas del Pedido</label>
                <button type="button" onClick={addPartida} className="text-xs text-sky-400 font-bold hover:underline flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Agregar Partida
                </button>
              </div>

              {partidas.map((partida, index) => (
                <div key={index} className="flex flex-col sm:grid sm:grid-cols-[70px_120px_90px_1fr_40px] gap-2 bg-white/[0.02] sm:bg-transparent p-3 sm:p-0 rounded-xl sm:rounded-none border border-white/10 sm:border-0">
                  <div className="w-20 sm:w-auto">
                    <input
                      type="number"
                      min="1"
                      value={partida.cantidad}
                      onChange={e => updatePartida(index, 'cantidad', parseInt(e.target.value) || 1)}
                      className="w-full h-[42px] rounded-xl border border-white/20 bg-white/[0.07] px-2 text-sm text-white outline-none text-center font-bold"
                    />
                  </div>
                  <div className="flex-1 sm:flex-none">
                    <input
                      type="text"
                      placeholder="Clave"
                      value={partida.clave}
                      onChange={e => updatePartida(index, 'clave', e.target.value)}
                      className="w-full h-[42px] rounded-xl border border-white/20 bg-white/[0.07] px-2 text-sm text-white outline-none font-mono text-xs"
                    />
                  </div>
                  <div className="w-24 sm:w-auto">
                    <select
                      value={partida.unidad}
                      onChange={e => updatePartida(index, 'unidad', e.target.value)}
                      className="w-full h-[42px] rounded-xl border border-white/20 bg-[#121824] px-2 text-xs text-white outline-none"
                    >
                      <option value="Pieza">Pieza</option>
                      <option value="Juego">Juego</option>
                      <option value="Metro">Metro</option>
                      <option value="Kg">Kg</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="Descripción del producto..."
                      value={partida.descripcion}
                      onChange={e => updatePartida(index, 'descripcion', e.target.value)}
                      className="w-full h-[42px] rounded-xl border border-white/20 bg-white/[0.07] px-3 text-sm text-white outline-none"
                      required
                    />
                  </div>
                  <div className="flex justify-end sm:block">
                    {partidas.length > 1 && (
                      <button type="button" onClick={() => removePartida(index)} className="p-2 text-red-400 hover:bg-red-500/20 rounded-xl transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
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

            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-white/10">
              <div className="relative overflow-hidden rounded-2xl border border-white/10 h-24 w-full sm:w-48 flex-shrink-0">
                <Image src="/images/instalaciones.png" alt="Planta" fill className="object-cover opacity-60" />
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleDescargarPdf}
                  className="w-full sm:w-auto bg-emerald-500/90 text-white hover:bg-emerald-400 font-bold text-xs px-8 py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg transition-colors"
                >
                  <Download className="w-4 h-4" /> Descargar PDF
                </button>
                <button type="submit" className="w-full sm:w-auto bg-white text-neutral-900 hover:bg-white/90 font-bold text-xs px-8 py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg transition-colors">
                  <Plus className="w-4 h-4" /> Guardar Orden de Proyecto
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* MODAL DETALLES CON EDITABILIDAD EN HECHAS Y META DE PIEZAS */}
      {selectedProyecto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-5xl bg-[#0E131F] border border-white/20 rounded-[30px] p-6 sm:p-8 space-y-6 shadow-2xl my-8">
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
                <PieChart className="w-9 h-9 text-emerald-400" />
                <div>
                  <div className="text-2xl font-black text-emerald-400 font-mono">{selectedProyecto.progreso}%</div>
                  <div className="text-[10px] text-white/50 uppercase font-bold">Avance Global Recalculado</div>
                </div>
              </div>
            </div>

            {loadingModal ? (
              <div className="py-12 flex justify-center items-center gap-2 text-white/50">
                <Loader2 className="w-5 h-5 animate-spin text-sky-400" /> Cargando estación de trabajo...
              </div>
            ) : (
              <div className="space-y-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white/60 flex items-center gap-2">
                  <Factory className="w-4 h-4 text-sky-400" /> Captura de Piezas Fabricadas y Edición de Metas
                </h3>

                <div className="space-y-5 max-h-[460px] overflow-y-auto pr-1">
                  {modalProductos.map((prod) => {
                    const prodAvances = modalAvances[prod.id] || {};
                    return (
                      <div key={prod.id} className="p-5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-white/5 pb-3">
                          <div>
                            <h4 className="text-sm font-bold text-white">{prod.nombre}</h4>
                            <span className="text-[11px] text-white/50">Ordenadas en Pedido: <strong className="text-sky-300 font-mono">{prod.cantidad}</strong> unidades</span>
                          </div>
                          <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-xl border border-emerald-500/20">
                            Avance Producto: {prod.progreso || 0}%
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                          {areasDisponibles.map((area) => {
                            const datosArea = prodAvances[area.id] || { piezas_totales: prod.cantidad, piezas_completadas: 0, porcentaje: 0 };
                            const pctVal = datosArea.porcentaje;
                            const completado = pctVal >= 100;

                            return (
                              <div
                                key={area.id}
                                className={`p-3.5 rounded-xl border transition-all space-y-2.5 ${
                                  completado
                                    ? 'bg-emerald-500/10 border-emerald-400/40 text-white'
                                    : pctVal > 0
                                    ? 'bg-sky-500/10 border-sky-400/40 text-white'
                                    : 'bg-white/[0.03] border-white/10 text-white/60'
                                }`}
                              >
                                <div className="flex justify-between items-center text-xs">
                                  <span className="font-bold text-white flex items-center gap-1">
                                    {area.nombre}
                                    {completado && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                                  </span>
                                  <span className="text-[10px] text-white/40 font-mono">Peso: {area.peso}%</span>
                                </div>

                                {/* INPUTS EDITABLES: HECHAS Y META */}
                                <div className="flex items-center justify-between gap-2 bg-black/40 p-2 rounded-xl border border-white/10">
                                  <div className="flex flex-col">
                                    <span className="text-[9px] text-white/40 uppercase font-bold">Hechas</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max={datosArea.piezas_totales}
                                      value={datosArea.piezas_completadas}
                                      onChange={(e) => updateDatosArea(prod.id, area.id, Number(e.target.value), datosArea.piezas_totales)}
                                      className="w-16 h-8 bg-white/10 border border-white/20 rounded-lg text-center text-xs text-emerald-300 font-bold font-mono outline-none focus:border-emerald-400"
                                    />
                                  </div>

                                  <span className="text-white/30 font-bold mt-3">/</span>

                                  <div className="flex flex-col">
                                    <span className="text-[9px] text-white/40 uppercase font-bold">Meta</span>
                                    <input
                                      type="number"
                                      min="0"
                                      value={datosArea.piezas_totales}
                                      onChange={(e) => updateDatosArea(prod.id, area.id, datosArea.piezas_completadas, Number(e.target.value))}
                                      className="w-16 h-8 bg-white/10 border border-white/20 rounded-lg text-center text-xs text-sky-300 font-bold font-mono outline-none focus:border-sky-400"
                                    />
                                  </div>

                                  <div className="border-l border-white/10 pl-2 text-right">
                                    <span className="text-[9px] text-white/40 uppercase block font-bold">Avance</span>
                                    <span className="text-xs font-bold text-sky-400 font-mono">{pctVal}%</span>
                                  </div>
                                </div>

                                <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all duration-300 ${completado ? 'bg-emerald-400' : 'bg-sky-400'}`}
                                    style={{ width: `${pctVal}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
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