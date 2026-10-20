'use client';

/**
 * Mi perfil — /admin/perfil
 * ─────────────────────────
 * El administrador edita sus datos (nombre, apellidos, usuario y correo) y cambia
 * su contraseña. Las acciones del servidor siempre trabajan sobre la cuenta de la
 * sesión actual.
 *
 * RUTA: src/app/admin/perfil/page.tsx
 */

import { useEffect, useState } from 'react';
import { AtSign, Check, Eye, EyeOff, KeyRound, Loader2, Mail, User, UserCog } from 'lucide-react';
import { EVENTO_PERFIL } from '@/lib/perfil';
import { NotificacionesDispositivo } from '@/components/NotificacionesDispositivo';
import { cambiarContrasena, guardarDatos, obtenerPerfil, type Perfil } from './actions';

const TARJETA = 'rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl';
const INPUT = 'w-full h-[46px] rounded-xl border border-white/20 bg-white/[0.07] px-3.5 text-sm text-white outline-none focus:border-blue-400/60 placeholder:text-white/30 max-sm:text-base';

function Mensaje({ estado }: { estado: { ok: boolean; texto: string } | null }) {
  if (!estado) return null;
  return (
    <p role="status" className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${estado.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
      {estado.texto}
    </p>
  );
}

function Campo({ etiqueta, icono: Icono, children }: { etiqueta: string; icono: typeof User; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-white/60"><Icono className="h-3.5 w-3.5" />{etiqueta}</span>
      {children}
    </label>
  );
}

export default function PerfilPage() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [datos, setDatos] = useState({ nombre: '', apellidos: '', username: '', correo: '' });
  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const [estadoDatos, setEstadoDatos] = useState<{ ok: boolean; texto: string } | null>(null);

  const [claves, setClaves] = useState({ actual: '', nueva: '', confirmar: '' });
  const [verClaves, setVerClaves] = useState(false);
  const [guardandoClave, setGuardandoClave] = useState(false);
  const [estadoClave, setEstadoClave] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    let vigente = true;
    obtenerPerfil().then(p => {
      if (!vigente) return;
      setPerfil(p);
      if (p) setDatos({ nombre: p.nombre, apellidos: p.apellidos, username: p.username, correo: p.correo });
      setCargando(false);
    });
    return () => { vigente = false; };
  }, []);

  const cambiosPendientes = !!perfil && (
    datos.nombre !== perfil.nombre || datos.apellidos !== perfil.apellidos || datos.username !== perfil.username || datos.correo !== perfil.correo
  );

  const enviarDatos = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardandoDatos(true);
    setEstadoDatos(null);
    const r = await guardarDatos(datos);
    setGuardandoDatos(false);
    if (!r.ok) { setEstadoDatos({ ok: false, texto: r.error }); return; }
    const nuevo = await obtenerPerfil();
    if (nuevo) {
      setPerfil(nuevo);
      setDatos({ nombre: nuevo.nombre, apellidos: nuevo.apellidos, username: nuevo.username, correo: nuevo.correo });
    }
    window.dispatchEvent(new Event(EVENTO_PERFIL));
    setEstadoDatos({ ok: true, texto: r.mensaje });
  };

  const enviarClave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (claves.nueva !== claves.confirmar) { setEstadoClave({ ok: false, texto: 'La nueva contraseña y su confirmación no coinciden.' }); return; }
    setGuardandoClave(true);
    setEstadoClave(null);
    const r = await cambiarContrasena(claves.actual, claves.nueva);
    setGuardandoClave(false);
    setEstadoClave(r.ok ? { ok: true, texto: r.mensaje } : { ok: false, texto: r.error });
    if (r.ok) setClaves({ actual: '', nueva: '', confirmar: '' });
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-white/50">
        <Loader2 className="h-5 w-5 animate-spin text-blue-400" /> Cargando tu perfil...
      </div>
    );
  }
  if (!perfil) {
    return <p className={`${TARJETA} p-8 text-center text-sm text-white/60`}>No se encontró tu sesión. Vuelve a iniciar sesión.</p>;
  }

  const nombreCompleto = `${perfil.nombre} ${perfil.apellidos}`.trim() || perfil.correo || 'Administrador';
  const inicial = (nombreCompleto[0] ?? 'A').toUpperCase();
  const tipoClave = verClaves ? 'text' : 'password';

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-1 pb-8 sm:space-y-5 sm:px-0">
      {/* Encabezado */}
      <div className={`${TARJETA} flex items-center gap-4 p-5 sm:p-6`}>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-xl font-bold text-white shadow-lg sm:h-16 sm:w-16 sm:text-2xl">
          {inicial}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-white sm:text-2xl">{nombreCompleto}</h1>
          <p className="mt-0.5 text-xs text-white/55">
            Administrador{perfil.username ? ` · @${perfil.username}` : ''}
            {perfil.creado ? ` · desde ${new Date(perfil.creado).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}` : ''}
          </p>
        </div>
      </div>

      {/* Datos */}
      {perfil.tipo === 'usuario' ? (
        <form onSubmit={enviarDatos} className={`${TARJETA} space-y-4 p-5 sm:p-6`}>
          <h2 className="flex items-center gap-2 text-sm font-bold text-white"><UserCog className="h-4 w-4 text-blue-400" /> Mis datos</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <Campo etiqueta="Nombre *" icono={User}>
              <input required value={datos.nombre} onChange={e => setDatos({ ...datos, nombre: e.target.value })} className={INPUT} autoComplete="given-name" />
            </Campo>
            <Campo etiqueta="Apellidos" icono={User}>
              <input value={datos.apellidos} onChange={e => setDatos({ ...datos, apellidos: e.target.value })} className={INPUT} autoComplete="family-name" />
            </Campo>
            <Campo etiqueta="Usuario (para iniciar sesión) *" icono={AtSign}>
              <input required value={datos.username} onChange={e => setDatos({ ...datos, username: e.target.value })} className={INPUT} autoComplete="username" autoCapitalize="none" spellCheck={false} />
            </Campo>
            <Campo etiqueta="Correo" icono={Mail}>
              <input type="email" value={datos.correo} onChange={e => setDatos({ ...datos, correo: e.target.value })} className={INPUT} autoComplete="email" autoCapitalize="none" />
            </Campo>
          </div>
          <Mensaje estado={estadoDatos} />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={guardandoDatos || !cambiosPendientes}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-40 sm:w-auto"
            >
              {guardandoDatos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar cambios
            </button>
          </div>
        </form>
      ) : (
        <p className={`${TARJETA} p-5 text-xs text-white/60`}>
          Tu cuenta ({perfil.correo}) se administra en Supabase: aquí solo puedes cambiar tu contraseña.
        </p>
      )}

      {/* Notificaciones push del celular o la computadora */}
      <NotificacionesDispositivo tarjeta={TARJETA} />

      {/* Contraseña */}
      <form onSubmit={enviarClave} className={`${TARJETA} space-y-4 p-5 sm:p-6`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white"><KeyRound className="h-4 w-4 text-amber-400" /> Cambiar contraseña</h2>
          <button type="button" onClick={() => setVerClaves(v => !v)} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2 text-xs text-white/50 hover:text-white">
            {verClaves ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {verClaves ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
        {/* Usuario oculto: así el administrador de contraseñas del navegador sabe de qué cuenta es */}
        <input type="text" name="username" value={perfil.username || perfil.correo} autoComplete="username" readOnly hidden />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <Campo etiqueta="Contraseña actual" icono={KeyRound}>
            <input required type={tipoClave} value={claves.actual} onChange={e => setClaves({ ...claves, actual: e.target.value })} className={INPUT} autoComplete="current-password" />
          </Campo>
          <Campo etiqueta="Nueva (mín. 8)" icono={KeyRound}>
            <input required minLength={8} type={tipoClave} value={claves.nueva} onChange={e => setClaves({ ...claves, nueva: e.target.value })} className={INPUT} autoComplete="new-password" />
          </Campo>
          <Campo etiqueta="Confirmar nueva" icono={KeyRound}>
            <input required minLength={8} type={tipoClave} value={claves.confirmar} onChange={e => setClaves({ ...claves, confirmar: e.target.value })} className={INPUT} autoComplete="new-password" />
          </Campo>
        </div>
        <Mensaje estado={estadoClave} />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={guardandoClave || !claves.actual || !claves.nueva || !claves.confirmar}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-6 text-sm font-bold text-white hover:bg-amber-500 disabled:opacity-40 sm:w-auto"
          >
            {guardandoClave ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Cambiar contraseña
          </button>
        </div>
      </form>
    </div>
  );
}
