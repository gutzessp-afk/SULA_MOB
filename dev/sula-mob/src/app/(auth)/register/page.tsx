'use client'

import { useState } from 'react'
import Link from 'next/link'
import { signup } from '../actions'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setErrorMessage(null)

    const formData = new FormData(event.currentTarget)
    const result = await signup(formData)

    if (result?.error) {
      setErrorMessage(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-3xl font-extrabold text-white tracking-tight">Crear cuenta</h2>
        <p className="text-sm text-slate-400">Regístrate como Operador en SULA MOB.</p>
      </div>

      {errorMessage && (
        <div className="bg-red-950/40 border border-red-500/30 text-red-400 text-sm p-3 rounded-lg">
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            Nombre Completo
          </label>
          <input
            name="fullName"
            type="text"
            required
            placeholder="Juan Pérez"
            className="w-full px-4 py-3 bg-[#13151b] border border-slate-800 rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            Correo Electrónico
          </label>
          <input
            name="email"
            type="email"
            required
            placeholder="operador@sula.com"
            className="w-full px-4 py-3 bg-[#13151b] border border-slate-800 rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            Contraseña
          </label>
          <div className="relative">
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              placeholder="Mínimo 6 caracteres"
              className="w-full px-4 py-3 bg-[#13151b] border border-slate-800 rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition pr-16"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-white px-2 py-1 transition flex items-center gap-1"
            >
              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showPassword ? 'OCULTAR' : 'VER'}</span>
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-red-600 hover:bg-red-500 active:bg-red-700 transition text-white font-semibold rounded-lg shadow-lg shadow-red-950/50 flex items-center justify-center gap-2 text-sm disabled:opacity-50 mt-4"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrarme'}
        </button>
      </form>

      <div className="text-center pt-2">
        <p className="text-xs text-slate-400">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="text-red-500 font-medium hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  )
}