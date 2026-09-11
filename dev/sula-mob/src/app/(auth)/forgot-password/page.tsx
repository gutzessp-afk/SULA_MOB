'use client'

import { useState } from 'react'
import Link from 'next/link'
import { resetPassword } from '../actions'
import { Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    const formData = new FormData(event.currentTarget)
    const result = await resetPassword(formData)

    if (result?.error) {
      setErrorMessage(result.error)
    } else if (result?.success) {
      setSuccessMessage(result.success)
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-3xl font-extrabold text-white tracking-tight">Recuperar contraseña</h2>
        <p className="text-sm text-slate-400">
          Ingresa tu correo y te enviaremos instrucciones para restablecerla.
        </p>
      </div>

      {errorMessage && (
        <div className="bg-red-950/40 border border-red-500/30 text-red-400 text-sm p-3 rounded-lg">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-sm p-3 rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            Correo Electrónico
          </label>
          <input
            name="email"
            type="email"
            required
            placeholder="usuario@sula.com"
            className="w-full px-4 py-3 bg-[#13151b] border border-slate-800 rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-red-600 hover:bg-red-500 active:bg-red-700 transition text-white font-semibold rounded-lg shadow-lg shadow-red-950/50 flex items-center justify-center gap-2 text-sm disabled:opacity-50 mt-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar enlace'}
        </button>
      </form>

      <div className="text-center pt-2">
        <Link href="/login" className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white transition">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Volver al inicio de sesión</span>
        </Link>
      </div>
    </div>
  )
}