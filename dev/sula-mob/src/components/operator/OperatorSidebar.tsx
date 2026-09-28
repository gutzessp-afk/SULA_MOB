
'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Factory,
  ClipboardList,
  AlertOctagon,
  Bell,
  LogOut,
  Menu,
  X,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { getUsuarioActual } from '@/app/operator/actions'
import { getConteoNoLeidas } from '@/app/operator/notificaciones-actions'

interface NavItem {
  name: string
  href: string
  icon: LucideIcon
  badge?: number
}

interface NavSection {
  title: string
  items: NavItem[]
}

export default function OperatorSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [sinLeer, setSinLeer] = useState(0)
  const [nombre, setNombre] = useState('Operador')

  useEffect(() => {
    getUsuarioActual().then((u) => {
      if (u?.nombre) setNombre(u.nombre)
    })
  }, [])

  const cargarConteo = useCallback(async () => {
    setSinLeer(await getConteoNoLeidas())
  }, [])

  useEffect(() => {
    cargarConteo()
    const intervalo = setInterval(cargarConteo, 30000)
    window.addEventListener('notificaciones-actualizadas', cargarConteo)
    return () => {
      clearInterval(intervalo)
      window.removeEventListener('notificaciones-actualizadas', cargarConteo)
    }
  }, [cargarConteo, pathname])

  const secciones: NavSection[] = [
    {
      title: 'Menú',
      items: [
        { name: 'Dashboard', href: '/operator', icon: LayoutDashboard },
        { name: 'Actividades', href: '/operator/actividades', icon: Factory },
        { name: 'Notificaciones', href: '/operator/avisos', icon: Bell, badge: sinLeer },
      ],
    },
    {
      title: 'Producción',
      items: [
        { name: 'Registrar Avance', href: '/operator/avances', icon: ClipboardList },
        { name: 'Reportar Retraso', href: '/operator/retrasos', icon: AlertOctagon },
      ],
    },
  ]

  const handleLogout = () => {
    document.cookie = 'sula_session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;'
    router.push('/login')
  }

  const inicial = nombre.trim().charAt(0).toUpperCase() || 'O'

  function estaActivo(href: string) {
    return href === '/operator' ? pathname === href : pathname.startsWith(href)
  }

  return (
    <>
      {/* Botón de menú, solo celular y tablet */}
      <button
        onClick={() => setAbierto(true)}
        className="md:hidden fixed top-4 left-4 z-50 p-2.5 rounded-xl bg-[#111114]/90 border border-white/10 backdrop-blur-xl text-white"
        aria-label="Abrir menú"
      >
        <Menu className="w-5 h-5" />
        {sinLeer > 0 && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-600 border-2 border-[#111114]" />
        )}
      </button>

      {abierto && (
        <div
          onClick={() => setAbierto(false)}
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        />
      )}

      <aside
        className={`w-64 max-w-[85vw] h-screen fixed left-0 top-0 z-50 flex flex-col bg-gradient-to-b from-[#151517] to-[#0b0b0d] border-r border-white/5 transition-transform duration-300 ${
          abierto ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 pt-6 pb-4">
          <div className="flex-1 flex justify-center">
            <Image
              src="/logo-sula.png"
              alt="SULA MOB"
              width={150}
              height={56}
              priority
              className="h-auto w-32"
            />
          </div>
          <button
            onClick={() => setAbierto(false)}
            className="md:hidden text-slate-500 hover:text-white transition"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tarjeta del usuario */}
        <div className="px-4 pb-4">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.06] border border-white/10">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-lg shadow-red-900/40">
              {inicial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{nombre}</p>
              <p className="text-[11px] text-slate-400">Operador</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
          </div>
        </div>

        {/* Navegación por secciones */}
        <nav className="flex-1 overflow-y-auto px-4 pb-4 space-y-6">
          {secciones.map((seccion) => (
            <div key={seccion.title}>
              <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                {seccion.title}
              </p>
              <div className="space-y-1">
                {seccion.items.map((item) => {
                  const Icon = item.icon
                  const activo = estaActivo(item.href)

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setAbierto(false)}
                      className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all ${
                        activo
                          ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                      <span className="flex-1 truncate">{item.name}</span>
                      {!!item.badge && (
                        <span className="min-w-[24px] h-6 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}

          <div>
            <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              General
            </p>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-red-400 transition-all"
            >
              <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </nav>
      </aside>
    </>
  )
}