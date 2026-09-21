'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { Bell, MessageSquare, CheckCircle, AlertTriangle, Clock, Loader2, User } from 'lucide-react';

interface Notificacion {
  id: string;
  mensaje: string;
  tipo: string;
  leido: boolean;
  created_at: string;
  usuarios?: { nombre: string; apellidos?: string; };
  areas?: { nombre: string; };
}

export default function NotificacionesPage() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotificaciones = useCallback(async () => {
    const { data, error } = await supabase
      .from('notificaciones')
      .select(`*, usuarios (nombre, apellidos), areas (nombre)`)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setNotificaciones(data as Notificacion[]);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setLoading(true);
      await fetchNotificaciones();
      if (isMounted) setLoading(false);
    }

    void loadData();

    return () => { isMounted = false; };
  }, [fetchNotificaciones]);

  const marcarComoLeida = async (id: string) => {
    const { error } = await supabase.from('notificaciones').update({ leido: true }).eq('id', id);
    if (!error) void fetchNotificaciones();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      
      {/* HEADER LIQUID GLASS CON IMAGEN TÉCNICA 'corte_madera.png' */}
      <div 
        className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-6 sm:p-8 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-cover bg-center"
        style={{ backgroundImage: `linear-gradient(to right, rgba(11,15,23,0.95), rgba(18,24,36,0.8)), url('/images/corte_madera.png')` }}
      >
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-3">
            <Bell className="w-6 h-6 text-red-500" />
            Centro de Notificaciones y Mensajes
          </h1>
          <p className="text-xs text-white/65 mt-1">
            Incidencias y avisos reportados en tiempo real por los operadores de planta.
          </p>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL CON BANNER LATERAL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LISTADO DE NOTIFICACIONES LIQUID GLASS */}
        <div className="lg:col-span-2 space-y-4">
          {loading ? (
            <div className="flex justify-center items-center py-20 text-white/50 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-red-500" />
              <span>Cargando avisos de operadores...</span>
            </div>
          ) : notificaciones.length === 0 ? (
            <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-12 text-center shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] space-y-3">
              <MessageSquare className="w-10 h-10 text-white/30 mx-auto" />
              <h3 className="text-base font-bold text-white">Sin mensajes pendientes</h3>
              <p className="text-xs text-white/50">No hay notificaciones no leídas en el sistema.</p>
            </div>
          ) : (
            notificaciones.map((n) => (
              <div
                key={n.id}
                className={`relative overflow-hidden rounded-[26px] border border-white/20 p-5 flex items-start justify-between gap-4 transition-all shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] ${
                  n.leido ? 'bg-white/[0.03] opacity-60' : 'bg-red-950/20 border-red-500/40'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                    n.tipo === 'alerta' ? 'bg-red-950/80 text-red-400 border-red-500/50' : 'bg-white/10 text-white border-white/15'
                  }`}>
                    {n.tipo === 'alerta' ? <AlertTriangle className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-white/50" />
                        {n.usuarios ? `${n.usuarios.nombre} ${n.usuarios.apellidos || ''}` : 'Operador'}
                      </span>
                      {n.areas && (
                        <span className="text-[10px] bg-white/10 text-white/80 px-2.5 py-0.5 rounded-full font-semibold border border-white/10">
                          Área: {n.areas.nombre}
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

                {!n.leido && (
                  <button
                    type="button"
                    onClick={() => marcarComoLeida(n.id)}
                    className="bg-white/10 hover:bg-white/20 text-white text-xs px-3.5 py-2 rounded-xl flex items-center gap-1 transition-colors shrink-0 border border-white/15"
                  >
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    Marcar leído
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* TARJETA VISUAL CON 'nueva.png' */}
        <div className="relative overflow-hidden rounded-[26px] border border-white/20 bg-white/[0.05] p-4 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] h-80 flex flex-col justify-end">
          <Image src="/images/nueva.png" alt="Planta SULA MOB" fill className="object-cover rounded-2xl opacity-75" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F17] via-transparent to-transparent rounded-2xl" />
          <div className="relative z-10 p-2 space-y-1">
            <span className="text-[10px] uppercase tracking-wider font-bold text-red-400 bg-black/60 px-2.5 py-1 rounded-full border border-white/10 backdrop-blur-md inline-block">
              Centro de Comunicación
            </span>
            <p className="text-xs text-white/80">Atención inmediata a reportes de operadores en talleres.</p>
          </div>
        </div>

      </div>
    </div>
  );
}