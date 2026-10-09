'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutGrid,
  Briefcase,
  Warehouse,
  Bell,
  BarChart3,
  Users,
  LogOut,
  Menu,
  X,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import MobiChat from '@/components/MobiChat';

/* ── Secciones del menú ── */

const menuSections = [
  {
    title: 'MENÚ',
    items: [
      { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutGrid },
      { name: 'Proyectos', href: '/admin/proyectos', icon: Briefcase },
      { name: 'Áreas', href: '/admin/actividades', icon: Warehouse },
      { name: 'Notificaciones', href: '/admin/notificaciones', icon: Bell },
    ],
  },
  {
    title: 'REPORTES',
    items: [
      { name: 'Reportes', href: '/admin/reportes', icon: BarChart3 },
    ],
  },
  {
    title: 'GENERAL',
    items: [
      { name: 'Usuarios', href: '/admin/usuarios', icon: Users },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    const fn = () => { if (window.innerWidth >= 1024) setMobileOpen(false); };
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('sula_user');
    router.push('/login');
  };

  const glassPanel = `
    backdrop-blur-[50px] backdrop-saturate-[2.2]
    bg-white/[0.05]
    border-r border-white/[0.08]
  `;

  const renderNav = (onNavigate?: () => void) => (
    <>
      <div className="group/logo flex justify-center pt-7 pb-5">
        <div className="relative">
          {/* Glow pulsante detrás del logo */}
          <div className="absolute inset-0 rounded-2xl bg-blue-500/20 blur-xl scale-110 animate-pulse" />
          <Image
            src="/SULA_MOB_logo_transparente.png"
            alt="SULA MOB"
            width={160}
            height={80}
            className="relative h-[52px] w-auto object-contain drop-shadow-[0_0_24px_rgba(59,130,246,0.35)] transition-all duration-500 group-hover/logo:drop-shadow-[0_0_32px_rgba(59,130,246,0.55)] group-hover/logo:scale-105"
          />
        </div>
      </div>

      <div className="mx-4 mb-5 flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.06] cursor-pointer hover:bg-white/[0.1] transition-colors">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-sm font-bold shadow-md">
          A
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">Admin</p>
          <p className="text-[11px] text-slate-400">Administrador</p>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-500" />
      </div>

      <div className="mx-5 mb-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <nav className="flex-1 overflow-y-auto px-4 space-y-5">
        {menuSections.map((section) => (
          <div key={section.title}>
            <p className="px-3 mb-2 text-[10px] font-bold tracking-[0.2em] text-slate-500 uppercase">
              {section.title}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`
                      group relative flex items-center gap-3 px-3 py-2.5 rounded-xl
                      text-[13px] font-medium
                      transition-all duration-300 ease-out
                      ${isActive
                        ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(59,130,246,0.4),0_4px_12px_rgba(59,130,246,0.3)]'
                        : 'text-slate-300 hover:text-white hover:translate-x-1 hover:bg-white/[0.08] hover:shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                      }
                    `}
                  >
                    {/* Glow line izquierda al hover */}
                    <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-full transition-all duration-300 ${
                      isActive
                        ? 'h-6 bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]'
                        : 'h-0 bg-blue-400 group-hover:h-4 group-hover:shadow-[0_0_6px_rgba(96,165,250,0.4)]'
                    }`} />
                    <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-all duration-300 ${
                      isActive
                        ? 'text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.4)]'
                        : 'text-slate-400 group-hover:text-blue-400 group-hover:drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]'
                    }`} />
                    <span className="transition-all duration-300">{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mx-5 mt-auto mb-2 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="px-4 pb-5 pt-2">
        <button
          onClick={handleLogout}
          className="
            group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
            text-[13px] font-medium text-slate-400
            hover:text-red-400 hover:bg-white/[0.06]
            transition-all duration-200
          "
        >
          <LogOut className="w-[18px] h-[18px]" />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#060910] text-slate-100 font-sans selection:bg-blue-500 selection:text-white">

      {/* Fondo global: <Image> lo sirve en AVIF/WebP al tamaño de la pantalla */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.22] z-0">
        <Image
          src="/fondo_dashboard.jpeg"
          alt=""
          fill
          priority
          quality={75}
          sizes="100vw"
          className="object-cover object-center"
        />
      </div>

      <div className="fixed -top-32 -left-20 w-[420px] h-[420px] rounded-full bg-blue-600/[0.07] blur-[130px] pointer-events-none z-0" />
      <div className="fixed top-1/3 -left-10 w-[320px] h-[320px] rounded-full bg-cyan-500/[0.05] blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-0 left-1/4 w-[380px] h-[380px] rounded-full bg-blue-500/[0.04] blur-[140px] pointer-events-none z-0" />

      <aside
        className={`
          fixed top-0 left-0 h-full z-40
          hidden lg:flex flex-col
          w-[260px]
          ${glassPanel}
          transition-transform duration-400 ease-[cubic-bezier(0.4,0,0.2,1)]
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {renderNav()}
      </aside>

      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className={`
          hidden lg:flex fixed top-5 z-50
          items-center justify-center
          w-8 h-8 rounded-lg
          backdrop-blur-xl bg-white/[0.06]
          border border-white/[0.08]
          text-slate-400 hover:text-white
          transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)]
          hover:bg-white/[0.12]
          ${sidebarOpen ? 'left-[268px]' : 'left-4'}
        `}
      >
        {sidebarOpen
          ? <PanelLeftClose className="w-4 h-4" />
          : <PanelLeftOpen className="w-4 h-4" />
        }
      </button>

      <header className="lg:hidden sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
        <div className="mx-3 mt-3 backdrop-blur-[50px] backdrop-saturate-[2.2] bg-white/[0.06] border border-white/[0.08] rounded-2xl px-4 py-3 shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white active:bg-white/10 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Image src="/SULA_MOB_logo_transparente.png" alt="SULA MOB" width={100} height={30} className="h-[26px] w-auto object-contain" />
          </div>
          <button
            onClick={handleLogout}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 active:bg-white/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div
        className={`
          lg:hidden fixed inset-0 z-40
          bg-black/40 backdrop-blur-sm
          transition-opacity duration-300
          ${mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}
        onClick={() => setMobileOpen(false)}
      />

      <div
        className={`
          lg:hidden fixed top-0 left-0 h-full w-[260px] z-50
          flex flex-col
          backdrop-blur-[50px] backdrop-saturate-[2.2]
          bg-white/[0.06]
          border-r border-white/[0.08]
          shadow-2xl shadow-black/50
          transition-transform duration-400 ease-[cubic-bezier(0.4,0,0.2,1)]
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-5 right-3 p-2 rounded-lg text-slate-400 hover:text-white transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {renderNav(() => setMobileOpen(false))}
      </div>

      <main
        className={`
          relative z-10 min-h-screen
          transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)]
          px-4 sm:px-6 pt-6
          pb-[calc(3rem+env(safe-area-inset-bottom))]
          pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]
          sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))]
          ${sidebarOpen ? 'lg:ml-[260px]' : 'lg:ml-0'}
        `}
      >
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      <MobiChat />
    </div>
  );
}