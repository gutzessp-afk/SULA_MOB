'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { Bell, MessageSquare, AlertTriangle, Clock, Loader2, Send, Factory, CheckCircle2 } from 'lucide-react';

interface NotificacionOperador {
  id: string;
  mensaje: string;
  tipo: string;
  leido: boolean;
  created_at: string;
  areas?: { nombre: string; };
}

interface Area {
  id: string;
  nombre: string;
}

export default function NotificacionesOperatorPage() {
  const [misNotificaciones, setMisNotificaciones] = useState<NotificacionOperador[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Formulario del Operador
  const [mensaje, setMensaje] = useState('');
  const [tipo, setTipo] = useState<'info' | 'alerta'>('info');
  const [selectedArea, setSelectedArea] = useState<string>('');

  const fetchMisNotificaciones = useCallback(async () => {
    const { data, error } = await supabase
      .from('notificaciones')
      .select(`*, areas (nombre)`)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setMisNotificaciones(data as NotificacionOperador[]);
    }
  }, []);

  const fetchAreas = useCallback(async () => {
    const { data } = await supabase.from('areas').select('id, nombre').eq('activo', true);
    if (data) setAreas(data as Area[]);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setLoading(true);
      await Promise.all([fetchMisNotificaciones(), fetchAreas()]);
      if (isMounted) setLoading(false);
    }

    void loadData();

    return () => { isMounted = false; };
  }, [fetchMisNotificaciones, fetchAreas]);

  const handleEnviarNotificacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mensaje.trim()) {
      alert('Escribe el detalle del aviso antes de enviar.');
      return;
    }

    setSending(true);

    try {
      const { error } = await supabase.from('notificaciones').insert([
        {
          mensaje,
          tipo,
          area_id: selectedArea || null,
          leido: false,
        }
      ]);

      if (error) {
        alert('Error al enviar reporte: ' + error.message);
      } else {
        setMensaje('');
        setSelectedArea('');
        setTipo('info');
        await fetchMisNotificaciones();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      alert('Error inesperado: ' + msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8 text-white">
      
      {/* HEADER TIPO OPERADOR */}
      <div 
        className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 sm:p-8 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-cover bg-center"
        style={{ backgroundImage: `linear-gradient(to right, rgba(11,15,23,0.95), rgba(18,24,36,0.8)), url('/images/corte_madera.png')` }}
      >
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-3">
            <Bell className="w-6 h-6 text-red-500 animate-pulse" />
            Reportes y Notificaciones de Operador
          </h1>
          <p className="text-xs text-white/65 mt-1">
            Envía avisos o alertas urgentes de tu estación de trabajo a administración.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* PANEL PARA ENVIAR NUEVA NOTIFICACIÓN */}
        <div className="lg:col-span-1 space-y-4">
          <form 
            onSubmit={handleEnviarNotificacion}
            className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-2xl backdrop-blur-2xl space-y-4"
          >
            <h2 className="text-sm font-bold text-white uppercase tracking-wider border-b border-white/10 pb-3 flex items-center gap-2">
              <Send className="w-4 h-4 text-sky-400" /> Nuevo Aviso a Administración
            </h2>

            <div>
              <label className="text-xs text-white/60 block mb-1 font-semibold">Tipo de Reporte</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTipo('info')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${
                    tipo === 'info'
                      ? 'bg-sky-500/20 text-sky-300 border-sky-400/50 shadow-md'
                      : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" /> Mensaje
                </button>
                <button
                  type="button"
                  onClick={() => setTipo('alerta')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${
                    tipo === 'alerta'
                      ? 'bg-red-500/20 text-red-300 border-red-400/50 shadow-md'
                      : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> Alerta Urgente
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-white/60 block mb-1 font-semibold flex items-center gap-1">
                <Factory className="w-3.5 h-3.5 text-sky-400" /> Estación de Trabajo (Área)
              </label>
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="w-full h-11 rounded-xl border border-white/20 bg-[#121824] px-3 text-xs text-white outline-none focus:border-sky-400 transition-colors"
              >
                <option value="">Selecciona tu área (Opcional)</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-white/60 block mb-1 font-semibold">Mensaje o Detalle *</label>
              <textarea
                rows={4}
                placeholder="Ejemplo: Falta material en la estación / Falla mecánica en máquina..."
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/[0.07] p-3 text-xs text-white outline-none focus:border-sky-400 transition-colors placeholder:text-white/30 resize-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={sending}
              className="w-full bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-red-950/50 transition-all disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar a Administración
            </button>
          </form>

          {/* BANNER VISUAL */}
          <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-4 shadow-xl h-44 flex flex-col justify-end">
            <Image src="/images/nueva.png" alt="Planta SULA MOB" fill className="object-cover rounded-2xl opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F17] via-transparent to-transparent rounded-2xl" />
            <div className="relative z-10 p-2 space-y-1">
              <span className="text-[10px] uppercase font-bold text-red-400 bg-black/60 px-2.5 py-1 rounded-full border border-white/10 backdrop-blur-md inline-block">
                Canal Directo
              </span>
              <p className="text-[11px] text-white/80">Comunica contratiempos inmediatamente para evitar paros.</p>
            </div>
          </div>
        </div>

        {/* HISTORIAL DE REPORTES ENVIADOS POR EL OPERADOR */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-sky-400" /> Mis Reportes Enviados
          </h2>

          {loading ? (
            <div className="flex justify-center items-center py-20 text-white/50 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-red-500" />
              <span>Cargando reportes...</span>
            </div>
          ) : misNotificaciones.length === 0 ? (
            <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-12 text-center shadow-2xl backdrop-blur-2xl space-y-3">
              <MessageSquare className="w-10 h-10 text-white/30 mx-auto" />
              <h3 className="text-base font-bold text-white">Sin reportes enviados</h3>
              <p className="text-xs text-white/50">Aún no has registrado notificaciones desde este panel.</p>
            </div>
          ) : (
            misNotificaciones.map((n) => (
              <div
                key={n.id}
                className={`relative overflow-hidden rounded-[26px] border border-white/20 p-5 flex items-start justify-between gap-4 transition-all shadow-xl backdrop-blur-2xl ${
                  n.leido ? 'bg-white/[0.03]' : 'bg-red-950/20 border-red-500/40'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                    n.tipo === 'alerta' ? 'bg-red-950/80 text-red-400 border-red-500/50' : 'bg-white/10 text-white border-white/15'
                  }`}>
                    {n.tipo === 'alerta' ? <AlertTriangle className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {n.areas ? (
                        <span className="text-[10px] bg-sky-500/20 text-sky-300 px-2.5 py-0.5 rounded-full font-bold border border-sky-500/30">
                          Área: {n.areas.nombre}
                        </span>
                      ) : (
                        <span className="text-[10px] bg-white/10 text-white/70 px-2.5 py-0.5 rounded-full font-bold">
                          General
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white/90 leading-relaxed">{n.mensaje}</p>
                    <div className="flex items-center gap-1 text-[11px] text-white/50 pt-1">
                      <Clock className="w-3 h-3" />
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* ESTADO VISTO / PENDIENTE POR EL ADMIN */}
                <div className="shrink-0">
                  {n.leido ? (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Revisado por Admin
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Pendiente de revisión
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}