'use client';

/**
 * Mi perfil — /admin/perfil
 * ─────────────────────────
 * El administrador cambia su foto, edita sus datos (nombre, apellidos, usuario y correo)
 * y cambia su contraseña. Las acciones del servidor siempre trabajan sobre la cuenta de la
 * sesión actual.
 *
 * RUTA: src/app/admin/perfil/page.tsx
 */

import { useEffect, useState } from 'react';
import { AtSign, CalendarDays, Camera, Check, Eye, EyeOff, KeyRound, Loader2, Mail, ShieldCheck, User, UserCog } from 'lucide-react';
import { EVENTO_PERFIL } from '@/lib/perfil';
import { NotificacionesDispositivo } from '@/components/NotificacionesDispositivo';
import { cambiarContrasena, guardarDatos, obtenerPerfil, subirAvatar, type Perfil } from './actions';

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

/** Encabezado de cada tarjeta: icono en recuadro, título y una línea de ayuda */
function Seccion({ icono: Icono, color, titulo, ayuda, extra }: { icono: typeof User; color: string; titulo: string; ayuda: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${color}`}><Icono className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold text-white sm:text-base">{titulo}</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-white/55">{ayuda}</p>
      </div>
      {extra}
    </div>
  );
}

/** 0 a 4 según largo y variedad de caracteres */
function fuerzaClave(clave: string): number {
  if (!clave) return 0;
  let puntos = clave.length >= 8 ? 1 : 0;
  if (clave.length >= 12) puntos++;
  if (/[a-z]/.test(clave) && /[A-Z]/.test(clave)) puntos++;
  if (/\d/.test(clave) && /[^a-zA-Z0-9]/.test(clave)) puntos++;
  return puntos;
}
const FUERZA = [
  { texto: 'Muy corta', color: 'bg-red-500' },
  { texto: 'Débil', color: 'bg-orange-500' },
  { texto: 'Aceptable', color: 'bg-amber-400' },
  { texto: 'Buena', color: 'bg-lime-400' },
  { texto: 'Excelente', color: 'bg-emerald-400' },
];

/** Recorta la foto al centro en cuadrado de 512 px (JPEG): pesa poco y cabe en la acción del servidor */
async function fotoCuadrada(archivo: File): Promise<Blob> {
  const imagen = await createImageBitmap(archivo);
  const lado = Math.min(imagen.width, imagen.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  canvas.getContext('2d')!.drawImage(imagen, (imagen.width - lado) / 2, (imagen.height - lado) / 2, lado, lado, 0, 0, 512, 512);
  imagen.close();
  return new Promise((ok, falla) => canvas.toBlob(b => (b ? ok(b) : falla(new Error('No se pudo procesar la imagen.'))), 'image/jpeg', 0.85));
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

  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [estadoFoto, setEstadoFoto] = useState<{ ok: boolean; texto: string } | null>(null);

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

  const cambiarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    if (!archivo.type.startsWith('image/')) { setEstadoFoto({ ok: false, texto: 'El archivo debe ser una imagen.' }); return; }
    setSubiendoFoto(true);
    setEstadoFoto(null);
    try {
      const fd = new FormData();
      fd.append('avatar', new File([await fotoCuadrada(archivo)], 'avatar.jpg', { type: 'image/jpeg' }));
      const r = await subirAvatar(fd);
      if (r.ok) {
        const nuevo = await obtenerPerfil();
        if (nuevo) setPerfil(nuevo);
        window.dispatchEvent(new Event(EVENTO_PERFIL));
      }
      setEstadoFoto(r.ok ? { ok: true, texto: r.mensaje } : { ok: false, texto: r.error });
    } catch {
      setEstadoFoto({ ok: false, texto: 'No se pudo leer la imagen. Prueba con una foto JPG o PNG.' });
    }
    setSubiendoFoto(false);
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
  const fuerza = fuerzaClave(claves.nueva);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-1 pb-8 sm:space-y-5 sm:px-0">
      {/* Encabezado */}
      <div className={`${TARJETA} overflow-hidden`}>
        <div className="h-20 bg-gradient-to-r from-blue-600/50 via-indigo-500/30 to-transparent sm:h-24" />
        <div className="-mt-10 flex flex-col gap-4 px-5 pb-5 sm:-mt-12 sm:flex-row sm:items-end sm:px-6 sm:pb-6">
          <label className="group relative h-20 w-20 shrink-0 cursor-pointer sm:h-24 sm:w-24" title="Cambiar foto de perfil">
            {perfil.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- foto propia de 512 px, no necesita optimización
              <img src={perfil.avatar_url} alt={nombreCompleto} className="h-full w-full rounded-2xl object-cover shadow-xl ring-4 ring-[#0b0f17]/80" />
            ) : (
              <span className="flex h-full w-full items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-3xl font-bold text-white shadow-xl ring-4 ring-[#0b0f17]/80 sm:text-4xl">
                {inicial}
              </span>
            )}
            <span className={`absolute inset-0 flex items-center justify-center rounded-2xl bg-black/55 transition-opacity ${subiendoFoto ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
              {subiendoFoto ? <Loader2 className="h-6 w-6 animate-spin text-white" /> : <Camera className="h-6 w-6 text-white" />}
            </span>
            {/* Botón visible siempre: en el celular no hay "pasar el mouse" */}
            <span className="absolute -bottom-1.5 -right-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#0b0f17] bg-blue-600 text-white shadow-lg group-hover:bg-blue-500">
              <Camera className="h-4 w-4" />
            </span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="sr-only" disabled={subiendoFoto} onChange={cambiarFoto} aria-label="Cambiar foto de perfil" />
          </label>
          <div className="min-w-0 flex-1 sm:pb-1">
            <h1 className="truncate text-xl font-bold text-white sm:text-2xl">{nombreCompleto}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-400/30 bg-blue-500/15 px-2.5 py-1 text-blue-300"><ShieldCheck className="h-3 w-3" /> Administrador</span>
              {perfil.username && <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-white/70"><AtSign className="h-3 w-3" />{perfil.username}</span>}
              {perfil.correo && <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-white/70"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{perfil.correo}</span></span>}
              {perfil.creado && (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-white/70">
                  <CalendarDays className="h-3 w-3" /> Desde {new Date(perfil.creado).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
        </div>
        {estadoFoto && <div className="px-5 pb-5 sm:px-6 sm:pb-6"><Mensaje estado={estadoFoto} /></div>}
      </div>

      {/* Datos */}
      <form onSubmit={enviarDatos} className={`${TARJETA} space-y-5 p-5 sm:p-6`}>
          <Seccion
            icono={UserCog}
            color="bg-blue-500/15 text-blue-400 ring-blue-400/20"
            titulo="Mis datos"
            ayuda={perfil.tipo === 'usuario' ? 'Tu nombre aparece en el menú; con el usuario o el correo inicias sesión.' : 'Tu nombre aparece en el menú. Inicias sesión con tu correo, que se administra en Supabase.'}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <Campo etiqueta="Nombre *" icono={User}>
              <input required value={datos.nombre} onChange={e => setDatos({ ...datos, nombre: e.target.value })} className={INPUT} autoComplete="given-name" />
            </Campo>
            <Campo etiqueta="Apellidos" icono={User}>
              <input value={datos.apellidos} onChange={e => setDatos({ ...datos, apellidos: e.target.value })} className={INPUT} autoComplete="family-name" />
            </Campo>
            {perfil.tipo === 'usuario' ? (
              <>
                <Campo etiqueta="Usuario (para iniciar sesión) *" icono={AtSign}>
                  <input required value={datos.username} onChange={e => setDatos({ ...datos, username: e.target.value })} className={INPUT} autoComplete="username" autoCapitalize="none" spellCheck={false} />
                </Campo>
                <Campo etiqueta="Correo" icono={Mail}>
                  <input type="email" value={datos.correo} onChange={e => setDatos({ ...datos, correo: e.target.value })} className={INPUT} autoComplete="email" autoCapitalize="none" />
                </Campo>
              </>
            ) : (
              <Campo etiqueta="Correo (para iniciar sesión)" icono={Mail}>
                <input type="email" value={datos.correo} readOnly className={`${INPUT} cursor-not-allowed text-white/50`} />
              </Campo>
            )}
          </div>
          <Mensaje estado={estadoDatos} />
          <div className="flex flex-col-reverse items-stretch gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-center text-xs text-white/45 sm:text-left">{cambiosPendientes ? 'Tienes cambios sin guardar.' : 'Todo está guardado.'}</span>
            <button
              type="submit"
              disabled={guardandoDatos || !cambiosPendientes}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-40 sm:w-auto"
            >
              {guardandoDatos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar cambios
            </button>
          </div>
        </form>

      {/* Notificaciones push del celular o la computadora */}
      <NotificacionesDispositivo tarjeta={TARJETA} />

      {/* Contraseña */}
      <form onSubmit={enviarClave} className={`${TARJETA} space-y-5 p-5 sm:p-6`}>
        <Seccion
          icono={KeyRound}
          color="bg-amber-500/15 text-amber-400 ring-amber-400/20"
          titulo="Cambiar contraseña"
          ayuda="Mínimo 8 caracteres. Mezcla mayúsculas, números y símbolos para que sea más segura."
          extra={
            <button type="button" onClick={() => setVerClaves(v => !v)} aria-label={verClaves ? 'Ocultar contraseñas' : 'Mostrar contraseñas'} className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-xs text-white/60 hover:bg-white/[0.06] hover:text-white">
              {verClaves ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} <span className="max-sm:hidden">{verClaves ? 'Ocultar' : 'Mostrar'}</span>
            </button>
          }
        />
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
        {claves.nueva && (
          <div className="space-y-1.5">
            <div className="grid grid-cols-4 gap-1.5">
              {[1, 2, 3, 4].map(n => <span key={n} className={`h-1.5 rounded-full transition-colors ${fuerza >= n ? FUERZA[fuerza].color : 'bg-white/10'}`} />)}
            </div>
            <p className="flex justify-between text-[11px] text-white/50">
              <span>Seguridad: <b className="text-white/75">{FUERZA[fuerza].texto}</b></span>
              {claves.confirmar && <span className={claves.confirmar === claves.nueva ? 'text-emerald-300' : 'text-red-300'}>{claves.confirmar === claves.nueva ? 'Coinciden' : 'No coinciden'}</span>}
            </p>
          </div>
        )}
        <Mensaje estado={estadoClave} />
        <div className="flex justify-end border-t border-white/10 pt-4">
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
