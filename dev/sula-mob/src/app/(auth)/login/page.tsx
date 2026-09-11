'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { loginAction } from './actions'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const result = await loginAction(null, formData)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    } else if (result?.success && result.redirectUrl) {
      // Forzar la navegación completa hacia la ruta del dashboard
      window.location.assign(result.redirectUrl)
    } else {
      setError('Respuesta no válida del servidor.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#07080c] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-white tracking-wider uppercase">
            SULA <span className="text-red-600">MOB</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">Control de Producción e Inventario</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-950/60 border border-red-800/80 text-red-200 text-xs p-3.5 rounded-xl text-center font-medium animate-pulse">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Usuario o Correo
            </label>
            <input
              name="identifier"
              type="text"
              required
              placeholder="GibranSula@Sula.com"
              className="w-full bg-[#08090d] border border-slate-800 focus:border-red-600 text-white text-sm rounded-xl px-4 py-3 outline-none transition duration-200 placeholder:text-slate-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Contraseña
            </label>
            <div className="relative flex items-center">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
                className="w-full bg-[#08090d] border border-slate-800 focus:border-red-600 text-white text-sm rounded-xl pl-4 pr-11 py-3 outline-none transition duration-200 placeholder:text-slate-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 text-slate-400 hover:text-white transition-colors focus:outline-none cursor-pointer"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-xs font-bold uppercase tracking-wider py-3.5 px-4 rounded-xl shadow-lg transition duration-200 disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'VERIFICANDO...' : 'INICIAR SESIÓN'}
          </button>
        </form>
      </div>
    </div>
  )
}