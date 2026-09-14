'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, FolderKanban, Factory, QrCode, FileSpreadsheet, Users, ChevronLeft, ChevronRight } from 'lucide-react';import { useState } from 'react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Proyectos', href: '/admin/proyectos', icon: FolderKanban },
    { name: 'Áreas de Producción', href: '/admin/actividades', icon: Factory },
    { name: 'Escanear QR', href: '/admin/qr', icon: QrCode },
    { name: 'Reportes', href: '/admin/reportes', icon: FileSpreadsheet },
    { name: 'Usuarios', href: '/admin/usuarios', icon: Users },
  ];

  const handleLogout = () => {
    localStorage.removeItem('sula_user');
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen bg-[#0B0F17]">
      {/* Sidebar Dinámico */}
      <aside
        className={`bg-[#0E131F] border-r border-slate-800 flex flex-col justify-between transition-all duration-300 relative ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Toggle para contraer/expandir */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-8 bg-red-600 hover:bg-red-700 text-white p-1 rounded-full border border-slate-800 transition-all shadow-lg z-50"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        <div className="p-4">
          {/* Header del Sidebar */}
          <div className="mb-8 px-2 flex items-center justify-between">
            {!collapsed ? (
              <div>
                <h1 className="text-xl font-black tracking-wider text-white">
                  SULA <span className="text-red-500">MOB</span>
                </h1>
                <p className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">
                  Panel Administrativo
                </p>
              </div>
            ) : (
              <div className="mx-auto font-black text-red-500 text-xl">S</div>
            )}
          </div>

          {/* Navegación Principal */}
          <nav className="space-y-1.5">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3.5 py-3 rounded-xl font-medium text-sm transition-all relative ${
                    isActive
                      ? 'bg-red-950/40 text-red-400 border border-red-500/30 font-semibold shadow-lg shadow-red-950/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                  title={collapsed ? item.name : undefined}
                >
                  {isActive && (
                    <span className="absolute left-0 top-2 bottom-2 w-1 bg-red-500 rounded-r-full" />
                  )}
                  <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-red-500' : 'text-slate-400'}`} />
                  {!collapsed && <span>{item.name}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Cierre de Sesión */}
        <div className="p-4 border-t border-slate-800/80">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl font-medium text-sm text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-all"
            title={collapsed ? 'Cerrar Sesión' : undefined}
          >
            <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-white text-xs shrink-0">
              N
            </div>
            {!collapsed && <span>Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      {/* Contenido Principal */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}