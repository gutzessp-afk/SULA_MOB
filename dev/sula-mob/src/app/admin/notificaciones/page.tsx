'use client';

/**
 * Centro de notificaciones del admin — /admin/notificaciones
 * Un mismo aviso se guarda una vez por destinatario: aquí se agrupa y se dice
 * a cuántos les llegó y cuántos ya lo leyeron. "Leída" es de cada destinatario,
 * así que el admin no la cambia.
 *
 * RUTA: src/app/admin/notificaciones/page.tsx
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Bell, MessageSquare, CheckCircle, AlertTriangle, Clock, Loader2, User } from 'lucide-react';

type Persona = { nombre: string | null; apellidos?: string | null } | null;

interface Fila {
  id: string;
  mensaje: string | null;
  tipo: string | null;
  leida: boolean | null;
  proyecto_id: string | null;
  created_at: string;
  remitente: Persona;
  destinatario: Persona;
  proyectos: { codigo: string | null } | null;
}

interface Aviso extends Fila { para: string[]; leidas: number }

const LIMITE = 300;
const nombre = (p: Persona) => (p ? `${p.nombre ?? ''} ${p.apellidos ?? ''}`.trim() : '');
const esAlerta = (n: Fila) => /retras|atras|urgent|incidenc|falla|falta|alerta/i.test(`${n.tipo} ${n.mensaje}`);

/** Junta las copias del mismo aviso (mismo mensaje, proyecto y minuto) */
function agrupar(filas: Fila[]): Aviso[] {
  const grupos = new Map<string, Aviso>();
  for (const n of filas) {
    const clave = `${n.mensaje}|${n.proyecto_id}|${n.created_at.slice(0, 16)}`;
    const g = grupos.get(clave) ?? { ...n, para: [], leidas: 0 };
    const quien = nombre(n.destinatario);
    if (quien) g.para.push(quien);
    if (n.leida) g.leidas++;
    grupos.set(clave, g);
  }
  return [...grupos.values()];
}

export default function NotificacionesPage() {
  const [notificaciones, setNotificaciones] = useState<Aviso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    // notificaciones tiene dos llaves hacia usuarios: hay que decir cuál es cuál
    supabase
      .from('notificaciones')
      .select('id, mensaje, tipo, leida, proyecto_id, created_at, remitente:usuarios!notificaciones_remitente_id_fkey (nombre, apellidos), destinatario:usuarios!notificaciones_destinatario_id_fkey (nombre, apellidos), proyectos (codigo)')
      .order('created_at', { ascending: false })
      .limit(LIMITE)
      .then(({ data, error: err }) => {
        if (!vigente) return;
        if (err) setError('No se pudieron cargar las notificaciones: ' + err.message);
        else setNotificaciones(agrupar((data ?? []) as unknown as Fila[]));
        setLoading(false);
      });
    return () => { vigente = false; };
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-0">

      <div
        className="relative overflow-hidden rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] p-4 sm:p-6 md:p-8 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-cover bg-center"
        style={{ backgroundImage: "linear-gradient(to right, rgba(11,15,23,0.95), rgba(18,24,36,0.8)), url('/images/corte_madera2.webp')" }}
      >
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-white tracking-wide flex items-center gap-3">
            <Bell className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
            Centro de Notificaciones y Mensajes
          </h1>
          <p className="text-xs text-white/65 mt-1">Incidencias y avisos reportados en tiempo real por los operadores de planta.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div className="lg:col-span-2 space-y-4">
          {loading ? (
            <div className="flex justify-center items-center py-20 text-white/50 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-red-500" />
              <span>Cargando avisos de operadores...</span>
            </div>
          ) : error ? (
            <p className="text-xs text-red-300 font-semibold bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">{error}</p>
          ) : notificaciones.length === 0 ? (
            <div className="relative overflow-hidden rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] p-12 text-center shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] space-y-3">
              <MessageSquare className="w-10 h-10 text-white/30 mx-auto" />
              <h3 className="text-base font-bold text-white">Sin notificaciones</h3>
              <p className="text-xs text-white/50">Todavía no hay avisos en el sistema.</p>
            </div>
          ) : (
            notificaciones.map((n) => {
              const alerta = esAlerta(n);
              const todasLeidas = n.para.length > 0 && n.leidas >= n.para.length;
              const codigo = n.proyectos?.codigo;
              return (
                <div
                  key={n.id}
                  className={`relative overflow-hidden rounded-[20px] sm:rounded-[26px] border p-4 sm:p-5 flex items-start gap-3 sm:gap-4 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl ${
                    alerta ? 'bg-red-950/20 border-red-500/40' : 'bg-white/[0.04] border-white/15'
                  }`}
                >
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                    alerta ? 'bg-red-950/80 text-red-400 border-red-500/50' : 'bg-white/10 text-white border-white/15'
                  }`}>
                    {alerta ? <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" /> : <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />}
                  </div>
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-white flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-white/50" />
                        {nombre(n.remitente) || 'Sistema'}
                      </span>
                      {n.tipo && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${alerta ? 'bg-red-500/20 text-red-400' : 'bg-teal-500/20 text-teal-400'}`}>{n.tipo}</span>
                      )}
                      {codigo && n.proyecto_id && (
                        <Link href={`/admin/proyectos/${n.proyecto_id}`} className="-my-1.5 py-1.5 text-[10px] font-mono font-bold text-blue-400 hover:underline">{codigo}</Link>
                      )}
                    </div>
                    <p className="text-sm text-white/90 leading-relaxed break-words">{n.mensaje}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/50 pt-0.5">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(n.created_at).toLocaleString('es-MX')}</span>
                      {n.para.length > 0 && (
                        <span title={n.para.join(', ')} className={`flex items-center gap-1 ${todasLeidas ? 'text-emerald-400' : ''}`}>
                          <CheckCircle className="w-3 h-3" />
                          {n.para.length === 1 ? `Para ${n.para[0]} · ${n.leidas ? 'leída' : 'sin leer'}` : `Para ${n.para.length} personas · ${n.leidas} la leyeron`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="relative overflow-hidden rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] p-4 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] h-80 flex flex-col justify-end">
          <Image src="/images/nueva.webp" alt="Planta SULA MOB" fill className="object-cover rounded-2xl opacity-75" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F17] via-transparent to-transparent rounded-2xl" />
          <div className="relative z-10 p-2 space-y-1">
            <span className="text-[10px] uppercase tracking-wider font-bold text-red-400 bg-black/60 px-2.5 py-1 rounded-full border border-white/10 backdrop-blur-md inline-block">
              Centro de Comunicacion
            </span>
            <p className="text-xs text-white/80">Atencion inmediata a reportes de operadores en talleres.</p>
          </div>
        </div>

      </div>
    </div>
  );
}
