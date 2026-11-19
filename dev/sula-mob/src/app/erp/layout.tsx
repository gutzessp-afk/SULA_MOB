'use client';

/**
 * Panel ERP — layout de /erp (perfiles compras, finanzas y almacén)
 * ───────────────────────────────────────────────────────────────────
 * Mismo esqueleto que el panel de madera (menú lateral + contenido) con los colores del admin
 * (vidrio oscuro, acento azul, fondo global). Solo dos módulos:
 *   · Dashboard (/erp)      → KPIs según el perfil
 *   · BOM       (/erp/bom)  → todas las explosiones; la hoja se edita según el perfil
 * Arriba va la etiqueta del perfil (COMPRAS verde, FINANZAS azul, ALMACÉN ámbar).
 * src/proxy.ts no deja a estos roles salir de /erp. Un administrador también puede abrirlo:
 * ve el selector "Ver como" para revisar cada perfil y el botón para regresar al admin.
 * Campana de avisos (CampanaErp) arriba a la derecha: pagos para almacén, recibidos para compras y
 * finanzas (src/lib/notificar-erp.ts).
 *
 * RUTA: src/app/erp/layout.tsx
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeftRight, Boxes, LayoutGrid, Loader2, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { logoutAction } from '@/app/(auth)/login/actions';
import MobiChat from '@/components/MobiChat';
import CampanaErp from '@/components/erp/CampanaErp';
import { sesionErp, type SesionErp } from './actions';
import { esPerfilErp, PERFILES, PerfilContext, type PerfilErp } from './perfil';

const MENU = [
  { name: 'Dashboard', href: '/erp', icon: LayoutGrid, activoEn: (r: string) => r === '/erp' },
  { name: 'BOM', href: '/erp/bom', icon: Boxes, activoEn: (r: string) => r.startsWith('/erp/bom') },
];

const CLAVE_VISTA = 'erp-ver-como';

export default function ErpLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // El menú del celular recuerda en qué página se abrió: al navegar a otra queda cerrado solo
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null);
  const mobileOpen = abiertoEn === pathname;
  const setMobileOpen = (abrir: boolean) => setAbiertoEn(abrir ? pathname : null);
  const [sesion, setSesion] = useState<SesionErp | null>(null);
  const [cargada, setCargada] = useState(false);
  // Solo para el admin: qué perfil está revisando
  const [verComo, setVerComo] = useState<PerfilErp>('compras');

  useEffect(() => {
    void sesionErp().then(s => {
      setSesion(s);
      if (s?.rol === 'admin') {
        try { const v = localStorage.getItem(CLAVE_VISTA); if (esPerfilErp(v)) setVerComo(v); } catch { /* sin almacenamiento */ }
      }
      setCargada(true);
    });
  }, []);

  useEffect(() => {
    const fn = () => { if (window.innerWidth >= 1024) setAbiertoEn(null); };
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  const esAdmin = sesion?.rol === 'admin';
  const perfil: PerfilErp = sesion && esPerfilErp(sesion.rol) ? sesion.rol : verComo;
  const datosPerfil = PERFILES[perfil];

  const cambiarVista = (v: PerfilErp) => {
    setVerComo(v);
    try { localStorage.setItem(CLAVE_VISTA, v); } catch { /* sin almacenamiento */ }
  };

  const handleLogout = async () => {
    try { localStorage.removeItem('sula_user'); } catch { /* sin almacenamiento */ }
    await logoutAction();
    router.push('/login');
  };

  const renderNav = (onNavigate?: () => void) => (
    <>
      <div className="group/logo flex justify-center pt-7 pb-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-blue-500/20 blur-xl scale-110 animate-pulse" />
          <Image
            src="/SULA_MOB_logo_transparente.png"
            alt="SULA MOB"
            width={160}
            height={80}
            className="relative h-[52px] w-auto object-contain drop-shadow-[0_0_24px_rgba(59,130,246,0.35)] transition-all duration-500 group-hover/logo:scale-105"
          />
        </div>
      </div>

      {/* Etiqueta del perfil */}
      <div className="mx-4 mb-3 flex justify-center">
        <span className="px-3 py-1 rounded-full text-[11px] font-extrabold tracking-[0.2em] text-white shadow-md" style={{ backgroundColor: datosPerfil.color }}>
          {datosPerfil.etiqueta}
        </span>
      </div>

      {/* Tarjeta de la sesión */}
      <div className="mx-4 mb-4 flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.06]">
        <div className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md" style={{ backgroundColor: datosPerfil.color }}>
          {(sesion?.nombre?.[0] ?? '·').toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{sesion?.nombre ?? '…'}</p>
          <p className="text-[11px] text-slate-400 truncate">{esAdmin ? `Administrador · vista ${datosPerfil.etiqueta.toLowerCase()}` : `Perfil ${datosPerfil.etiqueta.toLowerCase()}`}</p>
        </div>
      </div>

      {/* Admin: revisar cada perfil */}
      {esAdmin && (
        <div className="mx-4 mb-4">
          <p className="px-1 mb-1.5 text-[10px] font-bold tracking-[0.2em] text-slate-500 uppercase">Ver como</p>
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1" role="group" aria-label="Ver el panel como">
            {(Object.keys(PERFILES) as PerfilErp[]).map(p => (
              <button key={p} type="button" onClick={() => cambiarVista(p)} aria-pressed={perfil === p}
                className={`px-1 py-1.5 rounded-lg text-[10px] font-bold tracking-wide transition-all ${perfil === p ? 'text-white shadow' : 'text-slate-400 hover:text-white'}`}
                style={perfil === p ? { backgroundColor: PERFILES[p].color } : undefined}>
                {PERFILES[p].etiqueta}
              </button>
            ))}
          </div>
          <p className="px-1 mt-1.5 text-[10px] text-slate-500 leading-snug">Solo cambia lo que ves; los datos siguen siendo de administrador.</p>
        </div>
      )}

      <div className="mx-5 mb-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <nav className="flex-1 overflow-y-auto px-4 space-y-5">
        <div>
          <p className="px-3 mb-2 text-[10px] font-bold tracking-[0.2em] text-slate-500 uppercase">MENÚ</p>
          <div className="space-y-1">
            {MENU.map(item => {
              const Icon = item.icon;
              const isActive = item.activoEn(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-300 ease-out ${isActive
                    ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4),0_4px_12px_rgba(37,99,235,0.3)]'
                    : 'text-slate-300 hover:text-white hover:translate-x-1 hover:bg-white/[0.08] hover:shadow-[0_0_15px_rgba(37,99,235,0.15)]'}`}
                >
                  <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-full transition-all duration-300 ${isActive
                    ? 'h-6 bg-blue-300 shadow-[0_0_8px_rgba(147,197,253,0.6)]'
                    : 'h-0 bg-blue-300 group-hover:h-4'}`} />
                  <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-all duration-300 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
            {esAdmin && (
              <Link href="/admin/dashboard" onClick={onNavigate}
                className="group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-slate-300 hover:text-white hover:translate-x-1 hover:bg-white/[0.08] transition-all duration-300">
                <ArrowLeftRight className="w-[18px] h-[18px] text-slate-400 group-hover:text-blue-400" />
                <span>Admin</span>
              </Link>
            )}
          </div>
        </div>
      </nav>

      <div className="mx-5 mt-auto mb-2 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="px-4 pb-5 pt-2">
        <button
          onClick={() => void handleLogout()}
          className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-slate-400 hover:text-red-400 hover:bg-white/[0.06] transition-all duration-200"
        >
          <LogOut className="w-[18px] h-[18px]" />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="sula-fondo min-h-screen bg-[#060910] text-slate-100 font-sans selection:bg-blue-500 selection:text-white">
      {/* Fondo global del admin */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.22] z-0">
        <Image src="/fondo_dashboard.jpeg" alt="" fill priority quality={75} sizes="100vw" className="object-cover object-center" />
      </div>
      <div className="sula-orbe hidden lg:block fixed -top-32 -left-20 w-[420px] h-[420px] rounded-full bg-blue-600/[0.07] blur-[130px] pointer-events-none z-0" />
      <div className="sula-orbe hidden lg:block fixed bottom-0 left-1/4 w-[380px] h-[380px] rounded-full bg-blue-500/[0.04] blur-[140px] pointer-events-none z-0" />

      {/* ═══ Menú lateral (escritorio) ═══ */}
      <aside
        className={`sula-panel fixed top-0 left-0 h-full z-40 hidden lg:flex flex-col w-[260px] backdrop-blur-[50px] backdrop-saturate-[2.2] bg-white/[0.05] border-r border-white/[0.08] transition-transform duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {renderNav()}
      </aside>

      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? 'Ocultar menú' : 'Mostrar menú'}
        className={`hidden lg:flex fixed top-5 z-50 items-center justify-center w-8 h-8 rounded-lg backdrop-blur-xl bg-white/[0.06] border border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.12] transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarOpen ? 'left-[268px]' : 'left-4'}`}
      >
        {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
      </button>

      {/* ═══ Barra del celular ═══ */}
      <header className="lg:hidden sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
        <div className="sula-panel mx-3 mt-3 backdrop-blur-md bg-[#0b0f17]/90 border border-white/[0.08] rounded-2xl px-4 py-3 shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} aria-label="Abrir menú"
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white active:bg-white/10 transition-colors">
              <Menu className="w-5 h-5" />
            </button>
            <Image src="/SULA_MOB_logo_transparente.png" alt="SULA MOB" width={100} height={30} className="h-[26px] w-auto object-contain" />
            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold tracking-[0.15em] text-white" style={{ backgroundColor: datosPerfil.color }}>{datosPerfil.etiqueta}</span>
          </div>
          <div className="flex items-center gap-1">
            {sesion && <CampanaErp usuarioId={sesion.id} />}
            <button onClick={() => void handleLogout()} aria-label="Cerrar sesión"
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 active:bg-white/10 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Campana (escritorio): arriba a la derecha */}
      {sesion && (
        <div className="hidden lg:block fixed top-4 right-6 z-50">
          <CampanaErp usuarioId={sesion.id} />
        </div>
      )}

      <div
        className={`lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMobileOpen(false)}
      />

      <div
        className={`sula-panel lg:hidden fixed top-0 left-0 h-full w-[260px] z-50 flex flex-col bg-[#0b0f17] border-r border-white/[0.08] shadow-2xl shadow-black/50 transition-transform duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <button onClick={() => setMobileOpen(false)} aria-label="Cerrar menú" className="absolute top-5 right-3 p-2 rounded-lg text-slate-400 hover:text-white transition-colors z-10">
          <X className="w-5 h-5" />
        </button>
        {renderNav(() => setMobileOpen(false))}
      </div>

      <main
        className={`relative z-10 min-h-screen transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] px-4 sm:px-6 pt-6 lg:pt-14 pb-[calc(3rem+env(safe-area-inset-bottom))] ${sidebarOpen ? 'lg:ml-[260px]' : 'lg:ml-0'}`}
      >
        <div className="max-w-7xl mx-auto">
          {/* Hasta saber el perfil no se dibuja nada (para no mostrar un instante la vista equivocada) */}
          {!cargada ? (
            <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>
          ) : !sesion ? (
            <p className="text-center text-sm text-white/60 py-24">Tu sesión no tiene un perfil de este panel. Vuelve a iniciar sesión.</p>
          ) : (
            <PerfilContext.Provider value={{ perfil, esAdmin }}>{children}</PerfilContext.Provider>
          )}
        </div>
      </main>

      {/* Mobi: explica solo lo de este perfil (src/app/api/mobi/route.ts) */}
      <MobiChat />
    </div>
  );
}
