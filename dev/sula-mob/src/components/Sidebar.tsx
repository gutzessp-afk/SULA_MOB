'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { 
  LayoutDashboard, 
  FolderKanban, 
  Factory, 
  QrCode, 
  FileText, 
  Users, 
  LogOut,
  ClipboardList
} from 'lucide-react'

interface SidebarProps {
  userRole?: 'admin' | 'operador'
}

export default function Sidebar({ userRole = 'admin' }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const adminLinks = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Proyectos', href: '/admin/proyectos', icon: FolderKanban },
    { name: 'Áreas de Producción', href: '/admin/areas', icon: Factory },
    { name: 'Escanear QR', href: '/admin/escaneo', icon: QrCode },
    { name: 'Reportes', href: '/admin/reportes', icon: FileText },
    { name: 'Usuarios', href: '/admin/usuarios', icon: Users },
  ]

 const operadorLinks = [
  { name: 'Dashboard', href: '/operator/dashboard', icon: LayoutDashboard },
  { name: 'Actividades', href: '/operator/actividades', icon: Factory },
    { name: 'Registrar Avance', href: '/operator/avances', icon: ClipboardList },

]

  const links = userRole === 'admin' ? adminLinks : operadorLinks

  const handleLogout = () => {
    document.cookie = 'sula_session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;'
    router.push('/login')
  }

  return (
    <aside className="w-64 min-h-screen bg-[#090b10]/95 border-r border-slate-800/80 flex flex-col justify-between p-4 fixed left-0 top-0 z-40 backdrop-blur-xl transition-all duration-300">
      <div>
        {/* Header / Logo animado */}
        <div className="px-3 py-4 mb-6 border-b border-slate-800/60 group cursor-pointer">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-black text-white tracking-widest uppercase transition-transform duration-300 group-hover:translate-x-1">
              SULA <span className="text-red-600">MOB</span>
            </h1>
            <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
          </div>
          <p className="text-[10px] text-slate-500 font-mono tracking-wider mt-0.5 uppercase">
            {userRole === 'admin' ? 'Panel Administrativo' : 'Módulo Operador'}
          </p>
        </div>

        {/* Links de Navegación Animados */}
        <nav className="space-y-1.5">
          {links.map((link) => {
            const Icon = link.icon
            const isActive = pathname === link.href

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`group relative flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-semibold transition-all duration-200 ease-in-out ${
                  isActive
                    ? 'bg-gradient-to-r from-red-950/50 to-red-900/20 text-red-400 border border-red-600/40 shadow-lg shadow-red-950/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60 hover:translate-x-1'
                }`}
              >
                {/* Indicador lateral brillante activo */}
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 bg-red-600 rounded-r-full shadow-[0_0_8px_#dc2626]" />
                )}

                <Icon className={`w-4 h-4 transition-transform duration-300 group-hover:scale-110 ${
                  isActive ? 'text-red-500 animate-pulse' : 'text-slate-400 group-hover:text-red-400'
                }`} />

                <span className="transition-colors duration-200">{link.name}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Botón Cerrar Sesión Animado */}
      <div className="pt-4 border-t border-slate-800/60">
        <button
          onClick={handleLogout}
          className="group w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-semibold text-slate-400 hover:text-red-400 hover:bg-red-950/30 border border-transparent hover:border-red-900/40 transition-all duration-200 hover:translate-x-1 cursor-pointer"
        >
          <LogOut className="w-4 h-4 transition-transform duration-300 group-hover:-translate-x-1 text-slate-400 group-hover:text-red-500" />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  )
}