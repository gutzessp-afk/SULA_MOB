'use client';

/**
 * Panel del ÁREA DE MADERA — layout de /madera
 * ──────────────────────────────────────────────
 * La cuenta con rol "madera" entra aquí en lugar de /admin. Mismo menú lateral que el panel de
 * administrador (src/app/admin/layout.tsx), en tonos madera (ámbar):
 *   · Dashboard      (/madera)        → compras y almacén de los pedidos de madera; sus tarjetas
 *                                       abren la explosión en modo compras (/madera/bom/[id])
 *   · Subir archivos (/madera/subir)  → arrastrar el Excel de la explosión o el PDF de la orden de compra
 * Se ven en vivo las explosiones que inicia el administrador con sus REV-xx; de los materiales,
 * solo los de Clasificación = Madera (GET /api/bom y las hojas filtran en el servidor).
 * src/proxy.ts no la deja entrar a /admin ni a /operator; las API de admin la rechazan.
 * Un administrador también puede abrir /madera para revisar lo que ve el área.
 *
 * RUTA: src/app/madera/layout.tsx
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeftRight, LayoutGrid, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Trees, Upload, X } from 'lucide-react';
import { logoutAction } from '@/app/(auth)/login/actions';
import MobiChat from '@/components/MobiChat';
import { sesionPanel, type SesionPanel } from './actions';

const MENU = [
  { name: 'Dashboard', href: '/madera', icon: LayoutGrid, activoEn: (r: string) => r === '/madera' || r.startsWith('/madera/bom') },
  { name: 'Subir archivos', href: '/madera/subir', icon: Upload, activoEn: (r: string) => r.startsWith('/madera/subir') },
];

export default function MaderaLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // El menú del celular recuerda en qué página se abrió: al navegar a otra queda cerrado solo
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null);
  const mobileOpen = abiertoEn === pathname;
  const setMobileOpen = (abrir: boolean) => setAbiertoEn(abrir ? pathname : null);
  const [sesion, setSesion] = useState<SesionPanel | null>(null);

  useEffect(() => { void sesionPanel().then(setSesion); }, []);

  useEffect(() => {
    const fn = () => { if (window.innerWidth >= 1024) setAbiertoEn(null); };
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  const handleLogout = async () => {
    try { localStorage.removeItem('sula_user'); } catch { /* sin almacenamiento */ }
    await logoutAction();
    router.push('/login');
  };

  const renderNav = (onNavigate?: () => void) => (
    <>
      <div className="group/logo flex justify-center pt-7 pb-5">
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-amber-500/20 blur-xl scale-110 animate-pulse" />
          <Image
            src="/SULA_MOB_logo_transparente.png"
            alt="SULA MOB"
            width={160}
            height={80}
            className="relative h-[52px] w-auto object-contain drop-shadow-[0_0_24px_rgba(245,158,11,0.35)] transition-all duration-500 group-hover/logo:drop-shadow-[0_0_32px_rgba(245,158,11,0.55)] group-hover/logo:scale-105"
          />
        </div>
      </div>

      {/* Tarjeta de la sesión */}
      <div className="mx-4 mb-5 flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.06]">
        <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-amber-500 to-orange-700 flex items-center justify-center text-white text-sm font-bold shadow-md">
          {(sesion?.nombre?.[0] ?? 'M').toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{sesion?.nombre ?? '…'}</p>
          <p className="text-[11px] text-slate-400 inline-flex items-center gap-1">
            <Trees className="w-3 h-3 text-amber-400" /> {sesion?.rol === 'admin' ? 'Administrador · vista madera' : 'Área de madera'}
          </p>
        </div>
      </div>

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
                    ? 'bg-amber-600 text-white shadow-[0_0_20px_rgba(217,119,6,0.4),0_4px_12px_rgba(217,119,6,0.3)]'
                    : 'text-slate-300 hover:text-white hover:translate-x-1 hover:bg-white/[0.08] hover:shadow-[0_0_15px_rgba(217,119,6,0.15)]'}`}
                >
                  <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-full transition-all duration-300 ${isActive
                    ? 'h-6 bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.6)]'
                    : 'h-0 bg-amber-300 group-hover:h-4'}`} />
                  <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-all duration-300 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-amber-400'}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
            {sesion?.rol === 'admin' && (
              <Link href="/admin/dashboard" onClick={onNavigate}
                className="group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-slate-300 hover:text-white hover:translate-x-1 hover:bg-white/[0.08] transition-all duration-300">
                <ArrowLeftRight className="w-[18px] h-[18px] text-slate-400 group-hover:text-blue-400" />
                <span>Regresar a Admin</span>
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
    <div className="min-h-screen bg-[#07080c] text-slate-100 font-sans selection:bg-amber-500 selection:text-white">
      {/* Fondo: foto del área de madera de la planta, oscurecida para que se lea todo */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <Image src="/fondo-madera.jpg" alt="" fill priority quality={75} sizes="100vw" className="object-cover object-center opacity-[0.38]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#07080c]/70 via-[#07080c]/55 to-[#07080c]/90" />
      </div>
      <div className="hidden lg:block fixed -top-40 right-0 w-[460px] h-[460px] rounded-full bg-amber-600/[0.08] blur-[140px] pointer-events-none z-0" />
      <div className="hidden lg:block fixed bottom-0 left-1/4 w-[380px] h-[380px] rounded-full bg-orange-700/[0.06] blur-[140px] pointer-events-none z-0" />

      {/* ═══ Menú lateral (escritorio) ═══ */}
      <aside
        className={`fixed top-0 left-0 h-full z-40 hidden lg:flex flex-col w-[260px] backdrop-blur-[50px] backdrop-saturate-[2.2] bg-[#1a1208]/40 border-r border-amber-200/[0.08] transition-transform duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
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
        <div className="mx-3 mt-3 backdrop-blur-md bg-[#140e07]/90 border border-amber-200/[0.08] rounded-2xl px-4 py-3 shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} aria-label="Abrir menú"
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white active:bg-white/10 transition-colors">
              <Menu className="w-5 h-5" />
            </button>
            <Image src="/SULA_MOB_logo_transparente.png" alt="SULA MOB" width={100} height={30} className="h-[26px] w-auto object-contain" />
          </div>
          <button onClick={() => void handleLogout()} aria-label="Cerrar sesión"
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 active:bg-white/10 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div
        className={`lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMobileOpen(false)}
      />

      <div
        className={`lg:hidden fixed top-0 left-0 h-full w-[260px] z-50 flex flex-col bg-[#140e07] border-r border-amber-200/[0.08] shadow-2xl shadow-black/50 transition-transform duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <button onClick={() => setMobileOpen(false)} aria-label="Cerrar menú" className="absolute top-5 right-3 p-2 rounded-lg text-slate-400 hover:text-white transition-colors z-10">
          <X className="w-5 h-5" />
        </button>
        {renderNav(() => setMobileOpen(false))}
      </div>

      <main
        className={`relative z-10 min-h-screen transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] px-4 sm:px-6 pt-6 pb-[calc(3rem+env(safe-area-inset-bottom))] ${sidebarOpen ? 'lg:ml-[260px]' : 'lg:ml-0'}`}
      >
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Mobi: en madera solo explica su panel (src/app/api/mobi/route.ts) */}
      <MobiChat />
    </div>
  );
}
