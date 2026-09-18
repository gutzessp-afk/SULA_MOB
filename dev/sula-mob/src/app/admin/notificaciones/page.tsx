'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Bell, MessageSquare, CheckCircle, AlertTriangle, Clock, Loader2, User } from 'lucide-react';

interface Notificacion {
  id: string;
  mensaje: string;
  tipo: string;
  leido: boolean;
  created_at: string;
  usuarios?: {
    nombre: string;
    apellidos?: string;
  };
  areas?: {
    nombre: string;
  };
}

export default function NotificacionesPage() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotificaciones = useCallback(async () => {
    const { data, error } = await supabase
      .from('notificaciones')
      .select(`
        *,
        usuarios (nombre, apellidos),
        areas (nombre)
      `)
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
      if (isMounted) {
        setLoading(false);
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [fetchNotificaciones]);

  const marcarComoLeida = async (id: string) => {
    const { error } = await supabase
      .from('notificaciones')
      .update({ leido: true })
      .eq('id', id);

    if (!error) {
      void fetchNotificaciones();
    }
  };

  return (
    <div className="p-8 space-y-6 bg-[#0B0F17] min-h-screen text-slate-100">
      <div className="flex justify-between items-center border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Bell className="w-6 h-6 text-red-500" />
            Centro de Notificaciones y Mensajes
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Avisos, incidencias y comentarios enviados por los operadores en estaciones de trabajo.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20 text-slate-500 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-red-500" />
          <span>Cargando mensajes del personal...</span>
        </div>
      ) : notificaciones.length === 0 ? (
        <div className="bg-[#121824] border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <MessageSquare className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-300">Sin mensajes pendientes</h3>
          <p className="text-xs text-slate-500">No hay notificaciones ni avisos de operadores por el momento.</p>
        </div>
      ) : (
        <div className="space-y-4 max-w-4xl">
          {notificaciones.map((n) => (
            <div
              key={n.id}
              className={`bg-[#121824] border rounded-2xl p-5 flex items-start justify-between gap-4 transition-all ${
                n.leido ? 'border-slate-800/60 opacity-60' : 'border-red-500/40 bg-red-950/10'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  n.tipo === 'alerta' ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-slate-800 text-slate-300'
                }`}>
                  {n.tipo === 'alerta' ? <AlertTriangle className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      {n.usuarios ? `${n.usuarios.nombre} ${n.usuarios.apellidos || ''}` : 'Operador Desconocido'}
                    </span>
                    {n.areas && (
                      <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-semibold">
                        Área: {n.areas.nombre}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-200">{n.mensaje}</p>
                  <div className="flex items-center gap-1 text-[11px] text-slate-500 pt-1">
                    <Clock className="w-3 h-3" />
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </div>
              </div>

              {!n.leido && (
                <button
                  type="button"
                  onClick={() => marcarComoLeida(n.id)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors shrink-0"
                >
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  Marcar leído
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}