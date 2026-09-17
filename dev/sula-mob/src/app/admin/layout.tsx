'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FolderKanban,
  Factory,
  FileSpreadsheet,
  Users,
  Bell,
  Menu,
  X,
  LogOut
} from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const menuItems = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Proyectos', href: '/admin/proyectos', icon: FolderKanban },
    { name: 'Áreas de Producción', href: '/admin/actividades', icon: Factory },
    { name: 'Notificaciones', href: '/admin/notificaciones', icon: Bell },
    { name: 'Reportes', href: '/admin/reportes', icon: FileSpreadsheet },
    { name: 'Usuarios', href: '/admin/usuarios', icon: Users },
  ];

  const handleLogout = () => {
    localStorage.removeItem('sula_user');
    router.push('/login');
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#070A0F] text-slate-100 font-sans selection:bg-red-500 selection:text-white">
      
      {/* HEADER SUPERIOR EN MÓVILES */}
      <header className="md:hidden flex items-center justify-between p-4 bg-[#0E131F]/90 backdrop-blur-xl border-b border-slate-800/80 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/40 flex items-center justify-center font-black text-red-500 text-sm">
            S
          </div>
          <span className="text-lg font-black tracking-wider text-white">
            SULA <span className="text-red-500">MOB</span>
          </span>
        </div>
        
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* MENÚ DESPLEGABLE MÓVIL */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-[65px] bg-[#070A0F]/95 backdrop-blur-2xl z-40 p-6 flex flex-col justify-between border-b border-slate-800 animate-in fade-in slide-in-from-top-4 duration-200">
          <nav className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-red-950/80 to-slate-900 text-red-400 border border-red-500/30 shadow-lg shadow-red-950/20'
                      : 'text-slate-400 hover:bg-slate-900/60 hover:text-white'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-red-500' : 'text-slate-400'}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-red-950/30 border border-red-500/20 text-red-400 text-sm font-semibold"
          >
            <LogOut className="w-4 h-4" /> Cerrar Sesión
          </button>
        </div>
      )}

      {/* SIDEBAR ESCRITORIO Y TABLETS */}
      <aside
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`hidden md:flex flex-col justify-between bg-[#0B0F17]/90 border-r border-slate-800/80 backdrop-blur-2xl transition-all duration-300 ease-in-out z-40 sticky top-0 h-screen ${
          isHovered ? 'w-64' : 'w-20'
        }`}
      >
        <div className="p-4">
          <div className="mb-8 px-2 flex items-center justify-between h-10 overflow-hidden">
            {isHovered ? (
              <div className="transition-all duration-300">
                <h1 className="text-xl font-black tracking-wider text-white">
                  SULA <span className="text-red-500">MOB</span>
                </h1>
                <p className="text-[9px] font-bold text-slate-500 tracking-widest uppercase whitespace-nowrap">
                  Control de Manufactura
                </p>
              </div>
            ) : (
              <div className="mx-auto w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-red-950/50">
                S
              </div>
            )}
          </div>

          <nav className="space-y-1.5">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3.5 px-3.5 py-3 rounded-xl font-medium text-sm transition-all relative group ${
                    isActive
                      ? 'bg-gradient-to-r from-red-950/60 to-[#121824] text-red-400 border border-red-500/30 font-semibold shadow-md shadow-red-950/20'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40'
                  }`}
                  title={!isHovered ? item.name : undefined}
                >
                  {isActive && (
                    <span className="absolute left-0 top-2 bottom-2 w-1 bg-red-500 rounded-r-full shadow-[0_0_12px_#ef4444]" />
                  )}
                  <Icon className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-red-500' : 'text-slate-400'}`} />
                  {isHovered && <span className="whitespace-nowrap transition-opacity duration-200">{item.name}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800/80 bg-[#070A0F]/40">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-all"
            title={!isHovered ? 'Cerrar Sesión' : undefined}
          >
            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-white text-xs shrink-0">
              N
            </div>
            {isHovered && <span className="whitespace-nowrap font-semibold">Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL CON EFECTO GLOW DE FONDO */}
      <main className="flex-1 p-4 sm:p-6 lg:p-10 overflow-y-auto relative">
        <div className="pointer-events-none absolute top-0 right-1/4 w-[500px] h-[500px] bg-red-600/5 rounded-full blur-[140px] -z-10" />
        <div className="pointer-events-none absolute bottom-10 left-10 w-[400px] h-[400px] bg-blue-600/5 rounded-full blur-[140px] -z-10" />
        {children}
      </main>
    </div>
  );
}