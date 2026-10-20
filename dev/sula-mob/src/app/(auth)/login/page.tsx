'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, Check, Loader2, AlertCircle,
  ShieldCheck, HardHat,
} from 'lucide-react'
import { entrarComoOperador, loginAction } from './actions'

const inputClass =
  'h-[46px] w-full rounded-2xl border border-white/20 bg-white/[0.07] text-base text-white outline-none backdrop-blur-sm transition-colors placeholder:text-white/50 hover:border-white/30 focus:border-blue-400/60 focus:bg-white/[0.12] focus:ring-4 focus:ring-blue-500/15 sm:h-[48px] sm:text-[14.5px] ' +
  'autofill:shadow-[inset_0_0_0_1000px_rgba(255,255,255,0.08)] autofill:[-webkit-text-fill-color:#ffffff] ' +
  '[&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_rgba(255,255,255,0.08)] [&:-webkit-autofill]:[-webkit-text-fill-color:#ffffff] [&:-webkit-autofill]:[caret-color:#ffffff] [&:-webkit-autofill]:[transition:background-color_600000s_0s]'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [entrandoOperador, setEntrandoOperador] = useState(false)

  // Operador: entra directo a la lista de proyectos; la clave se pide al abrir cada área
  async function entrarOperador() {
    setEntrandoOperador(true)
    setError(null)
    const result = await entrarComoOperador()
    if (result?.success && result.redirectUrl) {
      window.location.assign(result.redirectUrl)
    } else {
      setError(result?.error ?? 'Respuesta no válida del servidor.')
      setEntrandoOperador(false)
    }
  }

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

      <div className="relative rounded-[26px] border border-white/20 bg-white/[0.06] p-5 shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7] sm:p-7">

        {/* Logo */}
        <div className="mb-4 flex justify-center sm:mb-5">
          <Image
            src="/SULA_MOB_logo_transparente.png"
            alt="SULA MOB"
            width={260}
            height={130}
            priority
            className="h-[40px] w-auto object-contain drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)] sm:h-[46px]"
          />
        </div>

        {/* Encabezado */}
        <div className="mb-4 sm:mb-5">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-white sm:text-[24px]">
            Bienvenido
          </h1>
          <p className="mt-1 text-[13px] text-white/65">
            Accede a tu cuenta para continuar
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">

          {/* El formulario es solo del Administrador */}
          <input type="hidden" name="role" value="admin" />

          {/* Selector de perfil: Operador no usa formulario, entra con un toque */}
          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-white/70">Selecciona tu perfil:</p>
            <div
              aria-label="Tipo de acceso"
              className="grid grid-cols-2 gap-1 rounded-2xl border border-white/15 bg-black/30 p-1"
            >
              <div
                aria-current="true"
                className="max-sm:min-h-[44px] flex h-[38px] items-center justify-center gap-2 rounded-xl bg-blue-600 text-[13px] font-semibold text-white shadow-lg shadow-blue-600/40"
              >
                <ShieldCheck className="h-4 w-4" />
                Administrador
              </div>
              <button
                type="button"
                onClick={entrarOperador}
                disabled={entrandoOperador || loading}
                className="max-sm:min-h-[44px] flex h-[38px] cursor-pointer items-center justify-center gap-2 rounded-xl text-[13px] font-semibold text-white/55 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {entrandoOperador ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <HardHat className="h-4 w-4" />
                )}
                {entrandoOperador ? 'Entrando…' : 'Operador'}
              </button>
            </div>
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

          {/* Correo electrónico */}
          <div className="flex flex-col gap-1">
            <label htmlFor="identifier" className="text-[12.5px] font-medium text-white/70">
              Correo electrónico
            </label>
            <div className="relative flex items-center">
              <Mail className="pointer-events-none absolute left-4 h-[18px] w-[18px] text-white/50" />
              <input
                id="identifier"
                name="identifier"
                type="text"
                required
                autoComplete="username"
                placeholder="tu.correo@empresa.com"
                className={`max-sm:text-base max-sm:min-h-[44px] ${inputClass} pl-12 pr-4`}
              />
            </div>
          </div>

          {/* Contraseña */}
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-[12.5px] font-medium text-white/70">
              Contraseña
            </label>
            <div className="relative flex items-center">
              <Lock className="pointer-events-none absolute left-4 h-[18px] w-[18px] text-white/50" />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className={`max-sm:text-base max-sm:min-h-[44px] ${inputClass} pl-12 pr-14`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="max-sm:min-h-[44px] absolute right-3 flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-white/55 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
              </button>
            </div>
          </div>

          {/* Recordar + recuperar */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <label className="max-sm:min-h-[44px] group flex cursor-pointer select-none items-center gap-2.5">
              <span className="relative flex h-[18px] w-[18px] items-center justify-center">
                <input
                  type="checkbox"
                  name="remember"
                  defaultChecked
                  className="peer h-[18px] w-[18px] cursor-pointer appearance-none rounded-[6px] border border-white/30 bg-white/[0.07] transition checked:border-blue-500 checked:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
                />
                <Check
                  strokeWidth={3}
                  className="pointer-events-none absolute h-3 w-3 text-white opacity-0 transition-opacity peer-checked:opacity-100"
                />
              </span>
              <span className="whitespace-nowrap text-[13px] text-white/70 transition group-hover:text-white">
                Mantener sesión iniciada
              </span>
            </label>

            <Link
              href="/forgot-password"
              className="whitespace-nowrap text-[13px] text-blue-400 underline decoration-blue-400/30 underline-offset-4 transition hover:text-blue-300 hover:decoration-blue-300/70"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          {/* Botón principal — azul */}
          <button
            type="submit"
            disabled={loading || entrandoOperador}
            className="max-sm:min-h-[44px] group mt-1 flex h-[46px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-blue-600 text-[15px] font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/30 disabled:cursor-not-allowed disabled:opacity-60 sm:h-[48px]"
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