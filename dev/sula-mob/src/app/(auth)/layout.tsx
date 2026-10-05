import Image from 'next/image'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-[#06070a]">

      {/* ═══ FONDO INDUSTRIAL ═══ */}
      <div className="absolute inset-0">
        <Image
          src="/fondonuevo.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
      </div>

      {/* Oscurecido base */}
      <div className="absolute inset-0 bg-black/40 lg:bg-black/30" />

      {/* Degradado: carga la izquierda para legibilidad del texto */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/15" />

      {/* Viñeta inferior */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

      {/* ═══ BARRA SUPERIOR — servicios ═══ */}
      <nav className="absolute inset-x-0 top-0 z-10 hidden items-center justify-end gap-6 px-12 pt-6 text-[11px] font-light uppercase tracking-[0.25em] text-white/50 lg:flex xl:px-20">
        <span className="transition hover:text-white/80">Fabricación</span>
        <span className="text-white/25">|</span>
        <span className="transition hover:text-white/80">Corte Láser</span>
        <span className="text-white/25">|</span>
        <span className="transition hover:text-white/80">Tubería</span>
        <span className="text-white/25">|</span>
        <span className="transition hover:text-white/80">Soluciones en Metal</span>
      </nav>

      {/* ═══ CONTENIDO PRINCIPAL ═══ */}
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[1800px] flex-col items-center justify-center gap-8 px-5 pt-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))] lg:flex-row lg:items-stretch lg:justify-between lg:gap-12 lg:px-12 lg:py-14 xl:px-20">

        {/* ═══ LADO IZQUIERDO — Branding alineado a la izquierda ═══ */}
        <section className="hidden min-w-0 flex-1 flex-col items-start justify-between gap-10 lg:flex">

          <Image
            src="/SULA_MOB_logo_transparente.png"
            alt="SULA MOB"
            width={700}
            height={350}
            priority
            className="h-[130px] w-auto object-contain drop-shadow-[0_4px_30px_rgba(0,0,0,0.7)] xl:h-[170px]"
          />

          <div className="flex flex-col items-start gap-5">
            <span className="h-[3px] w-16 rounded-full bg-blue-500" />
            <Image
              src="/letras.png"
              alt="Módulo de Producción"
              width={900}
              height={420}
              sizes="45vw"
              className="h-auto w-[480px] object-contain object-left drop-shadow-[0_2px_20px_rgba(0,0,0,0.5)] xl:w-[600px] 2xl:w-[680px]"
            />
          </div>
        </section>

        {/* ═══ TARJETA LOGIN ═══ */}
        <div className="w-full max-w-[420px] shrink-0 lg:w-[400px] lg:self-center xl:w-[420px]">
          {children}
        </div>

        {/* ═══ MÓVIL — mismo bloque de branding que escritorio ═══ */}
        <div className="flex w-full max-w-[420px] justify-center lg:hidden">
          <Image
            src="/letras.png"
            alt="Módulo de Producción — Carl's Jr., KFC, Banorte, Suburbia y Promoda Outlet"
            width={900}
            height={420}
            sizes="(max-width: 420px) 90vw, 420px"
            className="h-auto w-full max-w-[340px] object-contain drop-shadow-[0_2px_14px_rgba(0,0,0,0.6)]"
          />
        </div>
      </div>
    </div>
  )
}