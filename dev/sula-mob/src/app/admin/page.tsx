import Link from 'next/link'
import { FolderKanban, Factory, QrCode, FileText, Users, ArrowRight } from 'lucide-react'

export default function AdminDashboardPage() {
  const modulos = [
    { title: 'Gestión de Proyectos', desc: 'Crear, editar y dar seguimiento a órdenes', href: '/admin/proyectos', icon: FolderKanban },
    { title: 'Áreas de Producción', desc: 'Monitorear las 7 estaciones fijas', href: '/admin/areas', icon: Factory },
    { title: 'Escáner QR', desc: 'Control e inspección rápida de piezas', href: '/admin/escaneo', icon: QrCode },
    { title: 'Reportes', desc: 'Métricas de desempeño y descargas', href: '/admin/reportes', icon: FileText },
    { title: 'Usuarios', desc: 'Administración de roles u operadores', href: '/admin/usuarios', icon: Users },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-black text-white tracking-wider uppercase">Accesos Rápidos</h2>
        <p className="text-xs text-slate-400 mt-1">Selecciona un módulo del menú o accede directamente desde aquí.</p>
      </div>

      {/* Grid de Accesos Directos Animados */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modulos.map((modulo) => {
          const Icon = modulo.icon
          return (
            <Link
              key={modulo.href}
              href={modulo.href}
              className="group p-5 bg-[#0e1017]/80 hover:bg-[#121520] border border-slate-800/80 hover:border-red-600/40 rounded-2xl transition-all duration-300 hover:-translate-y-1 shadow-lg hover:shadow-red-950/20 flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 group-hover:border-red-600/50 transition-colors">
                  <Icon className="w-5 h-5 text-slate-400 group-hover:text-red-500 transition-colors" />
                </div>
                <h3 className="text-sm font-bold text-white group-hover:text-red-400 transition-colors">{modulo.title}</h3>
                <p className="text-xs text-slate-400 mt-1">{modulo.desc}</p>
              </div>

              <div className="mt-6 flex items-center gap-2 text-[11px] font-bold text-slate-500 group-hover:text-white transition-colors uppercase tracking-wider">
                <span>Abrir Módulo</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-1 text-red-500" />
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}