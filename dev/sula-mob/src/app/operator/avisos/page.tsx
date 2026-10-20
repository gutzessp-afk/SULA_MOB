import { redirect } from 'next/navigation'

// Los avisos del administrador ahora viven en /operator/notificaciones (el botón del menú)
export default function AvisosOperador() {
  redirect('/operator/notificaciones')
}
