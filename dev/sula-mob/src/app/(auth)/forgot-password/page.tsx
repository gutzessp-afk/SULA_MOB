'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Mail, ArrowLeft, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { forgotPasswordAction } from './actions'

const inputClass =
  'h-[54px] w-full rounded-2xl border border-white/20 bg-white/[0.07] text-base text-white outline-none backdrop-blur-sm transition-colors placeholder:text-white/50 hover:border-white/30 focus:border-white/50 focus:bg-white/[0.12] focus:ring-4 focus:ring-white/10 sm:h-[56px] sm:text-[15px]'

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccessMsg(null)

    const formData = new FormData(e.currentTarget)
    const result = await forgotPasswordAction(null, formData)

    if (result?.error) {
      setError(result.error)
    } else if (result?.success && result.message) {
      setSuccessMsg(result.message)
    }
    setLoading(false)
  }

  return (
    <div className="relative w-full max-w-md mx-auto">
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
            Recuperar Contraseña
          </h1>
          <p className="mt-1.5 text-[13.5px] text-white/65 sm:text-[14px]">
            Ingresa tu correo institucional para enviarte un enlace de acceso
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          
          {/* Mensaje de Error */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-2xl border border-red-400/35 bg-red-500/20 px-4 py-3 backdrop-blur-sm"
            >
              <AlertCircle className="mt-px h-4 w-4 shrink-0 text-red-300" />
              <span className="text-[13px] leading-relaxed text-red-100">{error}</span>
            </div>
          )}

          {/* Mensaje de Éxito */}
          {successMsg && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-2xl border border-emerald-400/35 bg-emerald-500/20 px-4 py-3 backdrop-blur-sm"
            >
              <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-emerald-300" />
              <span className="text-[13px] leading-relaxed text-emerald-100">{successMsg}</span>
            </div>
          )}

          {/* Input Correo */}
          <div className="relative flex items-center">
            <Mail className="pointer-events-none absolute left-4 h-[18px] w-[18px] text-white/50" />
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="Correo electrónico"
              className={`${inputClass} pl-12 pr-4`}
            />
          </div>

          {/* Botón de Envío */}
          <button
            type="submit"
            disabled={loading}
            className="group mt-2 flex h-[54px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white text-[15px] font-semibold text-neutral-900 shadow-lg shadow-black/30 transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-60 sm:h-[56px]"
          >
            {loading ? (
              <>
                <Loader2 className="h-[18px] w-[18px] animate-spin" />
                Enviando…
              </>
            ) : (
              'Enviar Enlace de Recuperación'
            )}
          </button>

          {/* Volver al Login */}
          <div className="mt-2 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-[13px] text-white/70 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al Inicio de Sesión
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}