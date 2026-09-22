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

/* ── Secciones del menú ── */

const menuSections = [
  {
    title: 'MENÚ',
    items: [
      { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutGrid },
      { name: 'Proyectos', href: '/admin/proyectos', icon: Briefcase },
      { name: 'Áreas', href: '/admin/actividades', icon: Warehouse },
      { name: 'Notificaciones', href: '/admin/notificaciones', icon: Bell, badge: 3 },
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

  /* ── Clases del panel cristal (compartidas desktop + mobile) ──
     Antes: bg-black/30 (casi sólido, tapaba todo lo de atrás).
     Ahora: bg-white/[0.05] deja pasar mucha más luz/color, y subimos
     blur + saturación para que ese color se vea "vidrioso" y no plano. */
  const glassPanel = `
    backdrop-blur-[50px] backdrop-saturate-[2.2]
    bg-white/[0.05]
    border-r border-white/[0.08]
  `;

  /* ── Contenido del sidebar ── */
  const renderNav = (onNavigate?: () => void) => (
    <>
      {/* Logo — solo imagen, sin texto */}
      <div className="flex justify-center pt-7 pb-5">
        <Image
          src="/logo-sula.png"
          alt="SULA MOB"
          width={84}
          height={84}
          className="rounded-2xl drop-shadow-[0_0_20px_rgba(239,68,68,0.25)]"
        />
      </div>

      {/* Perfil */}
      <div className="mx-4 mb-5 flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.06] cursor-pointer hover:bg-white/[0.1] transition-colors">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white text-sm font-bold shadow-md">
          A
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">Admin</p>
          <p className="text-[11px] text-slate-400">Administrador</p>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-500" />
      </div>

      {/* Separador */}
      <div className="mx-5 mb-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Secciones de navegación */}
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
                      group flex items-center gap-3 px-3 py-2.5 rounded-xl
                      text-[13px] font-medium transition-all duration-200
                      ${isActive
                        ? 'bg-red-600 text-white shadow-lg shadow-red-600/25'
                        : 'text-slate-300 hover:text-white hover:bg-white/[0.08]'
                      }
                    `}
                  >
                    <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
                    <span>{item.name}</span>

                    {'badge' in item && item.badge && (
                      <span className={`
                        ml-auto w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold
                        ${isActive ? 'bg-white text-red-600' : 'bg-red-500 text-white'}
                      `}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Separador */}
      <div className="mx-5 mt-auto mb-2 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Cerrar sesión */}
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
    <div className="min-h-screen bg-[#060910] text-slate-100 font-sans selection:bg-red-500 selection:text-white">

      {/* Fondo industrial — subimos opacidad y quitamos mix-blend-luminosity
          para que se vea la foto de verdad, no solo una sombra gris */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.22] bg-cover bg-center z-0"
        style={{ backgroundImage: "url('/images/fond.png')" }}
      />

      {/* Blobs de color — esto es lo que le da "vida" al cristal.
          Sin esto, el blur no tiene color/luz que atrapar y se ve plano. */}
      <div className="fixed -top-32 -left-20 w-[420px] h-[420px] rounded-full bg-red-600/[0.06] blur-[130px] pointer-events-none z-0" />
      <div className="fixed top-1/3 -left-10 w-[320px] h-[320px] rounded-full bg-amber-500/[0.05] blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-0 left-1/4 w-[380px] h-[380px] rounded-full bg-red-500/[0.03] blur-[140px] pointer-events-none z-0" />

      {/* ═══ SIDEBAR DESKTOP — cristal transparente ═══ */}
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

      {/* Botón toggle desktop */}
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

      {/* ═══ HEADER MÓVIL ═══ */}
      <header className="lg:hidden sticky top-0 z-50">
        <div className="mx-3 mt-3 backdrop-blur-[50px] backdrop-saturate-[2.2] bg-white/[0.06] border border-white/[0.08] rounded-2xl px-4 py-3 shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 rounded-lg text-slate-300 hover:text-white transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Image src="/logo-sula.png" alt="SULA MOB" width={30} height={30} className="rounded-lg" />
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ═══ OVERLAY MÓVIL ═══ */}
      <div
        className={`
          lg:hidden fixed inset-0 z-40
          bg-black/40 backdrop-blur-sm
          transition-opacity duration-300
          ${mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}
        onClick={() => setMobileOpen(false)}
      />

      {/* ═══ DRAWER MÓVIL — cristal transparente ═══ */}
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
        {/* Botón cerrar */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-5 right-3 p-2 rounded-lg text-slate-400 hover:text-white transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {renderNav(() => setMobileOpen(false))}
      </div>

      {/* ═══ CONTENIDO ═══ */}
      <main
        className={`
          relative z-10 min-h-screen
          transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)]
          px-4 sm:px-6 pt-6 pb-12
          ${sidebarOpen ? 'lg:ml-[260px]' : 'lg:ml-0'}
        `}
      >
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}