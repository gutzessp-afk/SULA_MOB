'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Check, Loader2, AlertCircle, ShieldCheck, HardHat } from 'lucide-react'
import { loginAction } from './actions'

const inputClass =
  'h-[54px] w-full rounded-2xl border border-white/20 bg-white/[0.07] text-base text-white outline-none backdrop-blur-sm transition-colors placeholder:text-white/50 hover:border-white/30 focus:border-white/50 focus:bg-white/[0.12] focus:ring-4 focus:ring-white/10 sm:h-[56px] sm:text-[15px] ' +
  'autofill:shadow-[inset_0_0_0_1000px_rgba(255,255,255,0.08)] autofill:[-webkit-text-fill-color:#ffffff] ' +
  '[&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_rgba(255,255,255,0.08)] [&:-webkit-autofill]:[-webkit-text-fill-color:#ffffff] [&:-webkit-autofill]:[caret-color:#ffffff] [&:-webkit-autofill]:[transition:background-color_600000s_0s]'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState<'admin' | 'operador'>('admin')

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
      window.location.assign(result.redirectUrl)
    } else {
      setError('Respuesta no válida del servidor.')
      setLoading(false)
    }
  }

  return (
    <div className="relative w-full">

      {/* Brillo del canto superior del cristal */}
      <div className="pointer-events-none absolute inset-0 rounded-[26px] bg-gradient-to-b from-white/20 via-white/[0.03] to-transparent" />

      <div className="relative rounded-[26px] border border-white/20 bg-white/[0.05] p-6 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] sm:p-9">

        {/* Logo */}
        <div className="mb-6 flex justify-center sm:mb-7">
          <Image
            src="/logo-sula.png"
            alt="SULA MOB"
            width={260}
            height={130}
            priority
            className="h-[54px] w-auto object-contain drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)] sm:h-[66px]"
          />
        </div>

        {/* Encabezado */}
        <div className="mb-6 sm:mb-7">
          <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-white sm:text-[27px]">
            Bienvenido
          </h1>
          <p className="mt-1.5 text-[13.5px] text-white/65 sm:text-[14px]">
            Accede a tu cuenta para continuar
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          {/* Selector de Rol (Administrador / Operador) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-white/70">Selecciona tu perfil:</label>
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/20 bg-white/[0.05] p-1 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setRole('admin')}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition-all ${
                  role === 'admin'
                    ? 'bg-red-600 text-white shadow-lg shadow-red-950/50 border border-red-400/40'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                Administrador
              </button>

              <button
                type="button"
                onClick={() => setRole('operador')}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition-all ${
                  role === 'operador'
                    ? 'bg-red-600 text-white shadow-lg shadow-red-950/50 border border-red-400/40'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <HardHat className="h-4 w-4" />
                Operador
              </button>
            </div>
            <input type="hidden" name="role" value={role} />
          </div>

          {/* Error */}
          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="flex items-start gap-2.5 rounded-2xl border border-red-400/35 bg-red-500/20 px-4 py-3 backdrop-blur-sm"
            >
              <AlertCircle className="mt-px h-4 w-4 shrink-0 text-red-300" />
              <span className="text-[13px] leading-relaxed text-red-100">{error}</span>
            </div>
          )}

          {/* Correo o usuario */}
          <div className="relative flex items-center">
            <Mail className="pointer-events-none absolute left-4 h-[18px] w-[18px] text-white/50" />
            <input
              id="identifier"
              name="identifier"
              type="text"
              required
              autoComplete="username"
              placeholder="Correo o usuario"
              className={`${inputClass} pl-12 pr-4`}
            />
          </div>

          {/* Contraseña */}
          <div className="relative flex items-center">
            <Lock className="pointer-events-none absolute left-4 h-[18px] w-[18px] text-white/50" />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="Contraseña"
              className={`${inputClass} pl-12 pr-14`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="absolute right-3 flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-white/55 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
            </button>
          </div>

          {/* Recordar + recuperar */}
          <div className="flex flex-col items-start gap-3 py-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <label className="group flex cursor-pointer select-none items-center gap-2.5">
              <span className="relative flex h-[18px] w-[18px] items-center justify-center">
                <input
                  type="checkbox"
                  name="remember"
                  className="peer h-[18px] w-[18px] cursor-pointer appearance-none rounded-[6px] border border-white/30 bg-white/[0.07] transition checked:border-white checked:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                />
                <Check
                  strokeWidth={3}
                  className="pointer-events-none absolute h-3 w-3 text-neutral-900 opacity-0 transition-opacity peer-checked:opacity-100"
                />
              </span>
              <span className="whitespace-nowrap text-[13px] text-white/70 transition group-hover:text-white">
                Mantener sesión iniciada
              </span>
            </label>

            <Link
              href="/forgot-password"
              className="whitespace-nowrap text-[13px] text-white/70 underline decoration-white/30 underline-offset-4 transition hover:text-white hover:decoration-white/70"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          {/* Botón */}
          <button
            type="submit"
            disabled={loading}
            className="group mt-1 flex h-[54px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white text-[15px] font-semibold text-neutral-900 shadow-lg shadow-black/30 transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-60 sm:h-[56px]"
          >
            {loading ? (
              <>
                <Loader2 className="h-[18px] w-[18px] animate-spin" />
                Verificando…
              </>
            ) : (
              <>
                Iniciar sesión
                <ArrowRight className="h-[18px] w-[18px] transition-transform group-hover:translate-x-1" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
