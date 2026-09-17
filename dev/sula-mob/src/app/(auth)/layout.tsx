import Image from 'next/image'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-[#06070a]">

      {/* FONDO */}
      <div className="absolute inset-0">
        <Image
          src="/fondonuevosula.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
      </div>

      {/* Oscurecido base */}
      <div className="absolute inset-0 bg-black/40 lg:bg-black/30" />

      {/* Degradado: carga la izquierda, deja la derecha limpia para el vidrio */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/25 to-black/10" />

      {/* Viñeta inferior */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />

      {/* CONTENIDO */}
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[1560px] flex-col items-center justify-center gap-8 px-5 pt-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))] lg:flex-row lg:justify-between lg:gap-16 lg:px-12 lg:py-14 xl:px-20">

        {/* MURO DE CLIENTES — solo escritorio */}
        <section className="hidden min-w-0 flex-1 flex-col gap-9 lg:flex">

          <div className="flex items-center gap-6">
            <span className="whitespace-nowrap text-[13px] font-light uppercase tracking-[0.42em] text-white/85">
              Nuestros clientes
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-white/35 to-transparent" />
          </div>

          <div className="relative h-[200px] w-full xl:h-[250px]">
            <Image
              src="/iconosdeempresa.png"
              alt="Carl's Jr., KFC, Banorte, Suburbia y Promoda Outlet"
              fill
              sizes="55vw"
              className="object-contain object-left drop-shadow-[0_2px_20px_rgba(0,0,0,0.6)]"
            />
          </div>

          <div className="flex flex-col gap-5">
            <span className="h-px w-full bg-gradient-to-r from-white/25 via-white/10 to-transparent" />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-light uppercase tracking-[0.3em] text-white/60">
              <span>Mobiliario comercial</span>
              <span className="text-white/25">•</span>
              <span>Restaurantes</span>
              <span className="text-white/25">•</span>
              <span>Cadenas</span>
              <span className="text-white/25">•</span>
              <span>Retail</span>
            </div>
          </div>
        </section>

        {/* TARJETA */}
        <div className="w-full max-w-[420px] shrink-0">
          {children}
        </div>

        {/* TIRA DE CLIENTES — solo móvil.
            Si no la quieres, borra este bloque completo. */}
        <div className="flex w-full max-w-[420px] flex-col items-center gap-3 lg:hidden">
          <span className="text-[10px] font-light uppercase tracking-[0.34em] text-white/55">
            Nuestros clientes
          </span>
          <div className="relative h-[80px] w-full">
            <Image
              src="/iconosdeempresa.png"
              alt="Carl's Jr., KFC, Banorte, Suburbia y Promoda Outlet"
              fill
              sizes="90vw"
              className="object-contain opacity-90 drop-shadow-[0_2px_14px_rgba(0,0,0,0.6)]"
            />
          </div>
        </div>
      </div>
    </div>
  )
}