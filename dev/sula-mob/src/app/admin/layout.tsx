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
  LogOut,
  Menu,
  X
} from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const menuItems = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Proyectos', href: '/admin/proyectos', icon: FolderKanban },
    { name: 'Áreas', href: '/admin/actividades', icon: Factory },
    { name: 'Notificaciones', href: '/admin/notificaciones', icon: Bell },
    { name: 'Reportes', href: '/admin/reportes', icon: FileSpreadsheet },
    { name: 'Usuarios', href: '/admin/usuarios', icon: Users },
  ];

  const handleLogout = () => {
    localStorage.removeItem('sula_user');
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-100 font-sans relative overflow-x-hidden selection:bg-red-500 selection:text-white pb-12">
      
      {/* Fondo industrial sutil difuminado con glassmorphism */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-20 bg-cover bg-center mix-blend-luminosity z-0"
        style={{ backgroundImage: "url('/images/fond.png')" }}
      />

      {/* TOP NAVBAR FLOTANTE CON GLASSMORPHISM */}
      <header className="sticky top-4 z-50 px-4 max-w-6xl mx-auto">
        <div className="bg-[#0E131F]/80 backdrop-blur-xl border border-slate-700/50 rounded-full px-6 py-3 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] flex items-center justify-between">
          
          {/* Logo SULA MOB */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-600 to-red-900 border border-red-500/50 flex items-center justify-center font-black text-white text-sm shadow-lg shadow-red-950/50">
              S
            </div>
            <span className="font-black text-lg tracking-wider text-white hidden sm:inline">
              SULA <span className="text-red-500">MOB</span>
            </span>
          </div>

          {/* Menú de Opciones Centrado con Efecto Agrandar (Hover Zoom) */}
          <nav className="hidden md:flex items-center gap-1.5 bg-[#0B0F17]/60 p-1.5 rounded-full border border-slate-800/80 backdrop-blur-md">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all duration-300 ease-out transform hover:scale-110 ${
                    isActive
                      ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg shadow-red-600/30 border border-red-400/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Botón Salir */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleLogout}
              className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/80 hover:bg-red-950/60 text-slate-300 hover:text-red-400 text-xs font-semibold transition-all duration-300 border border-slate-800 hover:border-red-800/50 transform hover:scale-105"
            >
              <LogOut className="w-3.5 h-3.5" /> Salir
            </button>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-full bg-slate-900 text-slate-300 border border-slate-800"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Menú Desplegable Móvil */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-3 bg-[#0E131F]/95 border border-slate-800 rounded-3xl p-4 shadow-2xl backdrop-blur-2xl space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold transition-all ${
                    isActive ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-950/40 text-red-400 text-xs font-bold border border-red-800/40"
            >
              <LogOut className="w-4 h-4" /> Cerrar Sesión
            </button>
          </div>
        )}
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="max-w-7xl mx-auto px-4 pt-6 relative z-10">
        {children}
      </main>
    </div>
  );
}